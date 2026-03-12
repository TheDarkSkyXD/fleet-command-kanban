import { execSync } from "child_process";
import path from "path";
import os from "os";
import { existsSync } from "fs";

/**
 * Find the Claude CLI binary path.
 * Works on Windows (where), macOS/Linux (which).
 */
export function findClaudeBinary(): string {
  const whichCmd = process.platform === "win32" ? "where claude" : "which claude";
  try {
    const result = execSync(whichCmd, { encoding: "utf-8", stdio: "pipe" }).trim();
    // `where` on Windows can return multiple lines; take the first
    return result.split(/\r?\n/)[0];
  } catch {
    // Fallback to common installation paths
    const home = os.homedir();
    const candidates = [
      path.join(home, ".local", "bin", "claude"),
      path.join(home, ".local", "bin", "claude.exe"),
    ];
    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        return candidate;
      }
    }
    // Last resort fallback
    return path.join(home, ".local", "bin", "claude");
  }
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
