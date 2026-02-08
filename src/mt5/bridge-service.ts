import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { OpenClawConfig } from "../config/config.js";
import { isTruthyEnvValue } from "../infra/env.js";
import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("mt5-bridge");

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 5001;

export type Mt5BridgeHandle = {
  stop: () => Promise<void>;
};

type Mt5BridgeConfig =
  NonNullable<OpenClawConfig["tools"]> extends infer Tools
    ? Tools extends { mt5?: infer Mt5 }
      ? Mt5
      : undefined
    : undefined;

type Mt5BridgeConfigObject = {
  bridge?: {
    enabled?: boolean;
    pythonBin?: string;
    scriptPath?: string;
    host?: string;
    port?: number;
    env?: Record<string, string>;
  };
};

type ResolvedMt5BridgeConfig = {
  enabled: boolean;
  pythonBin: string;
  scriptPath: string;
  host: string;
  port: number;
  env: Record<string, string>;
};

function resolveBridgeConfig(cfg: OpenClawConfig): ResolvedMt5BridgeConfig {
  const mt5Config: Mt5BridgeConfig | undefined = cfg.tools?.mt5;
  const mt5Object =
    mt5Config && typeof mt5Config === "object" ? (mt5Config as Mt5BridgeConfigObject) : null;
  const bridge = mt5Object?.bridge ?? {};
  const envPort = process.env.MT5_BRIDGE_PORT;
  const parsedEnvPort = envPort ? Number.parseInt(envPort, 10) : undefined;

  return {
    enabled: bridge.enabled ?? true,
    pythonBin: bridge.pythonBin?.trim() || process.env.MT5_BRIDGE_PYTHON || "python3",
    scriptPath:
      bridge.scriptPath?.trim() ||
      process.env.MT5_BRIDGE_SCRIPT ||
      path.resolve("scripts/mt5-bridge/mt5_bridge.py"),
    host: bridge.host?.trim() || process.env.MT5_BRIDGE_HOST || DEFAULT_HOST,
    port: bridge.port ?? parsedEnvPort ?? DEFAULT_PORT,
    env: bridge.env ?? {},
  };
}

export function startMt5Bridge(cfg: OpenClawConfig): Mt5BridgeHandle | null {
  if (isTruthyEnvValue(process.env.OPENCLAW_SKIP_MT5_BRIDGE)) {
    log.info("Skipping MT5 bridge (OPENCLAW_SKIP_MT5_BRIDGE=1)");
    return null;
  }
  const bridge = resolveBridgeConfig(cfg);
  if (!bridge.enabled) {
    log.info("MT5 bridge disabled via config (tools.mt5.bridge.enabled=false)");
    return null;
  }
  if (!Number.isFinite(bridge.port) || bridge.port <= 0) {
    log.warn("MT5 bridge port invalid; skipping start");
    return null;
  }
  if (!fs.existsSync(bridge.scriptPath)) {
    log.warn(`MT5 bridge script not found at ${bridge.scriptPath}`);
    return null;
  }

  const env = {
    ...process.env,
    MT5_BRIDGE_HOST: bridge.host,
    MT5_BRIDGE_PORT: String(bridge.port),
    ...bridge.env,
  };

  const child = spawn(bridge.pythonBin, [bridge.scriptPath], {
    stdio: ["ignore", "pipe", "pipe"] as const,
    env,
  });

  child.stdout.on("data", (chunk: Buffer) => {
    log.info(chunk.toString().trim());
  });
  child.stderr.on("data", (chunk: Buffer) => {
    log.warn(chunk.toString().trim());
  });
  child.on("error", (err: Error) => {
    log.error(`failed to start MT5 bridge: ${String(err)}`);
  });
  child.on("exit", (code: number | null, signal: NodeJS.Signals | null) => {
    log.warn(`MT5 bridge exited (code=${code ?? "null"} signal=${signal ?? "null"})`);
  });

  log.info(`MT5 bridge started on ${bridge.host}:${bridge.port}`);

  return {
    stop: async () => {
      if (child.killed) {
        return;
      }
      child.kill("SIGTERM");
      await new Promise<void>((resolve) => setTimeout(resolve, 300));
      if (!child.killed) {
        child.kill("SIGKILL");
      }
    },
  };
}
