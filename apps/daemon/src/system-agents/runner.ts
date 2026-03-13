// src/system-agents/runner.ts

import path from "path";
import crypto from "crypto";
import pty from "node-pty";
import { fileURLToPath } from "url";
import type { SystemAgentResult, SystemAgentOptions } from "./types.js";
import { loadSystemAgent } from "./loader.js";
import { findClaudeBinary, getClaudeSpawnEnv } from "../utils/claude-path.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Run a system agent with the given input.
 * Spawns Claude via PTY, waits for completion, and returns the result.
 */
export async function runSystemAgent<TInput>(
  agentName: string,
  input: TInput,
  options: SystemAgentOptions = {},
): Promise<SystemAgentResult> {
  const {
    projectId = "",
    ticketId = "",
    brainstormId = "",
    workingDir = process.cwd(),
    timeout,
  } = options;

  const sessionId = `sys_${crypto.randomBytes(8).toString("hex")}`;

  // Load agent definition
  const agent = await loadSystemAgent(agentName);

  // Build prompt with input context
  const inputJson = JSON.stringify(input, null, 2);
  const prompt = `${agent.prompt}\n\n---\n\n## Input\n\n\`\`\`json\n${inputJson}\n\`\`\`\n\nBegin.`;

  // Get path to MCP proxy
  const mcpProxyPath = path.join(__dirname, "..", "mcp", "proxy.js");

  const mcpConfig = {
    mcpServers: {
      "fleet-command": {
        command: "node",
        args: [mcpProxyPath],
        env: {
          FLEET_PROJECT_ID: projectId,
          FLEET_TICKET_ID: ticketId,
          FLEET_BRAINSTORM_ID: brainstormId,
        },
      },
    },
  };

  const args = [
    "--dangerously-skip-permissions",
    "--output-format",
    "stream-json",
    "--verbose",
    "--mcp-config",
    JSON.stringify(mcpConfig),
    "--disallowedTools",
    "Skill(superpowers:*)",
    "--print",
    prompt,
  ];

  // Find claude binary
  const claudePath = findClaudeBinary();
  if (!claudePath) {
    return { status: "failed", output: "Error: Claude CLI binary not found", exitCode: 1 };
  }

  return new Promise((resolve) => {
    let outputBuffer = "";
    let timeoutId: NodeJS.Timeout | undefined;

    const proc = pty.spawn(claudePath, args, {
      name: "xterm-256color",
      cols: 120,
      rows: 40,
      cwd: workingDir,
      env: {
        ...getClaudeSpawnEnv(),
        FLEET_PROJECT_ID: projectId,
        FLEET_TICKET_ID: ticketId,
        FLEET_BRAINSTORM_ID: brainstormId,
      },
    });

    if (timeout) {
      timeoutId = setTimeout(() => {
        proc.kill("SIGTERM");
        resolve({
          status: "interrupted",
          output: outputBuffer,
          exitCode: -1,
          sessionId,
        });
      }, timeout);
    }

    proc.onData((data: string) => {
      // Parse stream-json output and extract assistant messages
      const lines = data.split("\n").filter(Boolean);
      for (const line of lines) {
        try {
          const event = JSON.parse(line);
          if (event.type === "assistant" && event.message?.content) {
            for (const block of event.message.content) {
              if (block.type === "text") {
                outputBuffer += block.text;
              }
            }
          }
        } catch {
          // Non-JSON output, ignore
        }
      }
    });

    proc.onExit(({ exitCode }) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      resolve({
        status: exitCode === 0 ? "success" : "failed",
        output: outputBuffer.trim(),
        exitCode: exitCode ?? -1,
        sessionId,
      });
    });
  });
}
