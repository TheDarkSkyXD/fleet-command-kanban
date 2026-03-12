# Utils

Shared utilities for the Fleet Command daemon.

## Files

| File | Purpose |
|------|---------|
| `event-bus.ts` | SSE event broadcasting to frontend clients |
| `logger.ts` | Console log capture with file rotation |
| `semver.ts` | Semantic version comparison utilities |
| `validation.ts` | Input validation helpers |
| `index.ts` | Re-exports for cleaner imports |

## EventBus

Central pub/sub system that bridges internal events to SSE clients.

### Usage

```typescript
import { eventBus } from "../utils/event-bus.js";

// Emit an event (automatically broadcasts to all SSE clients)
eventBus.emit("ticket:updated", { projectId, ticket });

// Listen for events internally
eventBus.on("session:ended", (data) => { ... });
```

### Event Types

| Event | Payload | Description |
|-------|---------|-------------|
| `ticket:created` | `{ projectId, ticket }` | New ticket created |
| `ticket:updated` | `{ projectId, ticket }` | Ticket data changed |
| `ticket:moved` | `{ projectId, ticketId, from, to }` | Ticket changed phase |
| `ticket:deleted` | `{ projectId, ticketId }` | Ticket removed |
| `session:started` | `{ sessionId, ...meta }` | Claude session spawned |
| `session:output` | `{ sessionId, event }` | Session log entry |
| `session:ended` | `{ sessionId, ...meta }` | Session completed/failed |
| `brainstorm:created` | `{ projectId, brainstorm }` | New brainstorm started |
| `brainstorm:updated` | `{ projectId, brainstorm }` | Brainstorm data changed |
| `brainstorm:message` | `{ projectId, brainstormId, message }` | New message in brainstorm |
| `ticket:message` | `{ projectId, ticketId, message }` | New message in ticket |
| `ticket:task-updated` | `{ projectId, ticketId, task }` | Task status changed |
| `log:entry` | `{ level, message, ... }` | Debug log entry |
| `processing:sync` | `{ projectId, ticketIds }` | Heartbeat for active tickets |

### SSE Client Registration

The `/events` endpoint in `server.ts` registers clients:

```typescript
app.get("/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  eventBus.addClient(res);
});
```

Clients automatically unregister on connection close.

### Processing Sync Heartbeat

Every 5 seconds, the server broadcasts `processing:sync` events per project. This ensures frontend stays in sync even if SSE events are missed due to connection issues or race conditions.

## Logger

Captures `console.log` and `console.error` to a rotating log file.

### Usage

```typescript
import { Logger } from "../utils/logger.js";

const logger = new Logger();
await logger.init();

// Now all console.log/error calls are captured
console.log("This goes to stdout AND the log file");
```

### Configuration

- **Max file size:** 10MB before rotation
- **Max files:** 3 (current + 2 archived)
- **Default path:** `~/.fleet-command/daemon.log`

### Rotation

When log exceeds 10MB:
1. `daemon.log.3` is deleted
2. `daemon.log.2` → `daemon.log.3`
3. `daemon.log.1` → `daemon.log.2`
4. `daemon.log` → `daemon.log.1`
5. New `daemon.log` created
