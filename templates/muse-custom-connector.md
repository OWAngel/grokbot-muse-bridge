# Muse Custom Connector — paste into Muse chat

Meta Muse can attach remote MCP servers via its **Custom Connector** flow (ask Muse in chat to connect). This bridge exposes streamable HTTP MCP at:

```text
{PUBLIC_BASE_URL}/mcp
```

Auth header (required):

```text
Authorization: Bearer {BRIDGE_TOKEN}
```

## Chat text to paste into Muse

Copy, replace placeholders, then send:

```text
Please create a Custom Connector (MCP) for my Grok Bot bridge.

Name: Grok Bot Bridge
Transport: Streamable HTTP
URL: https://YOUR-PUBLIC-HOST/mcp
Headers:
  Authorization: Bearer YOUR_BRIDGE_TOKEN

After it connects, use these tools:
- send_to_grokbot — send me (Muse) a message to Grok Bot (body, optional thread_id, priority)
- check_inbox — read pending messages from Grok Bot
- ack_message — mark a message acked/delivered
- get_thread — thread summary + recent messages

When I ask you to talk to Grok, call send_to_grokbot. Periodically check_inbox for replies and ack_message when you've handled them. Keep the same thread_id for a conversation.
```

## Notes

- Muse has **no public peer-to-peer inbox API**. This MCP connector is the supported integration path for this project.
- The bridge must be reachable from Muse's network (public HTTPS URL or a tunnel such as Cloudflare Tunnel / ngrok). `localhost` only works if Muse can reach your machine.
- Do **not** reverse-engineer Muse's private Noise/WebSocket gateway.
- Optional `muse-cli` push is EXPERIMENTAL, off by default, and may violate Muse ToS — prefer `check_inbox`.
