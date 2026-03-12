# Detecting Claude Code CLI: Installation, Authentication & the `.claude` Folder

A reference guide for integrating with the Claude Code CLI subscription. Covers how to detect installation, verify authentication, discover the `.claude` configuration directory, spawn sessions, and interact with the plugin system.

---

## Table of Contents

1. [Overview](#overview)
2. [Detecting if Claude Code CLI is Installed](#detecting-if-claude-code-cli-is-installed)
3. [Checking Authentication Status](#checking-authentication-status)
4. [The `.claude` Folder](#the-claude-folder)
5. [Environment Variables](#environment-variables)
6. [Spawning Claude Code Sessions](#spawning-claude-code-sessions)
7. [Full Detection Endpoint Example](#full-detection-endpoint-example)
8. [Frontend Integration](#frontend-integration)
9. [Plugin / Marketplace System](#plugin--marketplace-system)
10. [Implementation Checklist](#implementation-checklist)

---

## Overview

Claude Code CLI is Anthropic's official command-line tool for interacting with Claude. When a user has an active Claude Code subscription (Pro, Max, etc.), the CLI is installed locally and authenticated via OAuth. Any application can detect this and leverage the CLI to spawn Claude sessions without managing API keys directly — the CLI handles authentication through the user's subscription.

**Key insight:** You don't need API keys. The CLI uses the user's OAuth session from their Anthropic account. If the CLI is installed and authenticated, you can spawn Claude sessions that are billed to the user's subscription.

---

## Detecting if Claude Code CLI is Installed

### Strategy

1. Use the system's path-lookup command (`which` on Unix, `where` on Windows)
2. Fall back to known default installation paths
3. Verify the binary works by running `claude --version`

### Binary Discovery

```typescript
import { execSync } from "child_process";
import path from "path";
import os from "os";
import { existsSync } from "fs";

function findClaudeBinary(): string | null {
  // Step 1: Check PATH using system command
  const whichCmd = process.platform === "win32" ? "where claude" : "which claude";
  try {
    const result = execSync(whichCmd, {
      encoding: "utf-8",
      stdio: "pipe",
    }).trim();
    // `where` on Windows can return multiple lines; take the first
    return result.split(/\r?\n/)[0];
  } catch {
    // Not in PATH — fall through to fallback
  }

  // Step 2: Check common installation paths
  const home = os.homedir();
  const candidates = [
    path.join(home, ".local", "bin", "claude"),       // Linux/macOS
    path.join(home, ".local", "bin", "claude.exe"),   // Windows
    "/usr/local/bin/claude",                          // macOS Homebrew
    path.join(home, "AppData", "Local", "Programs", "claude", "claude.exe"), // Windows alternate
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null; // Not found
}
```

### Version Verification

Finding the binary isn't enough — verify it actually runs:

```typescript
import { spawnSync } from "child_process";

function getClaudeVersion(claudePath: string): string | null {
  try {
    const result = spawnSync(claudePath, ["--version"], {
      encoding: "utf-8",
      timeout: 5000,
      stdio: "pipe",
    });
    if (result.status === 0) {
      return result.stdout.trim(); // e.g., "1.0.16 (Claude Code)"
    }
    return null;
  } catch {
    return null;
  }
}
```

### Platform Notes

| Platform | PATH lookup | Default install path |
|----------|-------------|---------------------|
| macOS    | `which claude` | `~/.local/bin/claude` |
| Linux    | `which claude` | `~/.local/bin/claude` |
| Windows  | `where claude` | `~/.local/bin/claude.exe` |

---

## Checking Authentication Status

The CLI provides a built-in command to check auth status. This tells you whether the user has logged in with their Anthropic account (which implies an active subscription).

### Auth Status Command

```bash
claude auth status
```

Returns JSON when authenticated:

```json
{
  "loggedIn": true,
  "email": "user@example.com"
}
```

### Programmatic Auth Check

```typescript
function checkClaudeAuth(claudePath: string): {
  authenticated: boolean;
  email: string | null;
} {
  try {
    const result = spawnSync(claudePath, ["auth", "status"], {
      encoding: "utf-8",
      timeout: 5000,
      stdio: "pipe",
    });

    if (result.status === 0 && result.stdout) {
      const authData = JSON.parse(result.stdout.trim());
      return {
        authenticated: authData.loggedIn === true,
        email: authData.email || null,
      };
    }

    // CLI runs but auth command format may differ across versions.
    // If --version works but auth status fails, the CLI is likely
    // authenticated (older versions didn't have `auth status`).
    return { authenticated: true, email: null };
  } catch {
    // If auth check throws, but the binary exists and --version works,
    // assume authenticated (safe fallback for older CLI versions)
    return { authenticated: true, email: null };
  }
}
```

### Auth Status Decision Tree

```
Binary found?
  ├── No  → NOT INSTALLED
  └── Yes → Run --version
              ├── Fails → INSTALLED BUT BROKEN (bad install, wrong binary)
              └── Works → Run auth status
                            ├── loggedIn: true  → READY (has subscription)
                            ├── loggedIn: false → NOT AUTHENTICATED (needs login)
                            └── Command fails   → ASSUME READY (older CLI version)
```

---

## The `.claude` Folder

The `~/.claude/` directory is Claude Code's configuration home. Understanding its structure allows you to inspect configuration, manage plugins, and detect the CLI's state.

### Directory Structure

```
~/.claude/
├── settings.json          # User settings (theme, permissions, etc.)
├── credentials.json       # OAuth tokens (DO NOT READ — treat as opaque)
├── statsig/               # Feature flags / analytics (internal)
├── plugins/               # Plugin system
│   ├── installed.json     # List of installed plugins
│   └── cache/             # Marketplace caches
│       └── {marketplace-name}/
│           └── ...        # Cached marketplace data
├── projects/              # Per-project settings
│   └── {path-hash}/
│       ├── settings.json  # Project-level settings
│       └── CLAUDE.md      # Project instructions
└── todos/                 # Task tracking
```

### Key Files

| File | Purpose | Safe to Read? |
|------|---------|---------------|
| `~/.claude/settings.json` | User preferences, permission settings | Yes |
| `~/.claude/credentials.json` | OAuth tokens for authentication | **No** — never read or parse this |
| `~/.claude/plugins/installed.json` | Registry of installed plugins | Yes |
| `~/.claude/plugins/cache/` | Marketplace plugin caches | Yes (for cache management) |
| `~/.claude/projects/` | Per-project overrides | Yes |

### Detecting `.claude` Existence

The presence of `~/.claude/` is a signal that Claude Code has been used on this machine, but **do not rely on it for auth detection**. Always use `claude auth status` instead.

```typescript
import { existsSync } from "fs";
import path from "path";
import os from "os";

function hasClaudeFolder(): boolean {
  return existsSync(path.join(os.homedir(), ".claude"));
}

function hasClaudeCredentials(): boolean {
  return existsSync(path.join(os.homedir(), ".claude", "credentials.json"));
}
```

### Important: Never Parse `credentials.json`

The credentials file contains OAuth tokens. **Do not read, parse, or use these tokens directly.** The correct way to leverage authentication is to spawn the CLI itself — it handles token refresh, session management, and all auth flows internally. Attempting to use the tokens directly will break when Anthropic rotates formats and may violate terms of service.

---

## Environment Variables

When spawning Claude Code as a subprocess, certain environment variables affect its behavior:

### Variables to Strip

When your application spawns Claude Code, strip these environment variables to prevent the CLI from detecting it's running inside another Claude session:

```typescript
function getCleanEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.CLAUDECODE;              // Claude Code environment marker
  delete env.CLAUDE_CODE_ENTRYPOINT;  // Entry point reference
  return env;
}
```

**Why?** If these are set, the CLI may refuse to run or alter its behavior because it thinks it's a nested session.

### Variables Claude Code Reads

| Variable | Purpose |
|----------|---------|
| `CLAUDECODE` | Set by Claude Code when running — presence means "inside a Claude session" |
| `CLAUDE_CODE_ENTRYPOINT` | How Claude Code was launched |
| `ANTHROPIC_API_KEY` | If set, CLI uses this API key instead of OAuth (for API-key users) |

---

## Spawning Claude Code Sessions

Once the CLI is installed and authenticated, you can spawn Claude sessions programmatically. The CLI supports a `--print` flag for non-interactive one-shot execution and `stream-json` output for parsing structured responses.

### Basic Session Spawn

```typescript
import * as pty from "node-pty";

function spawnClaudeSession(options: {
  claudePath: string;
  prompt: string;
  cwd: string;
  model?: string;
  env?: NodeJS.ProcessEnv;
}) {
  const args = [
    "--dangerously-skip-permissions",  // Required for non-interactive use
    "--output-format", "stream-json",  // Structured JSON output
    "--verbose",                       // Include tool use details
  ];

  if (options.model) {
    args.push("--model", options.model);
  }

  // The prompt to execute
  args.push("--print", options.prompt);

  const proc = pty.spawn(options.claudePath, args, {
    name: "xterm-256color",
    cols: 120,
    rows: 40,
    cwd: options.cwd,
    env: options.env || getCleanEnv(),
  });

  return proc;
}
```

### Parsing Stream JSON Output

Claude Code with `--output-format stream-json` emits newline-delimited JSON events:

```typescript
proc.onData((rawData: string) => {
  const lines = rawData.split("\n").filter(Boolean);
  for (const line of lines) {
    try {
      const event = JSON.parse(line);
      switch (event.type) {
        case "assistant":
          // Claude's text response
          console.log(event.message);
          break;
        case "tool_use":
          // Claude is using a tool
          console.log(`Tool: ${event.name}`, event.input);
          break;
        case "tool_result":
          // Tool execution result
          console.log(`Result:`, event.content);
          break;
        case "error":
          console.error(event.error);
          break;
      }
    } catch {
      // Non-JSON output (startup messages, etc.)
    }
  }
});

proc.onExit(({ exitCode }) => {
  console.log(`Session exited with code ${exitCode}`);
});
```

### Session Resume

Claude Code supports resuming previous sessions:

```typescript
args.push("--resume", previousSessionId);
```

### MCP (Model Context Protocol) Integration

You can inject custom tools into Claude sessions via MCP configuration:

```typescript
const mcpConfig = {
  mcpServers: {
    "my-app": {
      command: "node",
      args: ["/path/to/my-mcp-server.js"],
      env: {
        MY_APP_TOKEN: "...",
      },
    },
  },
};

args.push("--mcp-config", JSON.stringify(mcpConfig));
```

---

## Full Detection Endpoint Example

Here's a complete HTTP endpoint that checks Claude Code CLI status — ready to drop into any Express/Node.js app:

```typescript
import express from "express";
import { spawnSync } from "child_process";

interface ClaudeStatus {
  installed: boolean;
  authenticated: boolean;
  version: string | null;
  email: string | null;
}

app.get("/api/claude-status", async (_req, res) => {
  try {
    const claudePath = findClaudeBinary();
    if (!claudePath) {
      return res.json({
        installed: false,
        authenticated: false,
        version: null,
        email: null,
      } satisfies ClaudeStatus);
    }

    const cleanEnv = getCleanEnv();

    // Step 1: Verify installation via --version
    let version: string | null = null;
    try {
      const vResult = spawnSync(claudePath, ["--version"], {
        encoding: "utf-8",
        timeout: 5000,
        env: cleanEnv,
      });
      if (vResult.status !== 0) {
        return res.json({
          installed: false,
          authenticated: false,
          version: null,
          email: null,
        });
      }
      version = vResult.stdout.trim();
    } catch {
      return res.json({
        installed: false,
        authenticated: false,
        version: null,
        email: null,
      });
    }

    // Step 2: Check authentication via auth status
    let authenticated = false;
    let email: string | null = null;
    try {
      const aResult = spawnSync(claudePath, ["auth", "status"], {
        encoding: "utf-8",
        timeout: 5000,
        env: cleanEnv,
      });
      if (aResult.status === 0 && aResult.stdout) {
        const authData = JSON.parse(aResult.stdout.trim());
        authenticated = authData.loggedIn === true;
        email = authData.email || null;
      } else {
        // CLI works but auth command format differs — assume authed
        authenticated = true;
      }
    } catch {
      authenticated = true;
    }

    res.json({ installed: true, authenticated, version, email });
  } catch {
    res.json({
      installed: false,
      authenticated: false,
      version: null,
      email: null,
    });
  }
});
```

---

## Frontend Integration

### React Hook (TanStack Query)

```typescript
import { useQuery } from "@tanstack/react-query";

interface ClaudeStatus {
  installed: boolean;
  authenticated: boolean;
  version: string | null;
  email: string | null;
}

export function useClaudeStatus() {
  return useQuery({
    queryKey: ["claude-status"],
    queryFn: async (): Promise<ClaudeStatus> => {
      const res = await fetch("/api/claude-status");
      return res.json();
    },
    staleTime: 60_000,  // Check at most once per minute
    retry: false,        // Don't retry — absence is a valid state
  });
}
```

### Status Indicator Component

```tsx
function ClaudeStatusIndicator() {
  const { data: status, isLoading } = useClaudeStatus();

  if (isLoading) return <Spinner />;

  if (!status?.installed) {
    return <Badge variant="destructive">CLI Not Installed</Badge>;
  }

  if (!status.authenticated) {
    return <Badge variant="warning">Not Authenticated</Badge>;
  }

  return (
    <Badge variant="success">
      Claude {status.version} ({status.email})
    </Badge>
  );
}
```

---

## Plugin / Marketplace System

Claude Code has a plugin system that allows applications to register custom tools and skills. These are accessed through the `~/.claude/plugins/` directory.

### Marketplace Structure

```
~/.claude/plugins/
├── installed.json                    # Plugin registry
└── cache/
    └── {marketplace-name}/           # Marketplace cache
        └── plugins/
            └── {plugin-name}/
                └── .claude-plugin/
                    └── plugin.json   # Plugin metadata
```

### Installing a Plugin Programmatically

```typescript
// Register a marketplace (local directory containing plugins)
await runClaudeCommand(claudePath, [
  "plugin", "marketplace", "add", "/path/to/marketplace"
]);

// Install a specific plugin from that marketplace
await runClaudeCommand(claudePath, [
  "plugin", "install", "my-plugin@my-marketplace"
]);
```

### Uninstalling

```typescript
// Uninstall plugin first, then marketplace
await runClaudeCommand(claudePath, [
  "plugin", "uninstall", "my-plugin@my-marketplace"
]);
await runClaudeCommand(claudePath, [
  "plugin", "marketplace", "remove", "my-marketplace"
]);

// Clear cached data
const cacheDir = path.join(os.homedir(), ".claude", "plugins", "cache", "my-marketplace");
if (existsSync(cacheDir)) {
  rmSync(cacheDir, { recursive: true, force: true });
}
```

---

## Implementation Checklist

Use this checklist when adding Claude Code CLI detection to your application:

### Detection Layer
- [ ] Implement `findClaudeBinary()` with platform-specific PATH lookup
- [ ] Add fallback paths for common installation locations
- [ ] Verify binary with `claude --version` (don't trust existence alone)
- [ ] Check auth with `claude auth status` and parse JSON response
- [ ] Handle older CLI versions where `auth status` may not exist

### Environment
- [ ] Strip `CLAUDECODE` and `CLAUDE_CODE_ENTRYPOINT` before spawning
- [ ] Use clean environment copies (don't mutate `process.env`)
- [ ] Set timeout on all `spawnSync` calls (5s recommended)

### Session Spawning
- [ ] Use `node-pty` for PTY-based session management
- [ ] Pass `--dangerously-skip-permissions` for non-interactive use
- [ ] Use `--output-format stream-json` for structured output parsing
- [ ] Handle session exit codes and cleanup
- [ ] Support `--resume` for session continuity

### Security
- [ ] Never read or parse `~/.claude/credentials.json`
- [ ] Never store or log OAuth tokens
- [ ] Always use the CLI as the auth intermediary
- [ ] Set appropriate timeouts on all subprocess calls

### Frontend
- [ ] Create a status endpoint that returns `{ installed, authenticated, version, email }`
- [ ] Poll with reasonable intervals (60s+) — don't hammer the CLI
- [ ] Show clear UI states: not installed, not authenticated, ready
- [ ] Provide setup instructions when CLI is missing

---

## Quick Reference: CLI Commands

| Command | Purpose | Output |
|---------|---------|--------|
| `claude --version` | Check if installed and get version | Version string |
| `claude auth status` | Check OAuth authentication | `{ loggedIn, email }` JSON |
| `claude auth login` | Trigger OAuth login flow | Interactive browser flow |
| `claude auth logout` | Remove authentication | Clears credentials |
| `claude --print "prompt"` | One-shot non-interactive execution | Claude's response |
| `claude --output-format stream-json` | Structured JSON output | Newline-delimited JSON |
| `claude --resume {id}` | Resume a previous session | Continues conversation |
| `claude plugin marketplace add {path}` | Register a plugin marketplace | Success/error |
| `claude plugin install {id}` | Install a plugin | Success/error |

---

*This document is based on Fleet Command's implementation. Source files: `apps/daemon/src/utils/claude-path.ts`, `apps/daemon/src/server/server.ts` (lines 588-633), `apps/daemon/src/marketplace/bootstrap.ts`.*
