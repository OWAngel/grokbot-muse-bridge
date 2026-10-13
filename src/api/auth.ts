import type { Context, Next } from "hono";
import { timingSafeEqual } from "node:crypto";

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) {
    // still compare to avoid trivial timing oracle on length alone for short tokens
    timingSafeEqual(ba, ba);
    return false;
  }
  return timingSafeEqual(ba, bb);
}

export function bearerAuth(token: string) {
  return async (c: Context, next: Next) => {
    if (!token) {
      return c.json({ error: "BRIDGE_TOKEN not configured on server" }, 500);
    }
    const header = c.req.header("authorization") ?? "";
    const match = /^Bearer\s+(.+)$/i.exec(header);
    if (!match || !safeEqual(match[1]!, token)) {
      return c.json({ error: "unauthorized" }, 401);
    }
    await next();
  };
}
