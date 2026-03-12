# Workflow Schema

This directory contains the JSON schema for defining Fleet Command workflows and template implementations.

## Files

| File | Purpose |
|------|---------|
| `workflow.schema.json` | JSON Schema definition for workflow templates |
| `product-development/` | Default workflow template with agents |

## Schema Overview

A workflow defines a sequence of **phases**, each containing **workers** that execute sequentially. Workers form a tree structure enabling complex orchestration patterns.

```
Workflow
└── Phases[]
    ├── id, name, description
    ├── workers[]
    │   ├── agent (leaf node - runs Claude)
    │   ├── ralphLoop (adversarial review loop)
    │   └── taskLoop (iterates over tasks)
    ├── transitions (next phase, manual gates)
    └── requiresWorktree (git isolation)
```

## Top-Level Structure

```json
{
  "$schema": "./workflow.schema.json",
  "name": "my-workflow",
  "version": "1.0.0",
  "description": "What this workflow accomplishes",
  "phases": [...]
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Unique identifier for the workflow |
| `version` | Yes | Semantic version string (e.g., "1.0.0") |
| `description` | Yes | Human-readable purpose |
| `phases` | Yes | Ordered array of phase definitions |

## Phase Definition

```json
{
  "id": "Build",
  "name": "Build",
  "description": "Execute implementation tasks",
  "workers": [...],
  "transitions": { "next": "Review", "manual": false },
  "requiresWorktree": true
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Unique identifier (used in transitions) |
| `name` | Yes | Display name |
| `description` | Yes | What this phase accomplishes |
| `workers` | Yes | Array of workers (can be empty for manual phases) |
| `transitions` | Yes | Where to go next |
| `requiresWorktree` | No | If `true`, creates isolated git worktree (default: `false`) |

### Transitions

```json
{
  "next": "NextPhaseId",  // or null for terminal phase
  "manual": true          // requires human approval
}
```

- `next: null` marks the workflow's final phase
- `manual: true` pauses execution until human advances the ticket
- If `manual` is omitted, it defaults to `false` (automatic phase progression)

## Worker Types

Workers execute sequentially within a phase. Three types exist, and they can be nested to create complex patterns.

### Agent Worker

Leaf node that spawns a Claude Code session.

```json
{
  "id": "builder-agent",
  "type": "agent",
  "source": "agents/builder.md",
  "description": "Implements the task",
  "disallowTools": ["TaskCreate", "TaskUpdate"],
  "model": "sonnet"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Unique identifier |
| `type` | Yes | Must be `"agent"` |
| `source` | Yes | Path to agent markdown file (relative to template) |
| `description` | No | What this agent does |
| `disallowTools` | No | Array of tool names to disable for this agent |
| `model` | No | Model to use for this agent (see Model Selection below) |

**disallowTools**: Prevents the agent from using specific Claude Code tools. Useful when:
- An agent shouldn't create tasks (e.g., spec agent conflicting with internal TaskCreate)
- Restricting file operations for read-only agents
- Preventing specific skills from being invoked

Example patterns:
```json
"disallowTools": ["TaskCreate", "TaskUpdate"]     // No task management
"disallowTools": ["Write", "Edit"]                // Read-only agent
"disallowTools": ["Bash"]                         // No shell access
```

**model**: Specifies which Claude model to use for this agent. Useful for cost optimization (cheaper models for verification tasks) or version pinning. If not specified, uses Claude Code's default.

Supported formats:
```json
// Shortcuts (Claude CLI resolves to latest version)
"model": "haiku"              // Fastest, cheapest
"model": "sonnet"             // Balanced
"model": "opus"               // Most capable

// Explicit model ID (version pinning)
"model": "claude-sonnet-4-20250514"

// Object format (future provider flexibility)
"model": { "id": "claude-sonnet-4-20250514", "provider": "anthropic" }
```

Typical usage:
- Build/implementation agents: Default or `sonnet`
- Verification/review agents: `haiku` (simple pass/fail checks)
- Complex reasoning: `opus` (architecture decisions)

### Ralph Loop Worker

Adversarial review loop. Runs nested workers repeatedly until the final worker signals approval or `maxAttempts` is reached.

```json
{
  "id": "review-loop",
  "type": "ralphLoop",
  "description": "Iterates until reviewer approves",
  "maxAttempts": 3,
  "workers": [
    { "type": "agent", "id": "implementer", "source": "agents/impl.md" },
    { "type": "agent", "id": "reviewer", "source": "agents/review.md" }
  ]
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Unique identifier |
| `type` | Yes | Must be `"ralphLoop"` |
| `maxAttempts` | Yes | Maximum iterations before failure (minimum: 1) |
| `workers` | Yes | Workers to run each iteration (minimum: 1) |
| `description` | No | What this loop accomplishes |

**Execution flow:**
1. Run all nested workers in sequence
2. Check verdict from final worker (via `ralph_loop_dock` MCP tool)
3. If approved or max attempts reached, exit loop
4. Otherwise, increment iteration and repeat from step 1

**Feedback mechanism:**
- Reviewer calls `ralph_loop_dock(approved: boolean, feedback?: string)` to signal verdict
- If rejected, feedback explains what needs fixing
- On retry iterations, the daemon injects "Previous Attempts" section into the builder's prompt
- Builder sees full history of rejections and can address patterns across failures
- If `ralph_loop_dock` is not called, fallback to exit code (exit 0 = approved)

**Feedback storage:**
- Active: `logs/ralph/{phaseId}--{ralphLoopId}[--{taskId}].json`
- Archived on completion to `logs/ralph/archive/`

**Typical pattern:** Implementer + Reviewer agents, where reviewer signals approval/rejection.

### Task Loop Worker

Iterates over tasks created via the MCP API. Runs nested workers once per task.

```json
{
  "id": "build-tasks",
  "type": "taskLoop",
  "description": "Process each build task",
  "maxAttempts": 100,
  "workers": [
    {
      "type": "ralphLoop",
      "id": "task-review",
      "maxAttempts": 2,
      "workers": [
        { "type": "agent", "id": "builder", "source": "agents/builder.md" },
        { "type": "agent", "id": "verifier", "source": "agents/verify.md" }
      ]
    }
  ]
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Unique identifier |
| `type` | Yes | Must be `"taskLoop"` |
| `maxAttempts` | Yes | Max attempts per task before failure |
| `workers` | Yes | Workers to run for each task |
| `description` | No | What this loop accomplishes |

**Execution flow:**
1. Snapshot pending tasks at loop start
2. For each task:
   - Inject task context into agent prompts
   - Run all nested workers
   - Mark task complete on success
3. Exit when all tasks processed

**Nesting restriction:** `taskLoop` cannot contain another `taskLoop` (can contain `agent` or `ralphLoop`).

## Nesting Patterns

Workers can nest to create sophisticated orchestration:

### Simple Sequential

```json
"workers": [
  { "type": "agent", "id": "a1", "source": "agents/first.md" },
  { "type": "agent", "id": "a2", "source": "agents/second.md" }
]
```

Agents run one after another.

### Adversarial Review

```json
"workers": [
  {
    "type": "ralphLoop",
    "id": "review",
    "maxAttempts": 3,
    "workers": [
      { "type": "agent", "id": "writer", "source": "agents/write.md" },
      { "type": "agent", "id": "critic", "source": "agents/critique.md" }
    ]
  }
]
```

Writer creates, critic reviews. Loop until approved or 3 attempts.

### Task Iteration with Review

```json
"workers": [
  { "type": "agent", "id": "planner", "source": "agents/plan.md" },
  {
    "type": "taskLoop",
    "id": "execute",
    "maxAttempts": 50,
    "workers": [
      {
        "type": "ralphLoop",
        "id": "task-review",
        "maxAttempts": 2,
        "workers": [
          { "type": "agent", "id": "impl", "source": "agents/impl.md" },
          { "type": "agent", "id": "verify", "source": "agents/verify.md" }
        ]
      }
    ]
  },
  { "type": "agent", "id": "finalize", "source": "agents/final.md" }
]
```

1. Planner creates tasks
2. Task loop processes each task with adversarial review
3. Finalizer runs after all tasks complete

## Agent Definition Files

Agent `source` paths reference markdown files in the template's `agents/` directory:

```
templates/workflows/product-development/
├── workflow.json
└── agents/
    ├── refinement.md
    ├── architect.md
    ├── builder.md
    └── ...
```

Agent markdown files contain the system prompt injected into Claude sessions.

## Agent Prompt Overrides

Projects can customize agent behavior without modifying base template files. This allows per-project customizations that survive template updates.

### Override Convention

Create a file with `.override.md` suffix alongside the standard agent file:

```
~/.fleet-command/project-data/{projectId}/template/agents/
├── refinement.md           # Standard agent (from template)
├── refinement.override.md  # Project override (takes priority)
├── builder.md
└── builder.override.md
```

### Lookup Order

When resolving an agent prompt, the system checks in this order:

| Priority | Location | Description |
|----------|----------|-------------|
| 1 (highest) | `project-data/{projectId}/template/agents/{agent}.override.md` | Project-specific override |
| 2 | `project-data/{projectId}/template/agents/{agent}.md` | Project's local template copy |
| 3 (lowest) | `templates/{templateName}/agents/{agent}.md` | Global template catalog |

The first file found is used. Override content **completely replaces** the standard prompt (no merging).

### Creating an Override

1. Locate your project's template directory:
   ```
   ~/.fleet-command/project-data/{projectId}/template/agents/
   ```

2. Copy the agent you want to customize:
   ```bash
   cp refinement.md refinement.override.md
   ```

3. Edit the override file with your customizations

### Use Cases

**Project-specific context:**
```markdown
# Refinement Agent

You are refining requirements for the Acme Corp inventory system.

## Domain Knowledge
- SKUs follow pattern: DEPT-CATEGORY-SERIAL
- Warehouse codes: NYC, LAX, CHI, MIA
- Integration with SAP via RFC calls

[... rest of agent instructions ...]
```

**Stricter guidelines:**
```markdown
# Builder Agent

[... standard instructions ...]

## Project-Specific Rules
- All database queries MUST use the query builder, no raw SQL
- Components MUST be placed in src/components/{feature}/
- All API calls MUST go through the apiClient utility
```

**Different workflow focus:**
```markdown
# Architecture Agent

[... customized to focus on microservices patterns
     specific to this project's tech stack ...]
```

### Key Points

- Override files are **not** copied during template updates
- Override content **replaces** (not merges with) the base prompt
- Only override files you need to customize
- When a base agent is updated in the template, review your overrides for compatibility

### Related Functions

```typescript
// Check if override exists
hasProjectAgentOverride(projectId: string, agentPath: string): Promise<boolean>

// Get override content
getProjectAgentOverride(projectId: string, agentPath: string): Promise<string>

// Unified lookup (handles full priority chain)
getAgentPromptForProject(projectId: string, agentPath: string): Promise<string>
```

See `src/stores/project-template.store.ts` and `src/stores/template.store.ts` for implementation.

## Worktree Behavior

When `requiresWorktree: true`:
- Creates isolated git worktree at `.fleet-command/worktrees/{ticketId}/`
- Code changes happen in isolation from main branch
- Enables parallel ticket execution without conflicts

Typical usage:
- Pre-build phases (refinement, architecture): `requiresWorktree: false`
- Build phases (implementation): `requiresWorktree: true`

## Complete Example

```json
{
  "$schema": "./workflow.schema.json",
  "name": "simple-build",
  "description": "Simple build workflow with review",
  "phases": [
    {
      "id": "Plan",
      "name": "Planning",
      "description": "Create implementation plan",
      "workers": [
        {
          "id": "planner",
          "type": "agent",
          "source": "agents/planner.md",
          "description": "Creates task breakdown"
        }
      ],
      "transitions": { "next": "Build" }
    },
    {
      "id": "Build",
      "name": "Build",
      "description": "Implement the plan",
      "requiresWorktree": true,
      "workers": [
        {
          "id": "build-loop",
          "type": "taskLoop",
          "maxAttempts": 20,
          "workers": [
            {
              "id": "impl-review",
              "type": "ralphLoop",
              "maxAttempts": 2,
              "workers": [
                {
                  "id": "implementer",
                  "type": "agent",
                  "source": "agents/builder.md"
                },
                {
                  "id": "reviewer",
                  "type": "agent",
                  "source": "agents/reviewer.md"
                }
              ]
            }
          ]
        }
      ],
      "transitions": { "next": "Review", "manual": false }
    },
    {
      "id": "Review",
      "name": "Human Review",
      "description": "Manual approval before merge",
      "workers": [],
      "transitions": { "next": null, "manual": true }
    }
  ]
}
```

## Validation

Validate workflow files against the schema:

```bash
# Using Node.js
node -e "
  const Ajv = require('ajv');
  const schema = require('./workflow.schema.json');
  const workflow = require('./product-development/workflow.json');
  const ajv = new Ajv();
  const valid = ajv.validate(schema, workflow);
  console.log(valid ? 'Valid' : ajv.errors);
"
```

## Related Files

- `src/types/template.types.ts` - TypeScript interfaces for workers (includes `ModelSpec` type)
- `src/services/session/worker-executor.ts` - Worker tree interpreter
- `src/services/session/model-resolver.ts` - Model specification resolver
- `src/services/session/loops/ralph-loop.ts` - Ralph loop implementation
- `src/services/session/loops/task-loop.ts` - Task loop implementation
- `src/stores/ralph-feedback.store.ts` - Ralph loop feedback storage
- `src/mcp/tools/ralph.tools.ts` - `ralph_loop_dock` MCP tool
