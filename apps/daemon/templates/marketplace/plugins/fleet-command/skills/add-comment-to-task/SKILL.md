---
name: fleet-command:add-comment-to-task
description: "Use this skill to add comments or notes to an existing task. Comments help track progress, document decisions, or explain issues."
---

# Adding Comments to Tasks

## The Rule

**Document as you go, not after.** Every significant action, decision, or blocker gets a comment immediately. Future sessions have no memory of your reasoning - comments are the only record.

## Using add_comment_to_task

```javascript
add_comment_to_task({
  taskId: "task1",
  text: "Completed initial implementation, moving to tests"
})
```

Comments are timestamped automatically and appended to the task's comment history.

## Implementation Intentions

| When...                              | Add a comment IMMEDIATELY                          |
| ------------------------------------ | -------------------------------------------------- |
| You complete a significant milestone | Document what was accomplished                     |
| You encounter a blocker or error     | Document exactly what failed and why               |
| You make a non-obvious decision      | Record the reasoning before you forget it          |
| You're about to end a session        | Leave handoff notes for the next session           |
| A task fails or can't be completed   | **REQUIRED**: Explain what went wrong              |

## Red Flags - STOP Immediately

These thoughts mean you're rationalizing:

| Excuse                                | Reality                                              |
| ------------------------------------- | ---------------------------------------------------- |
| "The code is self-documenting"        | Code shows WHAT, not WHY. Add the comment.           |
| "I'll remember this"                  | You won't. The next session definitely won't.        |
| "It's obvious why this failed"        | Nothing is obvious without documentation. Write it.  |
| "I'll add comments at the end"        | You'll forget details. Comment as you go.            |
| "This decision doesn't need explaining" | Every non-trivial decision needs reasoning recorded. |

## What to Comment

### Progress Updates
```javascript
add_comment_to_task({
  taskId: "task1",
  text: "API endpoint implemented, testing locally"
})
```

### Failures and Blockers (REQUIRED)
```javascript
add_comment_to_task({
  taskId: "task2",
  text: "Failed: TypeScript compilation error in user.types.ts - missing interface export"
})
```

### Decisions and Reasoning
```javascript
add_comment_to_task({
  taskId: "task3",
  text: "Chose Redis over in-memory cache for persistence across restarts"
})
```

### Session Handoffs
```javascript
add_comment_to_task({
  taskId: "task4",
  text: "Paused mid-implementation. Next: wire up the event handlers in src/handlers/events.ts"
})
```

## Comment Quality

| Bad Comment                    | Good Comment                                                    |
| ------------------------------ | --------------------------------------------------------------- |
| "Done"                         | "Implemented user validation with email regex and length check" |
| "Failed"                       | "Failed: API returns 403 - auth token expired during request"   |
| "Made some changes"            | "Refactored auth flow to use middleware pattern"                |

Vague comments = no comments. Be specific about what happened and why.

Tasks without comments = lost context. Lost context = repeated mistakes and wasted investigation time.
