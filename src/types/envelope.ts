import { z } from "zod";

/** Parties that may appear in from/to. */
export const PartySchema = z.enum(["grokbot", "muse", "bridge"]);
export type Party = z.infer<typeof PartySchema>;

export const PrioritySchema = z.enum(["high", "normal"]);
export type Priority = z.infer<typeof PrioritySchema>;

export const StatusSchema = z.enum(["queued", "delivered", "acked", "failed"]);
export type Status = z.infer<typeof StatusSchema>;

export const ArtifactSchema = z.object({
  kind: z.enum(["url", "path", "text"]).default("url"),
  ref: z.string().min(1),
  label: z.string().optional(),
});
export type Artifact = z.infer<typeof ArtifactSchema>;

/** Shared message envelope between Grok Bot, Muse, and the bridge. */
export const MessageEnvelopeSchema = z.object({
  id: z.string().uuid(),
  thread_id: z.string().min(1),
  from: PartySchema,
  to: PartySchema,
  priority: PrioritySchema.default("normal"),
  body: z.string().min(1),
  reply_to: z.string().uuid().optional(),
  created_at: z.string().datetime({ offset: true }),
  status: StatusSchema.default("queued"),
  artifacts: z.array(ArtifactSchema).optional(),
});
export type MessageEnvelope = z.infer<typeof MessageEnvelopeSchema>;

/** Client-facing create payload (id/created_at/status filled by bridge). */
export const EnqueueMessageSchema = z.object({
  thread_id: z.string().min(1).optional(),
  from: PartySchema,
  to: PartySchema,
  priority: PrioritySchema.optional().default("normal"),
  body: z.string().min(1),
  reply_to: z.string().uuid().optional(),
  artifacts: z.array(ArtifactSchema).optional(),
});
export type EnqueueMessage = z.infer<typeof EnqueueMessageSchema>;

export const ListMessagesQuerySchema = z.object({
  thread_id: z.string().optional(),
  since: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  to: PartySchema.optional(),
  from: PartySchema.optional(),
  status: StatusSchema.optional(),
});
export type ListMessagesQuery = z.infer<typeof ListMessagesQuerySchema>;

export function validateEnvelope(input: unknown): MessageEnvelope {
  return MessageEnvelopeSchema.parse(input);
}

export function validateEnqueue(input: unknown): EnqueueMessage {
  return EnqueueMessageSchema.parse(input);
}
