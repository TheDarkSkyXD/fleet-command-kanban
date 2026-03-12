# Fleet Command

Multi-agent software engineering daemon for autonomous development pipelines. Orchestrates Claude Code sessions through configurable workflow phases with adversarial review loops.

## Commands

```bash
# Development
pnpm install          # Install all dependencies
pnpm dev              # Start daemon + frontend (concurrent)
pnpm dev:daemon       # Start daemon only (watches + rebuilds)
pnpm dev:frontend     # Start frontend only (Vite dev server)
pnpm dev:desktop      # Start Electron desktop app

# Build
pnpm build            # Build all packages
pnpm build:shared     # Build shared types first (if dependency issues)
pnpm typecheck        # TypeScript check all packages

# Testing
pnpm test             # Run all tests
cd apps/frontend && pnpm test  # Frontend tests (Vitest)
cd apps/daemon && pnpm test    # Daemon tests (Node test runner)

# CLI (after build)
./apps/daemon/bin/fleet-command.js start          # Start daemon
./apps/daemon/bin/fleet-command.js status         # Check daemon status
./apps/daemon/bin/fleet-command.js stop           # Stop daemon
```

## Code Style

- TypeScript strict mode, ES modules (`"type": "module"`)
- Prefer `async/await` over raw promises
- Use factory functions for dependency injection (e.g., `createTicketStore(db)`)
- SQLite operations are synchronous (better-sqlite3), file I/O is async
- ISO 8601 timestamps for all dates stored in database
- Path alias `@/` for frontend imports from `src/`
- Tailwind CSS for styling, container queries over media queries
- Radix UI for accessible primitives, shadcn/ui patterns for components

## Architecture

```
fleet-command-monorepo/
├── apps/
│   ├── daemon/        # @fleet-command/daemon - Express server, MCP, SQLite
│   ├── frontend/      # @fleet-command/frontend - React 19, Vite, Tailwind
│   └── desktop/       # @fleet-command/desktop - Electron wrapper
└── packages/
    └── shared/        # @fleet-command/shared - Types, constants
```

### Data Flow

```
User (Web UI / Telegram)
         │
         ▼
┌─────────────────────────────────────────────────────┐
│  Daemon (Express on :8443)                          │
│  ├── /api/*          REST endpoints                 │
│  ├── /events         SSE for real-time updates      │
│  └── /mcp/*          MCP proxy bridge               │
└─────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────┐
│  MCP Proxy (per Claude session)                     │
│  stdio ↔ HTTP bridge to daemon                      │
└─────────────────────────────────────────────────────┘
         │
         ▼
Claude Code (PTY process)
```

### Worker Execution Model

Workflow phases define a `workers` array. Workers form a tree:

| Type | Purpose |
|------|---------|
| `agent` | Single Claude session execution |
| `ralphLoop` | Adversarial review until approved or maxAttempts |
| `taskLoop` | Iterates nested workers over task queue |

State is persisted per-ticket at `~/.fleet-command/projects/{projectId}/tickets/{ticketId}/worker-state.json` for crash recovery.

Key files:
- `apps/daemon/src/services/session/worker-executor.ts` - Tree interpreter
- `apps/daemon/src/services/session/loops/ralph-loop.ts` - Review loop
- `apps/daemon/src/services/session/loops/task-loop.ts` - Task iteration

## Key Files

### Daemon

| Path | Purpose |
|------|---------|
| `apps/daemon/src/server/server.ts` | Express server, routes, SSE |
| `apps/daemon/src/mcp/proxy.ts` | stdio↔HTTP bridge for Claude |
| `apps/daemon/src/mcp/tools/*.ts` | MCP tool definitions |
| `apps/daemon/src/services/session/session.service.ts` | Claude session lifecycle |
| `apps/daemon/src/stores/*.ts` | SQLite data access layer |
| `apps/daemon/src/config/paths.ts` | File system path constants |
| `apps/daemon/templates/workflows/` | Workflow templates + agents |

### Frontend

| Path | Purpose |
|------|---------|
| `apps/frontend/src/routes/` | TanStack Router file-based routes |
| `apps/frontend/src/components/ui/` | shadcn-style UI primitives |
| `apps/frontend/src/hooks/queries.ts` | TanStack Query API wrappers |
| `apps/frontend/src/stores/` | Zustand client state |
| `apps/frontend/src/api/client.ts` | API fetch functions |

