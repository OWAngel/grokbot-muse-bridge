import type { MessageEnvelope, ListMessagesQuery, Status } from "../types/envelope.js";
import type { MessageStore, ThreadSummary } from "./types.js";

export class MemoryStore implements MessageStore {
  private messages: MessageEnvelope[] = [];

  async enqueue(msg: MessageEnvelope): Promise<MessageEnvelope> {
    this.messages.push(msg);
    return msg;
  }

  async list(query: ListMessagesQuery): Promise<MessageEnvelope[]> {
    let rows = [...this.messages];
    if (query.thread_id) rows = rows.filter((m) => m.thread_id === query.thread_id);
    if (query.to) rows = rows.filter((m) => m.to === query.to);
    if (query.from) rows = rows.filter((m) => m.from === query.from);
    if (query.status) rows = rows.filter((m) => m.status === query.status);
    if (query.since) {
      const since = Date.parse(query.since);
      rows = rows.filter((m) => Date.parse(m.created_at) > since);
    }
    rows.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
    const limit = query.limit ?? 50;
    return rows.slice(-limit);
  }

  async get(id: string): Promise<MessageEnvelope | null> {
    return this.messages.find((m) => m.id === id) ?? null;
  }

  async updateStatus(id: string, status: Status): Promise<MessageEnvelope | null> {
    const msg = this.messages.find((m) => m.id === id);
    if (!msg) return null;
    msg.status = status;
    return msg;
  }

  async getThread(threadId: string, recentLimit = 20): Promise<ThreadSummary> {
    const all = this.messages
      .filter((m) => m.thread_id === threadId)
      .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
    const participants = [...new Set(all.flatMap((m) => [m.from, m.to]))];
    return {
      thread_id: threadId,
      message_count: all.length,
      last_message_at: all.length ? all[all.length - 1]!.created_at : null,
      participants,
      recent: all.slice(-recentLimit),
    };
  }
}
