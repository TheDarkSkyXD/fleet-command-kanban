---
name: fleet-command:create-task
description: "Use this skill to create a new task for tracking work within the current ticket. Tasks help break down work into smaller trackable units."
---

# Creating Tasks

Use the `create_task` MCP tool to create tasks within the current ticket. Tasks are automatically assigned to the ticket's current phase and numbered sequentially within that phase.

## Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `description` | Yes | Short title/summary displayed in task lists |
| `body` | No | Full implementation details (code, commands, verification steps) |

## Basic Usage

```javascript
create_task({
  description: "Implement user authentication endpoint",
});
```

## With Implementation Details

When creating tasks for builders to execute, include the full implementation in the `body`:

```javascript
create_task({
  description: "Ticket 1: Add login route",
  body: `**Files:**
- Create: \`src/routes/login.ts\`

**Step 1: Create the route**

\`\`\`typescript
import { Router } from 'express';

export const loginRouter = Router();

loginRouter.post('/login', async (req, res) => {
  const { email, password } = req.body;
  // ... authentication logic
  res.json({ success: true });
});
\`\`\`

**Step 2: Verify**

Run: \`npm run typecheck\`
Expected: No errors

**Commit:**
\`\`\`bash
git add src/routes/login.ts
git commit -m "feat: add login route"
\`\`\``
});
```

## When to Use Body

- **Taskmaster creating build tasks**: Always include body with full specification content
- **Quick tracking tasks**: Body can be omitted if description is sufficient
- **Tasks with code**: Always include body so builders have exact code to implement
