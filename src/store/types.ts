import type { MessageEnvelope, ListMessagesQuery, Status } from "../types/envelope.js";

export interface ThreadSummary {
  thread_id: string;
  message_count: number;
  last_message_at: string | null;
  participants: string[];
  recent: MessageEnvelope[];
}

export interface MessageStore {
  enqueue(msg: MessageEnvelope): Promise<MessageEnvelope>;
  list(query: ListMessagesQuery): Promise<MessageEnvelope[]>;
  get(id: string): Promise<MessageEnvelope | null>;
  updateStatus(id: string, status: Status): Promise<MessageEnvelope | null>;
  getThread(threadId: string, recentLimit?: number): Promise<ThreadSummary>;
  close?(): Promise<void> | void;
}
