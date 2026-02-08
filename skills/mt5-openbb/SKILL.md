---
name: mt5-openbb
description: Use a local MT5 bridge for trading + the OpenBB API (localhost:6900) for market analysis.
metadata: { "openclaw": { "emoji": "📈", "requires": { "bins": ["curl", "jq"] } } }
---

# MT5 + OpenBB (localhost)

This skill connects **two local services**:

1. **MT5 Python bridge** → execution + position management (local-only)
2. **OpenBB API** → analysis, market data, news (local-only at `http://localhost:6900`)

The assistant should:

- Use **OpenBB** for analysis, signals, and news.
- Use **MT5** for execution and portfolio/position control.

No MT5 login credentials are handled here; the bridge should connect to an already-open terminal session.

## Configure endpoints (recommended)

Set environment variables in the runtime that runs OpenClaw (gateway / agent) so the tool calls are consistent:

```bash
export MT5_BRIDGE_URL="http://localhost:5001"
export OPENBB_API_URL="http://localhost:6900"
```

> If you use a different port for MT5, update `MT5_BRIDGE_URL`.

## MT5 bridge auto-start (production)

When the OpenClaw gateway starts, it will auto-start the MT5 Python bridge by default.
You can configure it in your OpenClaw config:

```yaml
tools:
  mt5:
    bridge:
      enabled: true
      pythonBin: python3
      scriptPath: scripts/mt5-bridge/mt5_bridge.py
      host: 127.0.0.1
      port: 5001
```

The bridge requires the official MetaTrader5 Python package:

```bash
pip install MetaTrader5
```

Or install from the bundled requirements file:

```bash
pip install -r scripts/mt5-bridge/requirements.txt
```

To disable auto-start (if you manage the bridge yourself):

```bash
export OPENCLAW_SKIP_MT5_BRIDGE=1
```

## Enable the tools in your config (if you use allowlists)

If you use tool allowlists, add the new tools so the assistant can call them:

```yaml
tools:
  alsoAllow:
    - mt5
    - openbb
```

You can also override the base URLs in config:

```yaml
tools:
  mt5:
    baseUrl: http://localhost:5001
  openbb:
    baseUrl: http://localhost:6900
```

## OpenClaw tool usage

Use these tools from chat:

- `openbb` → analysis + market data
- `mt5` → execution + position management

Example calls:

```json
{ "tool": "openbb", "action": "openapi" }
```

```json
{ "tool": "mt5", "action": "health" }
```

```json
{
  "tool": "openbb",
  "action": "request",
  "path": "/api/v1/market/quotes",
  "query": { "symbol": "EURUSD" }
}
```

```json
{ "tool": "mt5", "action": "request", "path": "/positions" }
```

## OpenBB API quick checks

Discover endpoints from the running OpenBB server:

```bash
curl -s "$OPENBB_API_URL/openapi.json" | jq '.paths | keys'
```

Health check (if available):

```bash
curl -s "$OPENBB_API_URL/health" | jq .
```

Example pattern to request data (replace with a valid path from `openapi.json`):

```bash
curl -s "$OPENBB_API_URL/api/v1/market/quotes?symbol=EURUSD" | jq .
```

## MT5 bridge expectations

The MT5 bridge should expose **local REST endpoints** for:

- Live prices / ticks
- Account info
- Positions and orders
- Trade execution (market/limit/stop)
- Position management (modify/close)

Discover the bridge endpoints (if OpenAPI is available):

```bash
curl -s "$MT5_BRIDGE_URL/openapi.json" | jq '.paths | keys'
```

Health check (if available):

```bash
curl -s "$MT5_BRIDGE_URL/health" | jq .
```

### Example execution flow (conceptual)

1. Query market context from OpenBB.
2. Read live price / account state from MT5 bridge.
3. Execute trade via MT5 bridge.
4. Confirm position + manage risk (SL/TP) via MT5 bridge.

Because endpoints vary by bridge implementation, **always refer to the bridge’s OpenAPI or docs** before sending requests.

## Optional AI provider configuration

If you want to route analysis through additional models:

- **QROQ AI API** (if available in your environment): set its key in your OpenClaw runtime env, or in your local config manager.
- **Ollama** (local models): ensure the Ollama server is running and accessible from your OpenClaw host.

Example (local Ollama):

```bash
export OLLAMA_HOST="http://localhost:11434"
```

## Usage guidance for the assistant

- Use **OpenBB** for analysis, correlations, fundamentals, and news.
- Use **MT5** for execution and position lifecycle management.
- If an endpoint is missing or unclear, fetch `/openapi.json` and adjust.
- Keep MT5 calls local-only (no remote exposure).

## Suggested companion skills

Browse and install additional OpenClaw skills from:

https://github.com/VoltAgent/awesome-openclaw-skills
