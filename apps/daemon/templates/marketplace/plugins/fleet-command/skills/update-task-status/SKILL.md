---
name: fleet-command:update-task-status
description: "Use this skill to update the status of an existing task."
---

# Updating Task Status

## The Rule

**Update task status BEFORE and AFTER every work block.** Starting work? Set `in_progress` first. Finished? Set `completed` immediately. No silent work.

## Using update_task_status

```javascript
update_task_status({
  taskId: "task1",
  status: "in_progress",
});
```

## Valid Statuses

| Status        | When to Use                  |
| ------------- | ---------------------------- |
| `pending`     | Task created but not started |
| `in_progress` | Actively working on the task |
| `completed`   | Task finished successfully   |

## Implementation Intentions

| When...                        | Do this IMMEDIATELY                                    |
| ------------------------------ | ------------------------------------------------------ |
| You start working on a task    | `update_task_status({ taskId, status: "in_progress" })` |
| You finish a task successfully | `update_task_status({ taskId, status: "completed" })`   |
| You switch to a different task | Update the old task, then update the new task          |

## Red Flags - STOP Immediately

These thoughts mean you're rationalizing:

| Excuse                              | Reality                                        |
| ----------------------------------- | ---------------------------------------------- |
| "I'll update it when I'm done"      | Update NOW. You might forget or get interrupted. |
| "It's obvious I'm working on it"    | Nothing is obvious without explicit status.    |
| "This is a quick task, no need"     | Quick tasks still need tracking. Always update. |
| "I'll batch my status updates"      | Status updates are real-time. Update immediately. |

## Workflow Example

```javascript
// BEFORE starting work - required
update_task_status({ taskId: "task1", status: "in_progress" });

// ... do the work ...

// AFTER completing work - required
update_task_status({ taskId: "task1", status: "completed" });
```

Tasks without status updates = invisible work. Invisible work = wasted effort when sessions end unexpectedly.
