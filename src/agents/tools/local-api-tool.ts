import { Type } from "@sinclair/typebox";
import type { OpenClawConfig } from "../../config/config.js";
import { fetchWithSsrFGuard } from "../../infra/net/fetch-guard.js";
import { SsrFBlockedError } from "../../infra/net/ssrf.js";
import { optionalStringEnum, stringEnum } from "../schema/typebox.js";
import { jsonResult, readStringParam, type AnyAgentTool } from "./common.js";
import { DEFAULT_TIMEOUT_SECONDS, readResponseText, resolveTimeoutSeconds } from "./web-shared.js";

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
const LOCAL_API_ACTIONS = ["request", "openapi", "health"] as const;

const LocalApiSchema = Type.Object({
  action: stringEnum(LOCAL_API_ACTIONS),
  path: Type.Optional(Type.String({ description: "Path to request (e.g. /v1/quotes)." })),
  method: optionalStringEnum(HTTP_METHODS, { description: "HTTP method (default: GET)." }),
  query: Type.Optional(
    Type.Record(Type.String(), Type.String(), {
      description: "Query parameters (string values).",
    }),
  ),
  headers: Type.Optional(
    Type.Record(Type.String(), Type.String(), { description: "Extra request headers." }),
  ),
  body: Type.Optional(Type.Unknown({ description: "JSON body for POST/PUT/PATCH requests." })),
  timeoutSeconds: Type.Optional(
    Type.Number({
      description: "Override timeout in seconds.",
      minimum: 1,
    }),
  ),
});

type LocalApiConfig =
  NonNullable<OpenClawConfig["tools"]> extends infer Tools
    ? Tools extends { mt5?: infer Mt5; openbb?: infer Openbb }
      ? Mt5 | Openbb
      : undefined
    : undefined;

type LocalApiToolOptions = {
  label: string;
  name: string;
  description: string;
  envVar: string;
  defaultBaseUrl: string;
  config?: OpenClawConfig;
  configKey: "mt5" | "openbb";
};

type ResolvedLocalApiConfig = {
  enabled: boolean;
  baseUrl: string;
  timeoutSeconds: number;
  headers: Record<string, string>;
  allowRemote: boolean;
  allowPrivateNetwork: boolean;
  allowedHostnames: string[];
};

function resolveLocalApiConfig(options: LocalApiToolOptions): ResolvedLocalApiConfig {
  const toolConfig: LocalApiConfig | undefined = options.config?.tools?.[options.configKey];
  const toolConfigObject =
    toolConfig && typeof toolConfig === "object" ? (toolConfig as Record<string, unknown>) : null;
  const baseUrlRaw =
    (toolConfigObject && typeof toolConfigObject.baseUrl === "string"
      ? toolConfigObject.baseUrl
      : undefined) ??
    process.env[options.envVar] ??
    options.defaultBaseUrl;
  const baseUrl = typeof baseUrlRaw === "string" ? baseUrlRaw.trim() : options.defaultBaseUrl;
  const enabled =
    toolConfigObject && typeof toolConfigObject.enabled === "boolean"
      ? toolConfigObject.enabled
      : true;
  const timeoutSeconds = resolveTimeoutSeconds(
    toolConfigObject?.timeoutSeconds,
    DEFAULT_TIMEOUT_SECONDS,
  );
  const headers =
    toolConfigObject && typeof toolConfigObject.headers === "object" && toolConfigObject.headers
      ? (toolConfigObject.headers as Record<string, string>)
      : {};
  const allowRemote =
    toolConfigObject && typeof toolConfigObject.allowRemote === "boolean"
      ? toolConfigObject.allowRemote
      : false;
  const allowPrivateNetwork =
    toolConfigObject && typeof toolConfigObject.allowPrivateNetwork === "boolean"
      ? toolConfigObject.allowPrivateNetwork
      : true;
  const allowedHostnames =
    toolConfigObject && Array.isArray(toolConfigObject.allowedHostnames)
      ? toolConfigObject.allowedHostnames.filter(
          (entry): entry is string => typeof entry === "string",
        )
      : [];

  return {
    enabled,
    baseUrl,
    timeoutSeconds,
    headers,
    allowRemote,
    allowPrivateNetwork,
    allowedHostnames,
  };
}

function isLocalHost(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "0.0.0.0" ||
    normalized.endsWith(".localhost")
  );
}

function buildUrl(params: { baseUrl: URL; path: string; query?: Record<string, string> }): URL {
  const { baseUrl, path, query } = params;
  const target = new URL(path, baseUrl);
  if (target.origin !== baseUrl.origin) {
    throw new Error("Path must resolve to the configured base URL.");
  }
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (typeof value === "string" && value.trim()) {
        target.searchParams.set(key, value);
      }
    }
  }
  return target;
}

function parseJsonIfPossible(text: string): unknown {
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function createLocalApiTool(options: LocalApiToolOptions): AnyAgentTool | null {
  const resolved = resolveLocalApiConfig(options);
  if (!resolved.enabled) {
    return null;
  }

  return {
    label: options.label,
    name: options.name,
    description: options.description,
    parameters: LocalApiSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const action = readStringParam(params, "action", { required: true });
      const baseUrl = new URL(resolved.baseUrl);

      if (!resolved.allowRemote && !isLocalHost(baseUrl.hostname)) {
        throw new Error(
          `Blocked non-local base URL (${baseUrl.hostname}). Set tools.${options.configKey}.allowRemote=true to override.`,
        );
      }

      const path =
        action === "openapi"
          ? "/openapi.json"
          : action === "health"
            ? "/health"
            : readStringParam(params, "path", { required: true });
      const method =
        typeof params.method === "string" && params.method.trim()
          ? params.method.toUpperCase()
          : "GET";
      if (!HTTP_METHODS.includes(method as (typeof HTTP_METHODS)[number])) {
        throw new Error(`Unsupported method: ${method}`);
      }

      const query =
        params.query && typeof params.query === "object"
          ? (params.query as Record<string, string>)
          : undefined;
      const url = buildUrl({ baseUrl, path, query });
      const body = params.body;
      const headers: Record<string, string> = {
        ...resolved.headers,
        ...(params.headers && typeof params.headers === "object"
          ? (params.headers as Record<string, string>)
          : {}),
      };

      let payload: string | undefined;
      if (body !== undefined && body !== null) {
        if (typeof body === "string") {
          payload = body;
        } else {
          payload = JSON.stringify(body);
          if (!headers["content-type"]) {
            headers["content-type"] = "application/json";
          }
        }
      }

      try {
        const { response, finalUrl, release } = await fetchWithSsrFGuard({
          url: url.toString(),
          init: {
            method,
            headers,
            body: payload,
          },
          timeoutMs: resolveTimeoutSeconds(params.timeoutSeconds, resolved.timeoutSeconds) * 1000,
          policy: {
            allowPrivateNetwork: resolved.allowPrivateNetwork,
            allowedHostnames: resolved.allowedHostnames,
          },
        });

        try {
          const contentType = response.headers.get("content-type") ?? "";
          const text = await readResponseText(response);
          const data =
            contentType.includes("application/json") || contentType.includes("+json")
              ? parseJsonIfPossible(text)
              : text;
          return jsonResult({
            ok: response.ok,
            status: response.status,
            url: finalUrl,
            contentType,
            data,
          });
        } finally {
          await release();
        }
      } catch (error) {
        if (error instanceof SsrFBlockedError) {
          throw new Error(`Request blocked by SSRF policy: ${error.message}`, { cause: error });
        }
        throw error;
      }
    },
  };
}
