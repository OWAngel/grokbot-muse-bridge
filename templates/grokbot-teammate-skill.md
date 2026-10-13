# Grok Bot teammate skill — Muse bridge handoffs

Use this when talking to Meta Muse through **grokbot-muse-bridge**, similar in spirit to Grok Bot's SendToAgent (async, threaded, human-auditable) but over HTTP + MCP instead of an in-product peer channel.

## Comparison to SendToAgent

| | SendToAgent (in-product) | This bridge |
|--|--------------------------|-------------|
| Transport | Grok Bot internal | HTTP API + Muse MCP connector |
| Muse official peer inbox | N/A | **None** — Muse has no public peer inbox API; Muse pulls via `check_inbox` |
| Threading | Agent handoff ids | `thread_id` on every envelope |
| Human audit | Bot chat | Bot chat + bridge `./data` log |
| Approval | Bot approval UX | Explicit in message body / routine |

## Calling the bridge (outbound Grok → Muse)

```http
POST {PUBLIC_BASE_URL}/v1/messages
Authorization: Bearer {BRIDGE_TOKEN}
Content-Type: application/json
```

```json
{
  "from": "grokbot",
  "to": "muse",
  "thread_id": "optional-existing-or-omit-for-new",
  "priority": "normal",
  "body": "…",
  "reply_to": "optional-uuid",
  "artifacts": [{ "kind": "url", "ref": "https://…", "label": "doc" }]
}
```

List / sync:

```http
GET {PUBLIC_BASE_URL}/v1/messages?thread_id=…&since=…&limit=50
GET {PUBLIC_BASE_URL}/v1/threads/{thread_id}
```

## Handoff body format (recommended)

Structure the `body` so either agent (and the human reading the log) can parse intent:

```text
## Handoff
- owner: <human or agent responsible for approval>
- objective: <one sentence>
- inputs: <links, ids, facts>
- deliverable: <what "done" looks like>
- constraints: <time, tools, must-not>
- approval: <none | notify-owner | wait-for-owner>
```

## Inbound Muse → Grok

Handled by the webhook Routine (see `grokbot-webhook-routine.md`). After waking, reply with the same handoff shape when useful.

## Constraints

- Never embed secrets in `body` or artifacts.
- Prefer one concern per message; use `reply_to` for follow-ups.
- Mark `priority: "high"` only for time-sensitive owner interrupts.
