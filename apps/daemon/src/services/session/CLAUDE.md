# Session Service

Manages Claude Code agent sessions for autonomous ticket execution. Spawns PTY processes, handles orchestration flow, and coordinates multi-stage workflows.

## Worker Execution Model

The session service uses a worker-based orchestration system. Workers are defined in workflow templates and form a tree structure executed by the worker-executor.

### Worker Types

| Worker Type | Description |
|-------------|-------------|
| `agent` | Single Claude agent execution. Runs an agent prompt once. |
| `ralphLoop` | Adversarial review loop. Runs nested workers repeatedly until approved or max attempts reached. |
| `taskLoop` | Task iteration loop. Runs nested workers once per task in the phase. |

### Worker Tree Structure

Workers can be nested to create complex execution patterns:

```
Phase: Refinement
  workers:
    - ralphLoop:
        - agent (refinement)
        - agent (adversarial)
        maxAttempts: 3

Phase: Build
  workers:
    - taskLoop:
        - ralphLoop:
            - agent (builder)
            - agent (reviewer)
            maxAttempts: 2
```

### Execution Flow

1. `startPhase()` loads phase config and initializes/recovers worker state
2. `executeNextWorker()` traverses the worker tree to find the next agent
3. Agent spawns as PTY process with `--print` prompt
4. On agent exit, `handleAgentCompletion()` processes result and advances state
5. Loop workers check conditions (verdict, remaining tasks) and either continue or complete
6. Phase completes when all top-level workers are done

## Key Files

| File | Purpose |
|------|---------|
| `worker-executor.ts` | Main tree interpreter. Handles worker traversal, state updates, and phase transitions. |
| `worker-state.ts` | State persistence. Manages worker state in SQLite via ticket.store.ts. |
| `loops/ralph-loop.ts` | Ralph loop handler. Manages iteration count, verdict checking, and retry logic. |
| `loops/task-loop.ts` | Task loop handler. Manages task queue, completion tracking, and task context injection. |
| `session.service.ts` | Session management. Spawns Claude PTY processes, emits events, handles agent lifecycle. |
| `phase-config.ts` | Phase configuration. Loads from workflow template, resolves enabled phases. |
| `agent-loader.ts` | Agent loading. Extracts prompts from template markdown files. |
| `model-resolver.ts` | Model resolution. Converts model specs (shortcuts, IDs) to CLI-ready strings. |
| `worktree.ts` | Git worktree creation for code isolation. |
| `prompts.ts` | Full prompt construction (agent instructions + ticket context). |
| `ticket-logger.ts` | Debug logging to daemon.log and prompt files. |

## State Structure

### OrchestrationState

Top-level state for a ticket's current phase execution:

```typescript
interface OrchestrationState {
  phaseId: string;           // Current phase (e.g., "Refinement")
  workerIndex: number;       // Index into phase.workers array
  activeWorker: WorkerState | null;  // Nested loop/agent state
  updatedAt: string;
}
```

### WorkerState Variants

State is nested to match the worker tree:

```typescript
// Agent state (leaf node)
interface AgentState {
  id: string;
  type: "agent";
  sessionId?: string;
}

// Ralph loop state
interface RalphLoopState {
  id: string;
  type: "ralphLoop";
  iteration: number;         // Current iteration (1-based)
  workerIndex: number;       // Index into loop's workers array
  activeWorker: WorkerState | null;
}

// Task loop state
interface TaskLoopState {
  id: string;
  type: "taskLoop";
  currentTaskId: string | null;
  pendingTasks: string[];    // Task IDs to process
  completedTasks: string[];  // Task IDs completed
  workerIndex: number;       // Index into loop's workers array
  activeWorker: WorkerState | null;
}
```

### State Storage

Worker state is stored in the **SQLite database** in the `tickets` table's `worker_state` JSON column, not as files.

```typescript
// Access via ticket.store.ts
getWorkerState(ticketId: string): OrchestrationState | null
setWorkerState(ticketId: string, state: OrchestrationState): void
clearWorkerState(ticketId: string): void
```

## Recovery

When the daemon restarts, sessions that were interrupted need recovery.

### Recovery Process

1. `startPhase()` checks for existing state in SQLite
2. If state exists and phase matches, calls `prepareForRecovery()`
3. Recovery resets nested state to safe restart points:
   - `taskLoop`: Moves `currentTaskId` back to `pendingTasks`, resets `workerIndex`
   - `ralphLoop`: Resets to beginning of current iteration (`workerIndex: 0`)
4. Execution continues from recovered state

### Recovery Behavior

| Loop Type | Recovery Action |
|-----------|-----------------|
| `taskLoop` | Re-queues current task, restarts from first worker |
| `ralphLoop` | Restarts current iteration from first worker |
| `agent` | Re-spawns the agent |

### State Cleanup

- When phase completes, `clearWorkerState()` sets the `worker_state` column to NULL
- New phase starts with fresh state (`initWorkerState()`)
- Historical state can be queried through database mechanisms if needed (no file archiving)

## Events Emitted

```typescript
eventEmitter.emit("session:started", { sessionId, ...meta });
eventEmitter.emit("session:output", { sessionId, event });
eventEmitter.emit("session:ended", { sessionId, ...meta });
```

## Debug Logging

When `FLEET_DEBUG=1` or `NODE_ENV=development`, debug logs are created in:

```
~/.fleet-command/projects/{projectId}/tickets/{ticketId}/logs/
  daemon.log                          # Orchestration events
  prompts/
    prompt-1-2026-02-01T12-00-00-000Z.md
    prompt-2-2026-02-01T12-05-00-000Z.md
    ...
```

Each prompt file contains:

- Metadata (timestamp, project, ticket, phase, stage, agent type)
- Agent definition (description + full instructions)
- Context prompt passed via `--print`

## Worktree Behavior

Worktree requirement is defined per-phase in the template's `workflow.json`:

- `requiresWorktree: true` - Creates isolated git worktree
- `requiresWorktree: false` (default) - Works in main repo

Worktrees live at: `{projectPath}/.fleet-command/worktrees/{ticketId}/`

## Adding a New Phase

1. Define phase in template's `workflow.json` with workers array
2. Create agent markdown files in template's `agents/` directory
3. Set `requiresWorktree: true` if phase modifies code
4. Configure `transitions.next` for automatic phase progression

## Ralph Loop Feedback

Ralph loops now capture feedback from reviewers and inject it into subsequent iterations.

### Feedback Storage

Active file: `logs/ralph/{phaseId}--{ralphLoopId}[--{taskId}].json`
Archive: `logs/ralph/archive/{phaseId}--{ralphLoopId}[--{taskId}]--{timestamp}.json`

### Lifecycle

1. Ralph loop starts → Initialize feedback file (archive existing if present)
2. Each rejection → Append iteration to feedback file
3. Ralph loop completes → Set final status, archive, delete active

### Context Injection

When a builder agent starts iteration 2+, the daemon injects previous feedback into the prompt as a "Previous Attempts" section.
