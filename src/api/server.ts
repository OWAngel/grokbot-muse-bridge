import { Hono } from "hono";
import { cors } from "hono/cors";
import type { BridgeConfig } from "../config.js";
import type { BridgeService } from "../service.js";
import { bearerAuth } from "./auth.js";
import {
  EnqueueMessageSchema,
  ListMessagesQuerySchema,
} from "../types/envelope.js";
import { deliverToGrokbot } from "../adapters/grokbot.js";
import { ZodError } from "zod";

export function createHttpApp(service: BridgeService, config: BridgeConfig): Hono {
  const app = new Hono();
  app.use("*", cors());

  app.get("/health", (c) =>
    c.json({
      ok: true,
      service: "grokbot-muse-bridge",
      version: "0.1.0",
      public_base_url: config.publicBaseUrl,
      grokbot_webhook_configured: Boolean(
        config.grokbotWebhookUrl && config.grokbotWebhookKey,
      ),
      muse_cli_enabled: config.museCliEnabled,
      store: config.storeBackend,
    }),
  );

  const v1 = new Hono();
  v1.use("*", bearerAuth(config.bridgeToken));

  v1.post("/messages", async (c) => {
    try {
      const body = EnqueueMessageSchema.parse(await c.req.json());
      const deliver = c.req.query("deliver") !== "false";
      const result = await service.enqueue(body, { deliver });
      return c.json(result, 201);
    } catch (err) {
      if (err instanceof ZodError) {
        return c.json({ error: "validation_failed", details: err.flatten() }, 400);
      }
      throw err;
    }
  });

  v1.get("/messages", async (c) => {
    try {
      const query = ListMessagesQuerySchema.parse({
        thread_id: c.req.query("thread_id"),
        since: c.req.query("since"),
        limit: c.req.query("limit"),
        to: c.req.query("to"),
        from: c.req.query("from"),
        status: c.req.query("status"),
      });
      const messages = await service.list(query);
      return c.json({ messages });
    } catch (err) {
      if (err instanceof ZodError) {
        return c.json({ error: "validation_failed", details: err.flatten() }, 400);
      }
      throw err;
    }
  });

  v1.get("/threads/:id", async (c) => {
    const id = c.req.param("id");
    const limit = Number(c.req.query("limit") ?? "20");
    const thread = await service.getThread(id, Number.isFinite(limit) ? limit : 20);
    return c.json(thread);
  });

  /**
   * Internal helper: push a stored message (or inline envelope fields) to Grok webhook.
   * Useful for retries / operator tooling.
   */
  v1.post("/webhooks/grokbot/deliver", async (c) => {
    const payload = (await c.req.json()) as {
      message_id?: string;
      message?: Parameters<typeof deliverToGrokbot>[1];
    };
    let msg = payload.message;
    if (!msg && payload.message_id) {
      const found = await service.get(payload.message_id);
      if (!found) return c.json({ error: "message_not_found" }, 404);
      msg = found;
    }
    if (!msg) {
      return c.json({ error: "provide message_id or message" }, 400);
    }
    const result = await deliverToGrokbot(config, msg);
    if (result.ok && payload.message_id) {
      await service.ack(payload.message_id, "delivered");
    } else if (!result.ok && !result.skipped && payload.message_id) {
      await service.ack(payload.message_id, "failed");
    }
    return c.json(result, result.ok ? 200 : 502);
  });

  v1.post("/messages/:id/ack", async (c) => {
    const id = c.req.param("id");
    const body = (await c.req.json().catch(() => ({}))) as { status?: string };
    const status =
      body.status === "delivered" || body.status === "failed" ? body.status : "acked";
    const updated = await service.ack(id, status);
    if (!updated) return c.json({ error: "not_found" }, 404);
    return c.json(updated);
  });

  app.route("/v1", v1);

  app.onError((err, c) => {
    console.error("[api]", err);
    return c.json({ error: "internal_error", message: err.message }, 500);
  });

  return app;
}
