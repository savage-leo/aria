import type { OpenClawConfig } from "../../config/config.js";
import type { AnyAgentTool } from "./common.js";
import { createLocalApiTool } from "./local-api-tool.js";

export function createOpenBbTool(options?: { config?: OpenClawConfig }): AnyAgentTool | null {
  return createLocalApiTool({
    label: "OpenBB",
    name: "openbb",
    description:
      "Call the local OpenBB API for analysis (request/openapi/health). Executes against localhost:6900 by default.",
    envVar: "OPENBB_API_URL",
    defaultBaseUrl: "http://localhost:6900",
    config: options?.config,
    configKey: "openbb",
  });
}