### Shared

| Path | Purpose |
|------|---------|
| `packages/shared/src/types/` | TypeScript interfaces |
| `packages/shared/src/constants/` | Shared constants |

## Database

**Location:** `~/.fleet-command/fleet-command.db` (SQLite with WAL mode)

| Table | Purpose |
|-------|---------|
| `projects` | Registered projects with template info |
| `tickets` | Ticket metadata, phase, worker_state JSON |
| `brainstorms` | Brainstorm sessions |
| `conversations` | Chat containers (linked from tickets/brainstorms) |
| `conversation_messages` | Message history |
| `sessions` | Claude session tracking |
| `tasks` | Tasks within tickets |
| `artifacts` | Artifact metadata (files on disk) |

**Migrations:** `apps/daemon/src/stores/migrations.ts` - uses `user_version` pragma

**Store APIs:** See `apps/daemon/src/stores/CLAUDE.md` for detailed store documentation

## File System Layout

```
~/.fleet-command/
├── fleet-command.db                 # SQLite database
├── config.json               # Global config (Telegram, port)
├── daemon.pid                # Running daemon PID
├── daemon.log                # Daemon logs (10MB rotation)
├── templates/                # Workflow templates
│   └── product-development/
│       ├── workflow.json     # Phase definitions
│       └── agents/           # Agent prompt files
├── marketplace/              # Claude Code plugin
└── projects/{projectId}/
    ├── tickets/{ticketId}/
    │   ├── artifacts/        # Generated files
    │   ├── images/           # Uploaded images
    │   └── logs/             # Debug logs, prompt history
    └── brainstorms/{brainstormId}/
        └── pending-*.json    # IPC files
```

## MCP Tools

| Tool | Description |
|------|-------------|
| `chat_ask` | Ask user question, wait for response |
| `chat_notify` | Send notification (no response) |
| `chat_init` | Initialize chat threads for ticket/brainstorm |
| `get_ticket` | Get ticket details |
| `create_ticket` | Create new ticket |
| `create_task` | Create task in current phase |
| `update_task_status` | Update task status |
| `get_task` | Get task details |
| `add_comment_to_task` | Add comment to task |
| `attach_artifact` | Attach file to ticket |
| `list_artifacts` | List all artifacts for current ticket |
| `get_artifact` | Get artifact content by filename |
| `ralph_loop_dock` | Signal review verdict (approve/reject) |

See `apps/daemon/src/mcp/CLAUDE.md` for MCP proxy details.

## Workflow Templates

Templates define phase sequences with nested worker trees. Located at `apps/daemon/templates/workflows/`.

**Schema:** `templates/workflows/workflow.schema.json`

**Default template:** `product-development/` with phases: Ideas → Refinement → Architecture → Specification → Build → Review → Done

**Agent prompts:** Markdown files in `templates/workflows/{name}/agents/`

**Per-project overrides:** Create `{agent}.override.md` to customize agent behavior for a specific project.

See `apps/daemon/templates/workflows/CLAUDE.md` for full workflow documentation.

## Configuration

**Global config:** `~/.fleet-command/config.json`

```json
{
  "telegram": {
    "botToken": "...",
    "userId": "...",
    "forumGroupId": "..."
  },
  "daemon": {
    "port": 8443
  }
}
```

**Environment variables:**
- `FLEET_DEBUG=1` - Enable debug logging
- `NODE_ENV=development` - Development mode

## Sub-documentation

Detailed documentation exists in sub-directories:

| File | Topic |
|------|-------|
| `apps/daemon/src/stores/CLAUDE.md` | Store APIs, database schema |
| `apps/daemon/src/mcp/CLAUDE.md` | MCP proxy architecture |
| `apps/daemon/src/services/session/CLAUDE.md` | Session orchestration |
| `apps/daemon/src/utils/CLAUDE.md` | EventBus, Logger utilities |
| `apps/daemon/templates/workflows/CLAUDE.md` | Workflow schema, worker types |
| `apps/frontend/CLAUDE.md` | Frontend tech stack, conventions |
| `apps/frontend/src/lib/CLAUDE.md` | Utility functions |
| `apps/frontend/src/components/brainstorm/CLAUDE.md` | Brainstorm chat UI |
