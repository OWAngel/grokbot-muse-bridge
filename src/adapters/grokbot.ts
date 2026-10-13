import type { BridgeConfig } from "../config.js";
import type { MessageEnvelope } from "../types/envelope.js";

/**
 * Payload fields the Grok Bot webhook Routine should expect.
 * Official docs: POST with Authorization Bearer <key>; optional X-Automation-Key
 * (some Bot UI skills send both). Body is arbitrary JSON — the routine prompt
 * receives it inside the webhook wake as untrusted data.
 */
export interface GrokbotWebhookBody {
  source: "grokbot-muse-bridge";
  event: "muse_message";
  message_id: string;
  thread_id: string;
  from: string;
  to: string;
  priority: string;
  body: string;
  reply_to?: string;
  created_at: string;
  artifacts?: MessageEnvelope["artifacts"];
}

export function toGrokbotWebhookBody(msg: MessageEnvelope): GrokbotWebhookBody {
  return {
    source: "grokbot-muse-bridge",
    event: "muse_message",
    message_id: msg.id,
    thread_id: msg.thread_id,
    from: msg.from,
    to: msg.to,
    priority: msg.priority,
    body: msg.body,
    reply_to: msg.reply_to,
    created_at: msg.created_at,
    artifacts: msg.artifacts,
  };
}

export interface DeliverResult {
  ok: boolean;
  status?: number;
  error?: string;
  skipped?: boolean;
}

/**
 * Deliver a bridge message to Grok Bot via its webhook Routine URL.
 */
export async function deliverToGrokbot(
  config: BridgeConfig,
  msg: MessageEnvelope,
  fetchImpl: typeof fetch = fetch,
): Promise<DeliverResult> {
  if (!config.grokbotWebhookUrl || !config.grokbotWebhookKey) {
    return {
      ok: false,
      skipped: true,
      error:
        "GROKBOT_WEBHOOK_URL / GROKBOT_WEBHOOK_KEY not configured — message stays queued for manual pickup",
    };
  }

  const body = toGrokbotWebhookBody(msg);
  try {
    const res = await fetchImpl(config.grokbotWebhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.grokbotWebhookKey}`,
        "X-Automation-Key": config.grokbotWebhookKey,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8_000),
    });
    if (res.status === 200) {
      return { ok: true, status: 200 };
    }
    const text = await res.text().catch(() => "");
    return {
      ok: false,
      status: res.status,
      error: `Grok webhook returned ${res.status}: ${text.slice(0, 200)}`,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
