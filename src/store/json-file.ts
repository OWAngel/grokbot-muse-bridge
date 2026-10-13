import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { dirname } from "node:path";
import type { MessageEnvelope, ListMessagesQuery, Status } from "../types/envelope.js";
import type { MessageStore, ThreadSummary } from "./types.js";
import { MemoryStore } from "./memory.js";

interface PersistShape {
  messages: MessageEnvelope[];
}

/**
 * JSON file store with in-memory index. Safe for single-process use.
 * Atomic write via temp file + rename.
 */
export class JsonFileStore implements MessageStore {
  private inner = new MemoryStore();
  private ready: Promise<void>;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly path: string) {
    this.ready = this.load();
  }

  private async load(): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    try {
      const raw = await readFile(this.path, "utf8");
      const parsed = JSON.parse(raw) as PersistShape;
      for (const m of parsed.messages ?? []) {
        await this.inner.enqueue(m);
      }
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code !== "ENOENT") throw err;
      await this.persist();
    }
  }

  private async persist(): Promise<void> {
    const messages = await this.inner.list({ limit: 10_000 });
    const body = JSON.stringify({ messages } satisfies PersistShape, null, 2);
    const tmp = `${this.path}.${process.pid}.tmp`;
    await writeFile(tmp, body, "utf8");
    await rename(tmp, this.path);
  }

  private enqueueWrite(): Promise<void> {
    this.writeQueue = this.writeQueue.then(() => this.persist()).catch((err) => {
      console.error("[json-store] persist failed", err);
    });
    return this.writeQueue;
  }

  async enqueue(msg: MessageEnvelope): Promise<MessageEnvelope> {
    await this.ready;
    const out = await this.inner.enqueue(msg);
    await this.enqueueWrite();
    return out;
  }

  async list(query: ListMessagesQuery): Promise<MessageEnvelope[]> {
    await this.ready;
    return this.inner.list(query);
  }

  async get(id: string): Promise<MessageEnvelope | null> {
    await this.ready;
    return this.inner.get(id);
  }

  async updateStatus(id: string, status: Status): Promise<MessageEnvelope | null> {
    await this.ready;
    const out = await this.inner.updateStatus(id, status);
    if (out) await this.enqueueWrite();
    return out;
  }

  async getThread(threadId: string, recentLimit = 20): Promise<ThreadSummary> {
    await this.ready;
    return this.inner.getThread(threadId, recentLimit);
  }

  async close(): Promise<void> {
    await this.ready;
    await this.writeQueue;
  }
}
