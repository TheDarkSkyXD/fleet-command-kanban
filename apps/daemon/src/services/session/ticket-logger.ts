import fs from "fs/promises";
import { createWriteStream, type WriteStream } from "fs";
import path from "path";
import { TASKS_DIR } from "../../config/paths.js";

/**
 * Ticket-specific logging for debugging agent sessions.
 *
 * Creates logs in ~/.fleet-command/tickets/{projectId}/{ticketId}/logs/
 * - daemon.log: Orchestration events and daemon-side logging
 * - prompts/prompt-{N}-{timestamp}.md: Full prompt context for each agent invocation
 *
 * Set FLEET_DEBUG=1 to enable logging (always enabled in development).
 */

const isDebugEnabled = (): boolean => {
  return (
    process.env.FLEET_DEBUG === "1" || process.env.NODE_ENV === "development"
  );
};

interface TicketLoggerState {
  daemonStream: WriteStream | null;
  promptIndex: number;
}

const loggerState: Map<string, TicketLoggerState> = new Map();

function getTicketKey(projectId: string, ticketId: string): string {
  const safeProject = projectId.replace(/\//g, "__");
  return `${safeProject}/${ticketId}`;
}

function getLogsDir(projectId: string, ticketId: string): string {
  const safeProject = projectId.replace(/\//g, "__");
  return path.join(TASKS_DIR, safeProject, ticketId, "logs");
}

function getPromptsDir(projectId: string, ticketId: string): string {
  return path.join(getLogsDir(projectId, ticketId), "prompts");
}

/**
 * Initialize the ticket logger, creating directories and daemon.log stream.
 */
async function ensureTicketLogger(
  projectId: string,
  ticketId: string,
): Promise<TicketLoggerState> {
  const key = getTicketKey(projectId, ticketId);

  let state = loggerState.get(key);
  if (state) return state;

  const logsDir = getLogsDir(projectId, ticketId);
  const promptsDir = getPromptsDir(projectId, ticketId);

  await fs.mkdir(logsDir, { recursive: true });
  await fs.mkdir(promptsDir, { recursive: true });

  // Count existing prompt files to continue numbering
  let promptIndex = 1;
  try {
    const files = await fs.readdir(promptsDir);
    const promptFiles = files.filter(
      (f) => f.startsWith("prompt-") && f.endsWith(".md"),
    );
    if (promptFiles.length > 0) {
      // Extract highest index
      const indices = promptFiles.map((f) => {
        const match = f.match(/^prompt-(\d+)-/);
        return match ? parseInt(match[1], 10) : 0;
      });
      promptIndex = Math.max(...indices) + 1;
    }
  } catch {
    // Directory may not exist yet
  }

  const daemonLogPath = path.join(logsDir, "daemon.log");
  const daemonStream = createWriteStream(daemonLogPath, { flags: "a" });

  state = { daemonStream, promptIndex };
  loggerState.set(key, state);

  return state;
}

/**
 * Log a message to the ticket's daemon.log file.
 */
export async function logToDaemon(
  projectId: string,
  ticketId: string,
  message: string,
  data?: Record<string, unknown>,
): Promise<void> {
  if (!ticketId) return; // Skip for brainstorms
  if (!isDebugEnabled()) return; // Skip if debug disabled

  const state = await ensureTicketLogger(projectId, ticketId);
  const timestamp = new Date().toISOString();

  let line = `[${timestamp}] ${message}`;
  if (data) {
    line += ` ${JSON.stringify(data)}`;
  }

  state.daemonStream?.write(line + "\n");
}

/**
 * Save the full prompt context for an agent invocation.
 * Returns the path to the saved prompt file.
 */
export async function savePrompt(
  projectId: string,
  ticketId: string,
  agentType: string,
  phase: string,
  stage: number,
  prompt: string,
): Promise<string> {
  if (!ticketId) return ""; // Skip for brainstorms
  if (!isDebugEnabled()) return ""; // Skip if debug disabled

  const state = await ensureTicketLogger(projectId, ticketId);
  const promptsDir = getPromptsDir(projectId, ticketId);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `prompt-${state.promptIndex}-${timestamp}.md`;
  const filepath = path.join(promptsDir, filename);

  // Build the full context document
  const content = `# Agent Invocation #${state.promptIndex}

## Metadata

- **Timestamp:** ${new Date().toISOString()}
- **Project:** ${projectId}
- **Ticket:** ${ticketId}
- **Phase:** ${phase}
- **Stage:** ${stage}
- **Agent Type:** ${agentType}

---

## Full Prompt

The following was passed via \`--print\` (includes agent instructions + context):

${prompt}
`;

  await fs.writeFile(filepath, content, "utf-8");

  // Increment index for next invocation
  state.promptIndex++;

  // Also log to daemon.log
  await logToDaemon(projectId, ticketId, `Saved prompt to ${filename}`, {
    agentType,
    phase,
    stage,
  });

  return filepath;
}

/**
 * Close the daemon log stream for a ticket.
 * Call this when a ticket is fully complete.
 */
export function closeTicketLogger(projectId: string, ticketId: string): void {
  const key = getTicketKey(projectId, ticketId);
  const state = loggerState.get(key);

  if (state?.daemonStream) {
    state.daemonStream.end();
    loggerState.delete(key);
  }
}
