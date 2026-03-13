import { EventEmitter } from "events";
import { Response } from "express";

type EventName =
  | "ticket:created"
  | "ticket:updated"
  | "ticket:moved"
  | "ticket:deleted"
  | "ticket:archived"
  | "ticket:restored"
  | "ticket:restarted"
  | "session:started"
  | "session:output"
  | "session:ended"
  | "brainstorm:created"
  | "brainstorm:updated"
  | "brainstorm:message"
  | "ticket:message"
  | "ticket:task-updated"
  | "log:entry"
  | "processing:sync"
  | "folder:updated"
  | "devserver:output"
  | "devserver:status";

class EventBus extends EventEmitter {
  private clients: Set<Response> = new Set();

  addClient(res: Response): void {
    this.clients.add(res);
    res.on("close", () => this.clients.delete(res));
  }

  broadcast(event: EventName, data: unknown): void {
    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of this.clients) {
      client.write(message);
    }
  }
}

export const eventBus = new EventBus();

// Forward internal events to SSE clients
const forwardEvents: EventName[] = [
  "ticket:created",
  "ticket:updated",
  "ticket:moved",
  "ticket:deleted",
  "session:started",
  "session:output",
  "session:ended",
  "brainstorm:created",
  "brainstorm:updated",
  "brainstorm:message",
  "ticket:message",
  "ticket:task-updated",
  "log:entry",
  "processing:sync",
  "folder:updated",
  "devserver:output",
  "devserver:status",
];

for (const event of forwardEvents) {
  eventBus.on(event, (data: unknown) => eventBus.broadcast(event, data));
}
