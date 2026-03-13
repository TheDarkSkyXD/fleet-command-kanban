import { spawn } from "child_process";
import os from "os";
import { findClaudeBinary, getClaudeSpawnEnv } from "../utils/claude-path.js";

/**
 * Extract a clean title from Claude's response.
 * Handles markdown formatting and extra text.
 */
function extractTitle(output: string): string | null {
  // Look for markdown bold: **Title Here**
  const boldMatch = output.match(/\*\*([^*]+)\*\*/);
  if (boldMatch) {
    return boldMatch[1].trim();
  }

  // Look for a short line that looks like a title (3-8 words, no punctuation at end except ?)
  const lines = output
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  for (const line of lines) {
    const words = line.split(/\s+/);
    if (
      words.length >= 2 &&
      words.length <= 8 &&
      !line.includes(":") &&
      !line.startsWith("I ")
    ) {
      return line;
    }
  }

  return null;
}

/**
 * Generate a short title summarizing the given text using Claude Haiku.
 * Uses minimal system prompt to save tokens.
 */
export async function summarizeToTitle(text: string): Promise<string> {
  const claudePath = findClaudeBinary();
  if (!claudePath) {
    return "Untitled";
  }

  const prompt = `Generate a 3-6 word title for the text below. OUTPUT THE TITLE ONLY. Nothing else. Violations: explanations/preamble/commentary = FAILED; fewer than 3 words = FAILED; more than 6 words = FAILED; quotes around title = FAILED; trailing punctuation = FAILED. Red flags that mean failure: "Let me explain...", "Here's a title:", "The title is:", any context. Just the title. 3-6 words. No quotes. No punctuation. Nothing else. TEXT: ${text}`;

  return new Promise((resolve) => {
    let output = "";
    let stderr = "";
    let resolved = false;

    console.log(
      "[summarizeToTitle] Starting with text:",
      text.substring(0, 50) + "...",
    );

    const proc = spawn(
      claudePath,
      [
        "--print",
        prompt,
        "--model",
        "haiku",
        "--output-format",
        "text",
        "--dangerously-skip-permissions",
      ],
      {
        cwd: os.tmpdir(), // Run from temp dir to avoid project MCP config
        env: getClaudeSpawnEnv(),
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    // Close stdin immediately - we're not sending any input
    proc.stdin?.end();

    // Timeout after 30 seconds
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        proc.kill();
        console.error("[summarizeToTitle] Timed out");
        resolve("New Brainstorm");
      }
    }, 30000);

    proc.stdout.on("data", (data) => {
      const chunk = data.toString();
      output += chunk;
      console.log("[summarizeToTitle] stdout chunk:", chunk.substring(0, 100));
    });

    proc.stderr.on("data", (data) => {
      const chunk = data.toString();
      stderr += chunk;
      console.log("[summarizeToTitle] stderr chunk:", chunk.substring(0, 100));
    });

    proc.on("close", (code) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);

      const title =
        extractTitle(output) || output.trim().split("\n")[0]?.trim();
      if (code === 0 && title && title.length > 0 && title.length < 100) {
        resolve(title);
      } else {
        console.error(
          "[summarizeToTitle] Failed with code:",
          code,
          "stdout:",
          output,
          "stderr:",
          stderr,
        );
        resolve("New Brainstorm");
      }
    });

    proc.on("error", (err) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      console.error("[summarizeToTitle] Process error:", err);
      resolve("New Brainstorm");
    });
  });
}
