#!/usr/bin/env node
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { getRequestListener } from "@hono/node-server";
import { loadConfig } from "./config.js";
import { createStore } from "./store/index.js";
import { BridgeService } from "./service.js";
import { createHttpApp } from "./api/server.js";
import { handleMcpHttpRequest } from "./adapters/muse-mcp.js";

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  if (chunks.length === 0) return undefined;
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

async function main(): Promise<void> {
  const config = loadConfig();
  const store = await createStore(config);
  const service = new BridgeService(store, config);
  const app = createHttpApp(service, config);
  const honoListener = getRequestListener(app.fetch);

  const mcpOnSamePort = config.mcpPort === null;
  const mcpPath = "/mcp";

  const handler = async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    if (mcpOnSamePort && url.pathname === mcpPath) {
      // Auth for MCP: same Bearer BRIDGE_TOKEN (Muse Custom Connector can send headers)
      const auth = req.headers.authorization ?? "";
      const ok =
        auth.toLowerCase().startsWith("bearer ") &&
        auth.slice(7) === config.bridgeToken;
      if (!ok) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "unauthorized" }));
        return;
      }
      const body =
        req.method === "POST" || req.method === "PUT" ? await readJsonBody(req) : undefined;
      await handleMcpHttpRequest(service, req, res, body);
      return;
    }
    return honoListener(req, res);
  };

  const server = createServer(handler);
  await new Promise<void>((resolve) => {
    server.listen(config.port, () => resolve());
  });
  console.log(
    `[bridge] HTTP API listening on ${config.publicBaseUrl} (port ${config.port})`,
  );
  if (mcpOnSamePort) {
    console.log(`[bridge] MCP streamable HTTP at ${config.publicBaseUrl}${mcpPath}`);
  }

  let mcpServer: ReturnType<typeof createServer> | null = null;
  if (!mcpOnSamePort && config.mcpPort !== null) {
    mcpServer = createServer(async (req, res) => {
      const auth = req.headers.authorization ?? "";
      const ok =
        auth.toLowerCase().startsWith("bearer ") &&
        auth.slice(7) === config.bridgeToken;
      if (!ok) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "unauthorized" }));
        return;
      }
      const body =
        req.method === "POST" || req.method === "PUT" ? await readJsonBody(req) : undefined;
      await handleMcpHttpRequest(service, req, res, body);
    });
    await new Promise<void>((resolve) => {
      mcpServer!.listen(config.mcpPort!, () => resolve());
    });
    console.log(`[bridge] MCP streamable HTTP on port ${config.mcpPort} (path /)`);
  }

  const shutdown = async () => {
    console.log("[bridge] shutting down…");
    await new Promise<void>((resolve, reject) =>
      server.close((e) => (e ? reject(e) : resolve())),
    );
    if (mcpServer) {
      await new Promise<void>((resolve, reject) =>
        mcpServer!.close((e) => (e ? reject(e) : resolve())),
      );
    }
    await store.close?.();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

main().catch((err) => {
  console.error("[bridge] fatal", err);
  process.exit(1);
});
