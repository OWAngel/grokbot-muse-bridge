import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { MemoryStore } from "../src/store/memory.js";
import { JsonFileStore } from "../src/store/json-file.js";
import { BridgeService } from "../src/service.js";
import type { BridgeConfig } from "../src/config.js";
import type { MessageEnvelope } from "../src/types/envelope.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function sample(partial: Partial<MessageEnvelope> = {}): MessageEnvelope {
  return {
    id: randomUUID(),
    thread_id: "thread-a",
    from: "grokbot",
    to: "muse",
    priority: "normal",
    body: "hello muse",
    created_at: new Date().toISOString(),
    status: "queued",
    ...partial,
  };
}

const baseConfig = (): BridgeConfig => ({
  bridgeToken: "test-token",
  publicBaseUrl: "http://127.0.0.1:8787",
  port: 8787,
  mcpPort: null,
  grokbotWebhookUrl: "",
  grokbotWebhookKey: "",
  storeBackend: "memory",
  storePath: ":memory:",
  museCliEnabled: false,
  museCliBin: "muse-cli",
  dataDir: "./data",
});

describe("MemoryStore enqueue/list", () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore();
  });

  it("enqueues and lists by thread", async () => {
    await store.enqueue(sample({ body: "one" }));
    await store.enqueue(sample({ body: "two", thread_id: "thread-b" }));
    const list = await store.list({ thread_id: "thread-a", limit: 50 });
    expect(list).toHaveLength(1);
    expect(list[0]!.body).toBe("one");
  });

  it("filters since and status", async () => {
    const old = sample({
      created_at: "2026-01-01T00:00:00.000Z",
      status: "acked",
    });
    const neu = sample({
      created_at: "2026-10-13T00:00:00.000Z",
      status: "queued",
    });
    await store.enqueue(old);
    await store.enqueue(neu);
    const list = await store.list({
      since: "2026-06-01T00:00:00.000Z",
      status: "queued",
      limit: 50,
    });
    expect(list).toHaveLength(1);
    expect(list[0]!.id).toBe(neu.id);
  });

  it("updates status and thread summary", async () => {
    const m = sample();
    await store.enqueue(m);
    await store.updateStatus(m.id, "acked");
    const got = await store.get(m.id);
    expect(got?.status).toBe("acked");
    const thread = await store.getThread("thread-a");
    expect(thread.message_count).toBe(1);
    expect(thread.participants).toContain("grokbot");
    expect(thread.participants).toContain("muse");
  });
});

describe("JsonFileStore", () => {
  it("persists across instances", async () => {
    const dir = mkdtempSync(join(tmpdir(), "bridge-test-"));
    const path = join(dir, "bridge.json");
    const a = new JsonFileStore(path);
    const msg = sample({ body: "persist-me" });
    await a.enqueue(msg);
    await a.close();

    const b = new JsonFileStore(path);
    const list = await b.list({ limit: 10 });
    expect(list.some((m) => m.body === "persist-me")).toBe(true);
    await b.close();
  });
});

describe("BridgeService enqueue", () => {
  it("fills id/thread/created_at and leaves queued when no webhook", async () => {
    const store = new MemoryStore();
    const service = new BridgeService(store, baseConfig());
    const { message, delivery } = await service.enqueue({
      from: "muse",
      to: "grokbot",
      body: "hi grok",
    });
    expect(message.id).toBeTruthy();
    expect(message.thread_id).toBeTruthy();
    expect(message.status).toBe("queued");
    expect(delivery).toMatchObject({ target: "grokbot", skipped: true });
    const listed = await service.list({ to: "grokbot", limit: 10 });
    expect(listed).toHaveLength(1);
  });

  it("muse path notes mcp inbox", async () => {
    const store = new MemoryStore();
    const service = new BridgeService(store, baseConfig());
    const { delivery } = await service.enqueue({
      from: "grokbot",
      to: "muse",
      body: "hi muse",
    });
    expect(delivery).toMatchObject({
      target: "muse",
      primary: "mcp_inbox",
    });
  });
});
