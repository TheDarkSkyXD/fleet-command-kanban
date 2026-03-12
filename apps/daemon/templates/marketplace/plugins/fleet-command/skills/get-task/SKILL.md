---
name: fleet-command:get-task
description: "Use this skill to retrieve details of a specific task by its ID. Returns the task's description, status, comments, and other metadata."
---

# Getting Task Details

Use the `get_task` MCP tool to retrieve details of a specific task within the current ticket.

## Using get_task

```javascript
get_task({
  taskId: "task1",
});
```

The tool returns the full task object including:
- `id` - The task identifier
- `description` - What the task involves
- `status` - Current status (pending, in_progress, completed, failed)
- `comments` - Array of comments on the task
- `createdAt` - When the task was created
- `updatedAt` - When the task was last modified
