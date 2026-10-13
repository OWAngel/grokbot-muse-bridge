import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import type { BridgeService } from "../service.js";
import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * Muse attaches this MCP server via Custom Connector (streamable HTTP).
 * Tools:
 *  - send_to_grokbot (write): enqueue Muse → Grok
 *  - check_inbox (read): pending messages for Muse
 *  - ack_message (write): mark delivered/acked
 *  - get_thread (read)
 */
export function createMuseMcpServer(service: BridgeService): McpServer {
  const server = new McpServer({
    name: "grokbot-muse-bridge",
    version: "0.1.0",
  });

  server.tool(
    "send_to_grokbot",
    "Send a message from Muse to Grok Bot via the bridge (sensitive write). Triggers Grok webhook when configured.",
    {
      body: z.string().min(1).describe("Message body text"),
      thread_id: z.string().optional().describe("Existing thread id; omit to start a new thread"),
      priority: z.enum(["high", "normal"]).optional().describe("Delivery priority"),
      reply_to: z.string().uuid().optional().describe("Optional parent message id"),
    },
    async ({ body, thread_id, priority, reply_to }) => {
      const { message, delivery } = await service.enqueue({
        from: "muse",
        to: "grokbot",
        body,
        thread_id,
        priority: priority ?? "normal",
        reply_to,
      });
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ message, delivery }, null, 2),
          },
        ],
      };
    },
  );

  server.tool(
    "check_inbox",
    "List pending (queued) messages for Muse from Grok Bot / the bridge.",
    {
      thread_id: z.string().optional(),
      limit: z.number().int().min(1).max(100).optional(),
      since: z.string().optional().describe("ISO timestamp; only newer messages"),
      include_delivered: z
        .boolean()
        .optional()
        .describe("If true, also return delivered (not only queued)"),
    },
    async ({ thread_id, limit, since, include_delivered }) => {
      const queued = await service.list({
        to: "muse",
        thread_id,
        since,
        limit: limit ?? 50,
        status: include_delivered ? undefined : "queued",
      });
      // When include_delivered, filter client-side to muse-destined statuses of interest
      const messages = include_delivered
        ? (await service.list({ to: "muse", thread_id, since, limit: limit ?? 50 })).filter(
            (m) => m.status === "queued" || m.status === "delivered",
          )
        : queued;
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ count: messages.length, messages }, null, 2),
          },
        ],
      };
    },
  );

  server.tool(
    "ack_message",
    "Acknowledge a message (mark delivered or acked).",
    {
      message_id: z.string().uuid(),
      status: z.enum(["acked", "delivered", "failed"]).default("acked"),
    },
    async ({ message_id, status }) => {
      const updated = await service.ack(message_id, status);
      if (!updated) {
        return {
          content: [{ type: "text" as const, text: `Message not found: ${message_id}` }],
          isError: true,
        };
      }
      return {
        content: [{ type: "text" as const, text: JSON.stringify(updated, null, 2) }],
      };
    },
  );

  server.tool(
    "get_thread",
    "Get thread summary and recent messages.",
    {
      thread_id: z.string().min(1),
      limit: z.number().int().min(1).max(100).optional(),
    },
    async ({ thread_id, limit }) => {
      const thread = await service.getThread(thread_id, limit ?? 20);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(thread, null, 2) }],
      };
    },
  );

  return server;
}

/**
 * Handle a single Streamable HTTP MCP request (stateless per-request transport).
 */
export async function handleMcpHttpRequest(
  service: BridgeService,
  req: IncomingMessage,
  res: ServerResponse,
  parsedBody?: unknown,
): Promise<void> {
  const server = createMuseMcpServer(service);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, parsedBody);
}
