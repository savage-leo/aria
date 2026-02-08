import type { OpenClawConfig } from "../../config/config.js";
import type { AnyAgentTool } from "./common.js";
import { createLocalApiTool } from "./local-api-tool.js";

export function createMt5Tool(options?: { config?: OpenClawConfig }): AnyAgentTool | null {
  return createLocalApiTool({
    label: "MT5",
    name: "mt5",
    description:
      "Call the local MT5 bridge for trading (request/openapi/health). Executes against a local REST bridge.",
    envVar: "MT5_BRIDGE_URL",
    defaultBaseUrl: "http://localhost:5001",
    config: options?.config,
    configKey: "mt5",
  });
}
