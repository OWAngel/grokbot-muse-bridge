import { randomUUID } from "node:crypto";
import type { BridgeConfig } from "./config.js";
import type { MessageStore } from "./store/index.js";
import type {
  EnqueueMessage,
  ListMessagesQuery,
  MessageEnvelope,
  Status,
} from "./types/envelope.js";
import { deliverToGrokbot } from "./adapters/grokbot.js";
import { sendViaMuseCli } from "./adapters/muse-cli-optional.js";

export class BridgeService {
  constructor(
    private readonly store: MessageStore,
    private readonly config: BridgeConfig,
  ) {}

  async enqueue(
    input: EnqueueMessage,
    opts?: { deliver?: boolean },
  ): Promise<{ message: MessageEnvelope; delivery?: unknown }> {
    const now = new Date().toISOString();
    const message: MessageEnvelope = {
      id: randomUUID(),
      thread_id: input.thread_id ?? randomUUID(),
      from: input.from,
      to: input.to,
      priority: input.priority ?? "normal",
      body: input.body,
      reply_to: input.reply_to,
      created_at: now,
      status: "queued",
      artifacts: input.artifacts,
    };
    await this.store.enqueue(message);

    let delivery: unknown;
    if (opts?.deliver !== false) {
      delivery = await this.tryDeliver(message);
    }
    return { message, delivery };
  }

  async tryDeliver(message: MessageEnvelope): Promise<unknown> {
    if (message.to === "grokbot") {
      const result = await deliverToGrokbot(this.config, message);
      if (result.ok) {
        await this.store.updateStatus(message.id, "delivered");
        message.status = "delivered";
      } else if (!result.skipped) {
        await this.store.updateStatus(message.id, "failed");
        message.status = "failed";
      }
      return { target: "grokbot", ...result };
    }

    if (message.to === "muse") {
      // Primary path: Muse polls check_inbox via MCP. Optional experimental CLI push.
      const cli = await sendViaMuseCli(this.config, message);
      if (cli.ok) {
        await this.store.updateStatus(message.id, "delivered");
        message.status = "delivered";
      }
      return {
        target: "muse",
        primary: "mcp_inbox",
        note: "Muse should call check_inbox on the bridge MCP connector",
        muse_cli: cli,
      };
    }

    return { target: message.to, skipped: true };
  }

  list(query: ListMessagesQuery) {
    return this.store.list(query);
  }

  getThread(id: string, recentLimit?: number) {
    return this.store.getThread(id, recentLimit);
  }

  async ack(id: string, status: Extract<Status, "acked" | "delivered" | "failed">) {
    return this.store.updateStatus(id, status);
  }

  get(id: string) {
    return this.store.get(id);
  }
}
