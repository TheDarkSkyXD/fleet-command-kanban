# MCP Proxy

Thin stdio↔HTTP bridge connecting Claude Code to the Fleet Command daemon.

## Why a Proxy?

Claude Code's MCP integration spawns a separate process per session. Originally, each process had its own `ChatService` instance with no providers registered - meaning Telegram notifications never worked.

The proxy architecture solves this:

```
Before (broken):
  Claude ←stdio→ MCP Server (own ChatService, no providers)
                      ↓
                 Files only, no Telegram

After (working):
  Claude ←stdio→ MCP Proxy ←HTTP→ Daemon (shared ChatService + TelegramProvider)
                                      ↓
                                 Telegram + Files + Web UI
```

## How It Works

### proxy.ts (~100 lines)

1. **Startup**: Reads `FLEET_PROJECT_ID`, `FLEET_TICKET_ID`, `FLEET_BRAINSTORM_ID` from environment
2. **ListTools**: Fetches tool list from daemon (`GET /mcp/tools`), caches it
3. **CallTool**: Forwards to daemon (`POST /mcp/call`) with context, returns result

### Daemon Endpoints

| Endpoint     | Method | Description          |
| ------------ | ------ | -------------------- |
| `/mcp/tools` | GET    | List available tools |
| `/mcp/call`  | POST   | Execute a tool       |

### /mcp/call Request

```json
{
  "tool": "chat_ask",
  "args": {
    "question": "What color?",
    "options": ["Red", "Blue"]
  },
  "context": {
    "projectId": "my-project",
    "brainstormId": "brain_123_abc"
  }
}
```

### /mcp/call Response

```json
{
  "content": [{ "type": "text", "text": "Blue" }]
}
```

## Session Spawning

The `SessionService` spawns Claude Code with MCP config pointing to the proxy:

```typescript
const mcpConfig = {
  mcpServers: {
    "fleet-command": {
      command: "node",
      args: ["/path/to/dist/mcp/proxy.js"],
      env: {
        FLEET_PROJECT_ID: projectId,
        FLEET_TICKET_ID: ticketId, // or empty for brainstorms
        FLEET_BRAINSTORM_ID: "", // or brainstormId
      },
    },
  },
};
```

## Tools (defined in tools/)

Tool definitions and handlers live in `src/mcp/tools/`:

- `chat.tools.ts` - chat_ask, chat_notify, chat_init
- `ticket.tools.ts` - get_ticket, create_ticket, attach_artifact, add_ticket_comment
- `task.tools.ts` - get_task, create_task, update_task_status, add_comment_to_task
- `artifact.tools.ts` - list_artifacts, get_artifact
- `ralph.tools.ts` - ralph_loop_dock
- `index.ts` - exports allTools and allHandlers

The daemon imports these directly. The proxy just forwards calls.

### Task Tools

| Tool | Description |
| ---- | ----------- |
| `get_task` | Get details of a specific task by ID |
| `create_task` | Create a task in the ticket's current phase |
| `update_task_status` | Update task status (pending/in_progress/completed/failed) |
| `add_comment_to_task` | Add a comment to a task |

#### create_task Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `description` | Yes | Short title/summary (displayed in task lists) |
| `body` | No | Full implementation details (code, commands, verification steps) |

The `body` field is essential for build tasks - it contains everything the builder needs to execute the task without referring back to the specification.

Tasks are stored at `~/.fleet-command/tickets/{projectId}/{ticketId}/tasks/{phase}/task{X}.json`

### Artifact Tools

| Tool | Description |
| ---- | ----------- |
| `list_artifacts` | List all artifacts attached to the current ticket |
| `get_artifact` | Get the content and metadata of a specific artifact by filename |

#### get_artifact Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `filename` | Yes | The filename of the artifact to retrieve |

### Ralph Tools

| Tool | Description |
| ---- | ----------- |
| `ralph_loop_dock` | Signal verdict for ralph loop iteration (approve/reject with feedback) |

#### ralph_loop_dock Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `approved` | Yes | Whether the work is approved (boolean) |
| `feedback` | If rejected | Explanation of why work was rejected |

If `ralph_loop_dock` is not called, the system falls back to exit code behavior (exit 0 = approved).

## Error Handling

- Proxy returns MCP-compliant error responses
- Daemon errors are wrapped in `{ error: "message", content: [...] }`
- If daemon is unreachable, proxy returns connection error to Claude

## Debugging

Check daemon is running:

```bash
curl http://localhost:8443/health
```

List tools:

```bash
curl http://localhost:8443/mcp/tools
```

Test a tool call:

```bash
curl -X POST http://localhost:8443/mcp/call \
  -H "Content-Type: application/json" \
  -d '{"tool": "chat_notify", "args": {"message": "test"}, "context": {"projectId": "test", "brainstormId": "brain_1"}}'
```
