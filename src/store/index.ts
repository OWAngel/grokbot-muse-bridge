import type { BridgeConfig } from "../config.js";
import type { MessageStore } from "./types.js";
import { MemoryStore } from "./memory.js";
import { JsonFileStore } from "./json-file.js";
import { tryCreateSqliteStore } from "./sqlite.js";

export type { MessageStore, ThreadSummary } from "./types.js";
export { MemoryStore } from "./memory.js";
export { JsonFileStore } from "./json-file.js";

export async function createStore(config: BridgeConfig): Promise<MessageStore> {
  switch (config.storeBackend) {
    case "memory":
      return new MemoryStore();
    case "sqlite": {
      const sqlite = await tryCreateSqliteStore(config.storePath);
      if (sqlite) return sqlite;
      console.warn(`[store] using json file at ${config.storePath.replace(/\.db$/, ".json")}`);
      return new JsonFileStore(config.storePath.replace(/\.db$/, ".json"));
    }
    case "json":
    default:
      return new JsonFileStore(config.storePath);
  }
}
