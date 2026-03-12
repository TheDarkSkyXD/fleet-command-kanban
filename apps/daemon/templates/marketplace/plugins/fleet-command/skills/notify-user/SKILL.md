---
name: fleet-command:notify-user
description: "Use this to send status updates, progress notifications, or informational messages to the user without waiting for a response."
---

# Notifying Users

## Overview

Use the `chat_notify` MCP tool to send notifications to the user. This is for one-way communication - status updates, progress reports, or informational messages that don't require a response.

## Using chat_notify

For status updates:
```javascript
chat_notify({
  message: "Refinement draft created!"
})
```

For progress notifications:
```javascript
chat_notify({
  message: "Starting architecture design for TASK-123..."
})
```

For completion messages:
```javascript
chat_notify({
  message: "Build complete. All tests passing."
})
```

## Guidelines

- **Use for one-way communication** - When you don't need a response, use `chat_notify` instead of `chat_ask`
- **Keep messages concise** - Short, clear updates are easier to digest
- **Include context** - Mention ticket IDs or phase names when relevant
- **Don't overuse** - Notify on meaningful events, not every small step

## Tool Reference

| Tool | Purpose |
|------|---------|
| `chat_notify` | Send a notification to the user (does not wait for response) |
