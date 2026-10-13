import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { MessageEnvelope, ListMessagesQuery, Status, Artifact } from "../types/envelope.js";
import type { MessageStore, ThreadSummary } from "./types.js";

type BetterSqlite = typeof import("better-sqlite3");

/**
 * SQLite store via better-sqlite3 (optionalDependency).
 * Falls back is handled by createStore — this module throws if native addon missing.
 */
export class SqliteStore implements MessageStore {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private db: any;

  constructor(path: string, Database: BetterSqlite) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL,
        "from" TEXT NOT NULL,
        "to" TEXT NOT NULL,
        priority TEXT NOT NULL,
        body TEXT NOT NULL,
        reply_to TEXT,
        created_at TEXT NOT NULL,
        status TEXT NOT NULL,
        artifacts TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id);
      CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);
      CREATE INDEX IF NOT EXISTS idx_messages_to_status ON messages("to", status);
    `);
  }

  private rowToMsg(row: Record<string, unknown>): MessageEnvelope {
    return {
      id: String(row.id),
      thread_id: String(row.thread_id),
      from: row.from as MessageEnvelope["from"],
      to: row.to as MessageEnvelope["to"],
      priority: row.priority as MessageEnvelope["priority"],
      body: String(row.body),
      reply_to: row.reply_to ? String(row.reply_to) : undefined,
      created_at: String(row.created_at),
      status: row.status as MessageEnvelope["status"],
      artifacts: row.artifacts
        ? (JSON.parse(String(row.artifacts)) as Artifact[])
        : undefined,
    };
  }

  async enqueue(msg: MessageEnvelope): Promise<MessageEnvelope> {
    this.db
      .prepare(
        `INSERT INTO messages
        (id, thread_id, "from", "to", priority, body, reply_to, created_at, status, artifacts)
        VALUES (@id, @thread_id, @from, @to, @priority, @body, @reply_to, @created_at, @status, @artifacts)`,
      )
      .run({
        id: msg.id,
        thread_id: msg.thread_id,
        from: msg.from,
        to: msg.to,
        priority: msg.priority,
        body: msg.body,
        reply_to: msg.reply_to ?? null,
        created_at: msg.created_at,
        status: msg.status,
        artifacts: msg.artifacts ? JSON.stringify(msg.artifacts) : null,
      });
    return msg;
  }

  async list(query: ListMessagesQuery): Promise<MessageEnvelope[]> {
    const clauses: string[] = [];
    const params: Record<string, unknown> = {};
    if (query.thread_id) {
      clauses.push("thread_id = @thread_id");
      params.thread_id = query.thread_id;
    }
    if (query.to) {
      clauses.push('"to" = @to');
      params.to = query.to;
    }
    if (query.from) {
      clauses.push('"from" = @from');
      params.from = query.from;
    }
    if (query.status) {
      clauses.push("status = @status");
      params.status = query.status;
    }
    if (query.since) {
      clauses.push("created_at > @since");
      params.since = query.since;
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const limit = query.limit ?? 50;
    params.limit = limit;
    const rows = this.db
      .prepare(
        `SELECT * FROM (
           SELECT * FROM messages ${where} ORDER BY created_at DESC LIMIT @limit
         ) ORDER BY created_at ASC`,
      )
      .all(params) as Record<string, unknown>[];
    return rows.map((r) => this.rowToMsg(r));
  }

  async get(id: string): Promise<MessageEnvelope | null> {
    const row = this.db.prepare(`SELECT * FROM messages WHERE id = ?`).get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? this.rowToMsg(row) : null;
  }

  async updateStatus(id: string, status: Status): Promise<MessageEnvelope | null> {
    const info = this.db.prepare(`UPDATE messages SET status = ? WHERE id = ?`).run(status, id);
    if (info.changes === 0) return null;
    return this.get(id);
  }

  async getThread(threadId: string, recentLimit = 20): Promise<ThreadSummary> {
    const countRow = this.db
      .prepare(`SELECT COUNT(*) AS c FROM messages WHERE thread_id = ?`)
      .get(threadId) as { c: number };
    const recent = this.db
      .prepare(
        `SELECT * FROM (
           SELECT * FROM messages WHERE thread_id = ? ORDER BY created_at DESC LIMIT ?
         ) ORDER BY created_at ASC`,
      )
      .all(threadId, recentLimit) as Record<string, unknown>[];
    const msgs = recent.map((r) => this.rowToMsg(r));
    const participants = [...new Set(msgs.flatMap((m) => [m.from, m.to]))];
    return {
      thread_id: threadId,
      message_count: countRow.c,
      last_message_at: msgs.length ? msgs[msgs.length - 1]!.created_at : null,
      participants,
      recent: msgs,
    };
  }

  close(): void {
    this.db.close();
  }
}

export async function tryCreateSqliteStore(path: string): Promise<SqliteStore | null> {
  try {
    const mod = await import("better-sqlite3");
    const Database = (mod.default ?? mod) as BetterSqlite;
    return new SqliteStore(path, Database);
  } catch (err) {
    console.warn(
      "[store] better-sqlite3 unavailable, falling back. Reason:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}
