import { execSync, spawnSync } from "child_process";
import path from "path";
import os from "os";
import { existsSync } from "fs";

/**
 * Find the Claude CLI binary path.
 * Works on Windows (where), macOS/Linux (which).
 * Returns null if the binary cannot be found.
 */
export function findClaudeBinary(): string | null {
  // Step 1: Check PATH using system command
  const whichCmd =
    process.platform === "win32" ? "where claude" : "which claude";
  try {
    const result = execSync(whichCmd, {
      encoding: "utf-8",
      stdio: "pipe",
      timeout: 5000,
    }).trim();
    // `where` on Windows can return multiple lines; take the first
    const found = result.split(/\r?\n/)[0];
    if (found && existsSync(found)) {
      return found;
    }
  } catch {
    // Not in PATH — fall through to known paths
  }

  // Step 2: Check common installation paths
  const home = os.homedir();
  const candidates = [
    // Windows
    path.join(home, ".local", "bin", "claude.exe"),
    // macOS / Linux
    path.join(home, ".local", "bin", "claude"),
    // macOS Homebrew
    "/usr/local/bin/claude",
    // npm global (Windows)
    path.join(
      process.env.APPDATA || path.join(home, "AppData", "Roaming"),
      "npm",
      "claude.cmd",
    ),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

/** Cached status result */
let cachedStatus: ClaudeStatusResult | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 30_000; // 30 seconds

export interface ClaudeStatusResult {
  installed: boolean;
  authenticated: boolean;
  version: string | null;
  email: string | null;
}

/**
 * Full Claude CLI status check with caching.
 * Returns cached result if within TTL to avoid repeated slow spawnSync calls.
 */
export function getClaudeStatus(forceRefresh = false): ClaudeStatusResult {
  const now = Date.now();
  if (!forceRefresh && cachedStatus && now - cachedAt < CACHE_TTL_MS) {
    return cachedStatus;
  }

  const result = detectClaudeStatus();
  cachedStatus = result;
  cachedAt = now;
  return result;
}

function detectClaudeStatus(): ClaudeStatusResult {
  const notInstalled: ClaudeStatusResult = {
    installed: false,
    authenticated: false,
    version: null,
    email: null,
  };

  const claudePath = findClaudeBinary();
  if (!claudePath) {
    console.log(
      "[claude-status] Claude CLI binary not found in PATH or known locations",
    );
    return notInstalled;
  }

  const cleanEnv = getClaudeSpawnEnv();

  // Step 1: Verify installation via --version
  let version: string | null = null;
  try {
    const vResult = spawnSync(claudePath, ["--version"], {
      encoding: "utf-8",
      timeout: 15_000, // 15s — Windows Defender can be slow on first scan
      env: cleanEnv,
      stdio: "pipe",
      windowsHide: true,
    });

    if (vResult.error) {
      console.error(
        "[claude-status] Version check error:",
        vResult.error.message,
      );
      return notInstalled;
    }

    if (vResult.status !== 0) {
      console.error(
        "[claude-status] Version check exited with status:",
        vResult.status,
        "stderr:",
        vResult.stderr?.trim(),
      );
      return notInstalled;
    }

    version = vResult.stdout.trim();
  } catch (err) {
    console.error(
      "[claude-status] Version check threw:",
      (err as Error).message,
    );
    return notInstalled;
  }

  // Step 2: Check authentication via auth status
  let authenticated = false;
  let email: string | null = null;
  try {
    const aResult = spawnSync(claudePath, ["auth", "status"], {
      encoding: "utf-8",
      timeout: 10_000,
      env: cleanEnv,
      stdio: "pipe",
      windowsHide: true,
    });

    if (aResult.status === 0 && aResult.stdout) {
      try {
        const authData = JSON.parse(aResult.stdout.trim());
        authenticated = authData.loggedIn === true;
        email = authData.email || null;
      } catch {
        // stdout wasn't JSON — older CLI version, assume authed
        authenticated = true;
      }
    } else {
      // CLI exists and --version works — assume authed (older CLI versions
      // don't have `auth status`)
      authenticated = true;
    }
  } catch {
    // Auth check failed but binary works — assume authenticated
    authenticated = true;
  }

  console.log(
    `[claude-status] Detected: v${version}, authenticated=${authenticated}, email=${email}`,
  );
  return { installed: true, authenticated, version, email };
}

/**
 * Get a clean environment for spawning Claude CLI processes.
 * Strips CLAUDECODE env var to prevent "nested session" detection.
 */
export function getClaudeSpawnEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.CLAUDECODE;
  delete env.CLAUDE_CODE_ENTRYPOINT;
  return env;
}
