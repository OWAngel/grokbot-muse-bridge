# AGENTS.md — grokbot-muse-bridge

Brief for coding agents working on this repo.

## What this is

Async, threaded message bridge between **Grok Bot** and **Meta Muse**. Not an official Meta A2A API. Muse has no public peer inbox — Muse integrates via **MCP Custom Connector**; Grok uses **webhook Routine** inbound + HTTP POST outbound.

## Hard rules

- Do **not** reverse-engineer Muse Noise/WebSocket gateways.
- Do **not** add secrets to the repo; use `.env.example` only.
- Optional `muse-cli` path must stay behind `MUSE_CLI_ENABLED` and stay labeled EXPERIMENTAL / ToS risk.
- Keep the shared **message envelope** schema stable (`src/types/envelope.ts`).
- Prefer honesty in docs: no fabricated Meta official APIs.

## Layout

| Path | Role |
|------|------|
| `src/api/` | Fastify-style Hono HTTP `/v1/*` + `/health` |
| `src/adapters/grokbot.ts` | Webhook deliver to Grok Routine |
| `src/adapters/muse-mcp.ts` | MCP tools for Muse |
| `src/adapters/muse-cli-optional.ts` | Experimental CLI push |
| `src/store/` | memory / json / sqlite |
| `templates/` | Routine + Muse connector paste text |
| `test/` | vitest |

## Commands

```bash
npm install
npm test
npm run build
npm start
```

## When adding features

1. Extend envelope with optional fields only; bump README if breaking.
2. Add unit tests for validation / store behavior.
3. Update templates if webhook JSON field names change.
4. MIT license; TypeScript Node 20+; single package.
