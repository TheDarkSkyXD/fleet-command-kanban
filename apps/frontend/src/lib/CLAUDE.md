# Lib Utilities

Shared utility functions for the Fleet Command frontend.

## Functions

### `cn(...inputs)`

Merges Tailwind CSS classes using `clsx` + `tailwind-merge`. Handles conditional classes and deduplication.

```typescript
cn('px-4', isActive && 'bg-blue-500', 'px-2') // → 'px-2 bg-blue-500'
```

### `timeAgo(date)`

Formats a date as relative time: "just now", "5m ago", "2h ago", "3d ago".

### `formatDate(date)`

Formats a date as locale date string.

### `formatTime(date)`

Formats a date as 24-hour time string.

### `parseTicketNumber(id)`

Extracts numeric portion from ticket IDs for sorting: "POT-14" → 14.

### `formatToolActivity(toolName, input?)`

Converts Claude Code tool names to user-friendly activity descriptions. Used in the thinking indicator to show what the agent is doing.

#### Tool Categories

| Category | Examples | Output |
|----------|----------|--------|
| **Skills** | `fleet-command:read-artifacts`, `superpowers:brainstorming` | "Reading project documents", "Exploring ideas" |
| **MCP Tools** | `mcp__fleet-command__chat_ask` | "Preparing question" |
| **Read** | Based on file extension | "Reviewing TypeScript code", "Checking configuration" |
| **Grep/Glob** | Pattern-based | "Searching codebase", "Finding test files" |
| **Edit/Write** | — | "Making code changes", "Writing new file" |
| **Bash** | Command-aware | "Checking git status", "Installing dependencies" |
| **Task** | — | "Delegating task" |
| **Web** | `WebSearch`, `WebFetch` | "Searching the web", "Fetching web page" |

#### Bash Command Detection

The function parses bash commands to provide specific feedback:

```typescript
formatToolActivity('Bash', { command: 'git status' })     // → "Checking git status"
formatToolActivity('Bash', { command: 'npm install' })    // → "Installing dependencies"
formatToolActivity('Bash', { command: 'gh pr create' })   // → "Working with GitHub"
```

Supported command prefixes: `git`, `npm`/`pnpm`/`yarn`, `npx`, `gh`, `curl`, `node`, `ls`, `find`, `mkdir`.

#### Adding New Phrases

To add phrases for new tools or skills:

1. **Skills**: Add to `skillPhrases` object (key: skill name, value: display text)
2. **MCP Tools**: Add to `mcpPhrases` object (key: tool name without prefix)
3. **New Tool Types**: Add a new `if (toolName === 'ToolName')` block

Keep phrases:
- Short (2-4 words)
- Action-oriented ("Checking", "Reading", "Creating")
- User-friendly (no technical jargon)
