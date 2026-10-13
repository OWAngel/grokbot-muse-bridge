import { describe, it, expect } from "vitest";
import {
  MessageEnvelopeSchema,
  EnqueueMessageSchema,
  validateEnvelope,
  validateEnqueue,
} from "../src/types/envelope.js";

describe("MessageEnvelopeSchema", () => {
  it("accepts a full valid envelope", () => {
    const msg = validateEnvelope({
      id: "550e8400-e29b-41d4-a716-446655440000",
      thread_id: "t1",
      from: "muse",
      to: "grokbot",
      priority: "high",
      body: "hello",
      created_at: "2026-10-13T08:00:00.000Z",
      status: "queued",
      artifacts: [{ kind: "url", ref: "https://example.com", label: "ex" }],
    });
    expect(msg.body).toBe("hello");
    expect(msg.priority).toBe("high");
  });

  it("rejects invalid party", () => {
    const r = MessageEnvelopeSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      thread_id: "t1",
      from: "chatgpt",
      to: "grokbot",
      body: "x",
      created_at: "2026-10-13T08:00:00.000Z",
      status: "queued",
    });
    expect(r.success).toBe(false);
  });

  it("rejects empty body", () => {
    const r = MessageEnvelopeSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      thread_id: "t1",
      from: "muse",
      to: "grokbot",
      body: "",
      created_at: "2026-10-13T08:00:00.000Z",
      status: "queued",
    });
    expect(r.success).toBe(false);
  });
});

describe("EnqueueMessageSchema", () => {
  it("defaults priority to normal", () => {
    const q = validateEnqueue({
      from: "grokbot",
      to: "muse",
      body: "ping",
    });
    expect(q.priority).toBe("normal");
  });

  it("allows optional thread_id", () => {
    const r = EnqueueMessageSchema.safeParse({
      from: "bridge",
      to: "muse",
      body: "note",
    });
    expect(r.success).toBe(true);
  });
});
