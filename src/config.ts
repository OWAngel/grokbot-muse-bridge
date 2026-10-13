import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";

loadDotenv();

export type StoreBackend = "memory" | "json" | "sqlite";

export interface BridgeConfig {
  bridgeToken: string;
  publicBaseUrl: string;
  port: number;
  mcpPort: number | null;
  grokbotWebhookUrl: string;
  grokbotWebhookKey: string;
  storeBackend: StoreBackend;
  storePath: string;
  museCliEnabled: boolean;
  museCliBin: string;
  dataDir: string;
}

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === "") {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

function bool(name: string, fallback = false): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
}

export function loadConfig(opts?: { allowMissingToken?: boolean }): BridgeConfig {
  const allowMissingToken = opts?.allowMissingToken ?? false;
  const dataDir = resolve(process.env.DATA_DIR ?? "./data");
  const storeBackend = (process.env.STORE_BACKEND ?? "json") as StoreBackend;
  if (!["memory", "json", "sqlite"].includes(storeBackend)) {
    throw new Error(`Invalid STORE_BACKEND: ${storeBackend}`);
  }

  const port = Number(process.env.PORT ?? "8787");
  const mcpRaw = process.env.MCP_PORT;
  const mcpPort =
    mcpRaw === undefined || mcpRaw === "" || Number(mcpRaw) === port
      ? null
      : Number(mcpRaw);

  let bridgeToken = process.env.BRIDGE_TOKEN ?? "";
  if (!bridgeToken && !allowMissingToken) {
    bridgeToken = required("BRIDGE_TOKEN");
  }

  const defaultStore =
    storeBackend === "sqlite"
      ? resolve(dataDir, "bridge.db")
      : resolve(dataDir, "bridge.json");

  return {
    bridgeToken,
    publicBaseUrl: (process.env.PUBLIC_BASE_URL ?? `http://127.0.0.1:${port}`).replace(
      /\/$/,
      "",
    ),
    port,
    mcpPort,
    grokbotWebhookUrl: process.env.GROKBOT_WEBHOOK_URL ?? "",
    grokbotWebhookKey: process.env.GROKBOT_WEBHOOK_KEY ?? "",
    storeBackend,
    storePath: resolve(process.env.STORE_PATH ?? defaultStore),
    museCliEnabled: bool("MUSE_CLI_ENABLED", false),
    museCliBin: process.env.MUSE_CLI_BIN ?? "muse-cli",
    dataDir,
  };
}
