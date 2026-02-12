import { execSync } from "child_process";
import fs from "fs/promises";
import { createWriteStream, createReadStream, existsSync } from "fs";
import path from "path";
import crypto from "crypto";
import readline from "readline";
import pty from "node-pty";
import { EventEmitter } from "events";
import { fileURLToPath } from "url";

import { SESSIONS_DIR } from "../../config/paths.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

import {
  getTicket,
  listTicketImages,
  updateTicket,
} from "../../stores/ticket.store.js";
import { getProjectById } from "../../stores/project.store.js";
import { getBrainstorm } from "../../stores/brainstorm.store.js";
import {
  createStoredSession,
  endStoredSession,
  getLatestClaudeSessionId,
  updateClaudeSessionId,
  getActiveSessionForBrainstorm,
  getActiveSessionForTicket,
} from "../../stores/session.store.js";
import {
  readResponse,
  readQuestion,
  clearResponse,
  clearQuestion,
  cancelWaitForResponse,
} from "../../stores/chat.store.js";
import type {
  SessionMeta,
  SessionInfo,
  SessionLogEntry,
} from "../../types/session.types.js";
import type { TicketPhase } from "../../types/ticket.types.js";
import type { AgentWorker } from "../../types/template.types.js";
import type { TaskContext } from "../../types/orchestration.types.js";

import type { ActiveSession } from "./types.js";
import { ensureWorktree } from "./worktree.js";
import { getPhaseConfig, phaseRequiresWorktree, getNextEnabledPhase } from "./phase-config.js";
import { buildBrainstormPrompt, buildAgentPrompt } from "./prompts.js";
import { tryLoadAgentDefinition } from "./agent-loader.js";
import { resolveModel } from "./model-resolver.js";
import { logToDaemon, savePrompt } from "./ticket-logger.js";
import {
  startPhase,
  handleAgentCompletion,
  type ExecutorCallbacks,
} from "./worker-executor.js";
import { formatTaskContext } from "./loops/task-loop.js";
import { getPendingVerdict } from "../../server/routes/ralph.routes.js";

export class SessionService {
  private sessions: Map<string, ActiveSession> = new Map();
  private eventEmitter: EventEmitter;

  constructor(eventEmitter: EventEmitter) {
    this.eventEmitter = eventEmitter;
  }

  generateSessionId(): string {
    return `sess_${crypto.randomBytes(8).toString("hex")}`;
  }

  getSessionLogPath(sessionId: string): string {
    return path.join(SESSIONS_DIR, `${sessionId}.jsonl`);
  }

  async listSessions(): Promise<SessionInfo[]> {
    const sessions: SessionInfo[] = [];

    // Add active sessions
    for (const [id, session] of this.sessions) {
      sessions.push({
        id,
        projectId: session.meta.projectId,
        ticketId: session.meta.ticketId,
        ticketTitle: session.meta.ticketTitle,
        brainstormId: session.meta.brainstormId,
        brainstormName: session.meta.brainstormName,
        phase: session.meta.phase,
        worktreePath: session.meta.worktreePath,
        branchName: session.meta.branchName,
        startedAt: session.meta.startedAt,
        status: "running",
      });
    }

    // Add recent completed sessions from files
    try {
      const files = await fs.readdir(SESSIONS_DIR);
      for (const file of files) {
        if (file.endsWith(".jsonl")) {
          const sessionId = file.replace(".jsonl", "");
          if (!this.sessions.has(sessionId)) {
            const meta = await this.getSessionMeta(sessionId);
            if (meta) {
              sessions.push({
                id: sessionId,
                projectId: meta.projectId,
                ticketId: meta.ticketId,
                ticketTitle: meta.ticketTitle,
                brainstormId: meta.brainstormId,
                brainstormName: meta.brainstormName,
                phase: meta.phase,
                worktreePath: meta.worktreePath,
                branchName: meta.branchName,
                startedAt: meta.startedAt,
                status: meta.status || "completed",
                exitCode: meta.exitCode,
                endedAt: meta.endedAt,
              });
            }
          }
        }
      }
    } catch {
      // Sessions directory may not exist yet
    }

    return sessions.sort(
      (a, b) =>
        new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
    );
  }

  async getSessionMeta(sessionId: string): Promise<SessionMeta | null> {
    const logPath = this.getSessionLogPath(sessionId);
    try {
      const { first, last } = await this.readFirstAndLastLines(logPath);
      if (first) {
        const startEvent = JSON.parse(first) as SessionLogEntry;
        if (startEvent.type === "session_start" && startEvent.meta) {
          const meta = { ...startEvent.meta };
          // Check if session has ended by examining last line
          if (last && last !== first) {
            try {
              const endEvent = JSON.parse(last) as SessionLogEntry;
              if (endEvent.type === "session_end" && endEvent.meta) {
                meta.status = endEvent.meta.status;
                meta.exitCode = endEvent.meta.exitCode;
                meta.endedAt = endEvent.meta.endedAt;
              }
            } catch {
              // Last line may not be valid JSON
            }
          }
          return meta;
        }
      }
    } catch {
      // Log file may not exist
    }
    return null;
  }

  private async readFirstAndLastLines(
    filePath: string
  ): Promise<{ first: string | null; last: string | null }> {
    const stream = createReadStream(filePath, { encoding: "utf-8" });
    const rl = readline.createInterface({ input: stream });

    let first: string | null = null;
    let last: string | null = null;

    try {
      for await (const line of rl) {
        if (first === null) {
          first = line;
        }
        last = line;
      }
    } finally {
      rl.close();
      stream.destroy();
    }
    return { first, last };
  }

  async getSessionLog(sessionId: string): Promise<SessionLogEntry[]> {
    const logPath = this.getSessionLogPath(sessionId);
    const content = await fs.readFile(logPath, "utf-8");
    return content
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as SessionLogEntry);
  }

  isActive(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  /**
   * Get all currently processing tickets grouped by project.
   * Used for the processing:sync heartbeat.
   */
  getProcessingTicketsByProject(): Map<string, string[]> {
    const byProject = new Map<string, string[]>();

    for (const [, session] of this.sessions) {
      const { projectId, ticketId } = session.meta;
      if (projectId && ticketId) {
        const existing = byProject.get(projectId) || [];
        if (!existing.includes(ticketId)) {
          existing.push(ticketId);
        }
        byProject.set(projectId, existing);
      }
    }

    return byProject;
  }

  /**
   * Get all currently processing sessions grouped by project.
   * Returns both ticket IDs and brainstorm IDs for each project.
   * Used for the processing:sync heartbeat.
   */
  getProcessingByProject(): Map<string, { ticketIds: string[]; brainstormIds: string[] }> {
    const byProject = new Map<string, { ticketIds: string[]; brainstormIds: string[] }>();

    for (const [, session] of this.sessions) {
      const { projectId, ticketId, brainstormId } = session.meta;
      if (!projectId) continue;

      if (!byProject.has(projectId)) {
        byProject.set(projectId, { ticketIds: [], brainstormIds: [] });
      }

      const entry = byProject.get(projectId)!;

      if (ticketId && !entry.ticketIds.includes(ticketId)) {
        entry.ticketIds.push(ticketId);
      }
      if (brainstormId && !entry.brainstormIds.includes(brainstormId)) {
        entry.brainstormIds.push(brainstormId);
      }
    }

    return byProject;
  }

  /**
   * Spawn a session for a ticket phase using the worker executor.
   * This is the main entry point for starting phase execution.
   */
  async spawnForTicket(
    projectId: string,
    ticketId: string,
    phase: TicketPhase,
    projectPath: string,
  ): Promise<string> {
    console.log(
      `[spawnForTicket] Starting for ticket ${ticketId}, phase ${phase}`,
    );

    // Delegate to the worker executor which handles all orchestration
    const sessionId = await startPhase(
      projectId,
      ticketId,
      phase,
      projectPath,
      this.getExecutorCallbacks(),
    );

    return sessionId || "";
  }

  /**
   * Common session spawning logic for Claude agent processes.
   * Agent instructions are included in the prompt via --print.
   */
  private spawnClaudeSession(
    sessionId: string,
    meta: SessionMeta,
    prompt: string,
    worktreePath: string,
    projectId: string,
    ticketId: string,
    brainstormId: string,
    agentType: string,
    phase: TicketPhase | undefined,
    projectPath: string,
    stage: number,
    additionalDisallowedTools?: string[],
    model?: string,
  ): string {
    // Save prompt for debugging (non-blocking)
    if (ticketId && phase) {
      savePrompt(projectId, ticketId, agentType, phase, stage, prompt).catch(
        (err) =>
          console.error(
            `[spawnClaudeSession] Failed to save prompt: ${err.message}`,
          ),
      );

      logToDaemon(projectId, ticketId, `Spawning session ${sessionId}`, {
        agentType,
        phase,
        stage,
        worktreePath,
        model: model || "default",
      }).catch(() => {});
    }

    const logPath = this.getSessionLogPath(sessionId);
    const logStream = createWriteStream(logPath, { flags: "a" });

    logStream.write(
      JSON.stringify({
        type: "session_start",
        meta,
        timestamp: new Date().toISOString(),
      }) + "\n",
    );

    // Get path to compiled MCP proxy (dist/mcp/proxy.js)
    const mcpProxyPath = path.join(__dirname, "..", "..", "mcp", "proxy.js");

    // Get full path to node (required when running under Electron where PATH may not include node)
    let nodePath: string;
    try {
      nodePath = execSync("which node", { encoding: "utf-8" }).trim();
    } catch {
      // Fallback to common locations
      const fallbacks = [
        path.join(process.env.HOME || "", ".nvm", "versions", "node", "v22.14.0", "bin", "node"),
        path.join(process.env.HOME || "", ".local", "bin", "node"),
        "/usr/local/bin/node",
      ];
      nodePath = fallbacks.find((p) => existsSync(p)) || "node";
    }

    const mcpConfig = {
      mcpServers: {
        "potato-cannon": {
          command: nodePath,
          args: [mcpProxyPath],
          env: {
            POTATO_PROJECT_ID: projectId,
            POTATO_TICKET_ID: ticketId,
            POTATO_BRAINSTORM_ID: brainstormId,
          },
        },
      },
    };

    const args = [
      "--dangerously-skip-permissions",
      "--output-format",
      "stream-json",
      "--verbose",
    ];

    // Add model flag if specified
    if (model) {
      args.push("--model", model);
    }

    args.push("--mcp-config", JSON.stringify(mcpConfig));

    const disallowed = ["Skill(superpowers:*)"];
    if (additionalDisallowedTools && additionalDisallowedTools.length > 0) {
      disallowed.push(...additionalDisallowedTools);
    }
    if (disallowed.length > 0) {
      args.push("--disallowedTools", disallowed.join(","));
    }

    // Agent instructions are included in the prompt
    args.push("--print", prompt);

    let claudePath: string;
    try {
      claudePath = execSync("which claude", { encoding: "utf-8" }).trim();
    } catch {
      claudePath = path.join(process.env.HOME || "", ".local", "bin", "claude");
    }
    console.log(`[spawnClaudeSession] Spawning ${agentType} at: ${claudePath}`);

    const proc = pty.spawn(claudePath, args, {
      name: "xterm-256color",
      cols: 120,
      rows: 40,
      cwd: worktreePath,
      env: {
        ...process.env,
        POTATO_PROJECT_ID: projectId,
        POTATO_TICKET_ID: ticketId,
        POTATO_BRAINSTORM_ID: brainstormId,
      },
    });

    console.log(`[spawnClaudeSession] Claude PTY spawned, pid: ${proc.pid}`);

    let exitResolver!: () => void;
    const exitPromise = new Promise<void>((resolve) => {
      exitResolver = resolve;
    });

    this.sessions.set(sessionId, {
      process: proc,
      meta,
      logStream,
      exitPromise,
      exitResolver,
    });

    this.eventEmitter.emit("session:started", { sessionId, ...meta });

    proc.onData((data: string) => {
      const lines = data.split("\n").filter(Boolean);
      for (const line of lines) {
        try {
          const event = JSON.parse(line);
          const logEntry = { ...event, timestamp: new Date().toISOString() };
          logStream.write(JSON.stringify(logEntry) + "\n");
          this.eventEmitter.emit("session:output", {
            sessionId,
            ...meta,
            event: logEntry,
          });
        } catch {
          const logEntry = {
            type: "raw",
            content: line,
            timestamp: new Date().toISOString(),
          };
          logStream.write(JSON.stringify(logEntry) + "\n");
        }
      }
    });

    proc.onExit(({ exitCode }) => {
      console.log(
        `[spawnClaudeSession] Agent ${agentType} exited with code: ${exitCode}`,
      );

      // Log to ticket daemon.log
      if (ticketId) {
        logToDaemon(projectId, ticketId, `Session ${sessionId} exited`, {
          agentType,
          exitCode,
          phase,
          stage,
        }).catch(() => {});
      }

      const endMeta: SessionMeta = {
        ...meta,
        status: exitCode === 0 ? "completed" : "failed",
        exitCode,
        endedAt: new Date().toISOString(),
      };

      logStream.write(
        JSON.stringify({
          type: "session_end",
          meta: endMeta,
          timestamp: new Date().toISOString(),
        }) + "\n",
      );
      logStream.end();

      const session = this.sessions.get(sessionId);
      if (session?.exitResolver) {
        session.exitResolver();
      }

      this.sessions.delete(sessionId);
      this.eventEmitter.emit("session:ended", { sessionId, ...endMeta });

      // Handle agent completion via new executor
      if (phase && ticketId) {
        handleAgentCompletion(
          projectId,
          ticketId,
          phase,
          projectPath,
          exitCode,
          agentType,
          getPendingVerdict(projectId, ticketId) ?? { approved: exitCode === 0 },
          this.getExecutorCallbacks()
        ).catch((err) =>
          console.error(
            `[spawnClaudeSession] Error in completion handler: ${err.message}`,
          ),
        );
      }
    });

    return sessionId;
  }

  stopSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.process.kill("SIGTERM");
      return true;
    }
    return false;
  }

  /**
   * Terminate an existing session for a context (brainstorm or ticket).
   * Uses the existing sessions table as the "lock" - ended_at IS NULL means active.
   *
   * @param contextType - Either 'brainstorm' or 'ticket'
   * @param contextId - The brainstorm or ticket ID
   */
  private async terminateExistingSession(
    contextType: 'brainstorm' | 'ticket',
    contextId: string
  ): Promise<void> {
    // Query for active session using existing store functions
    const activeSession = contextType === 'brainstorm'
      ? getActiveSessionForBrainstorm(contextId)
      : getActiveSessionForTicket(contextId);

    if (!activeSession) {
      return; // No active session to terminate
    }

    console.log(`[terminateExistingSession] Terminating existing session ${activeSession.id} for ${contextType} ${contextId}`);

    // Step 1: Cancel any pending waitForResponse
    cancelWaitForResponse(contextId);

    // Step 2: Stop the PTY process if it's still running in memory
    if (this.sessions.has(activeSession.id)) {
      this.stopSession(activeSession.id);
    }

    // Step 3: Mark session as ended in database (releases the "lock")
    endStoredSession(activeSession.id, -1); // -1 indicates forced termination

    // Brief delay to allow cleanup
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  async spawnForBrainstorm(
    projectId: string,
    brainstormId: string,
    projectPath: string,
    initialMessage?: string,
  ): Promise<string> {
    console.log(`[spawnForBrainstorm] Starting for brainstorm ${brainstormId}`);

    // Safety check - with exit-on-question, there shouldn't be an active session
    // Log a warning if one exists (indicates unexpected state)
    const existingActive = getActiveSessionForBrainstorm(brainstormId);
    if (existingActive && this.sessions.has(existingActive.id)) {
      console.warn(`[spawnForBrainstorm] Unexpected: active session ${existingActive.id} exists for ${brainstormId}`);
    }

    const brainstorm = await getBrainstorm(projectId, brainstormId);
    const existingClaudeSessionId = getLatestClaudeSessionId(brainstormId);

    // Create session record in database
    const storedSession = createStoredSession({
      projectId,
      brainstormId,
      claudeSessionId: existingClaudeSessionId || undefined,
      agentSource: "brainstorm",
    });
    const sessionId = storedSession.id;

    // Check for pending response from previous session
    let pendingContext: { question: string; response: string } | undefined;
    const pendingResponse = await readResponse(projectId, brainstormId);
    const pendingQuestion = await readQuestion(projectId, brainstormId);

    if (pendingResponse && pendingQuestion) {
      console.log(
        `[spawnForBrainstorm] Found pending context - resuming conversation`,
      );
      pendingContext = {
        question: pendingQuestion.question,
        response: pendingResponse.answer,
      };
      // Clear the files so the new session doesn't also pick them up via waitForResponse
      await clearResponse(projectId, brainstormId);
      await clearQuestion(projectId, brainstormId);
    }

    // Only build full prompt for first session; resumed sessions use --resume
    const prompt = existingClaudeSessionId
      ? pendingContext?.response || "Continue the brainstorm."
      : buildBrainstormPrompt(
          projectId,
          brainstormId,
          brainstorm,
          { pendingContext, initialMessage },
        );

    const meta: SessionMeta = {
      projectId,
      brainstormId,
      brainstormName: brainstorm.name,
      worktreePath: projectPath,
      startedAt: new Date().toISOString(),
      status: "running",
    };

    const logPath = this.getSessionLogPath(sessionId);
    const logStream = createWriteStream(logPath, { flags: "a" });

    logStream.write(
      JSON.stringify({
        type: "session_start",
        meta,
        timestamp: new Date().toISOString(),
      }) + "\n",
    );

    const mcpProxyPath = path.join(__dirname, "..", "..", "mcp", "proxy.js");

    const mcpConfig = {
      mcpServers: {
        "potato-cannon": {
          command: "node",
          args: [mcpProxyPath],
          env: {
            POTATO_PROJECT_ID: projectId,
            POTATO_TICKET_ID: "",
            POTATO_BRAINSTORM_ID: brainstormId,
          },
        },
      },
    };

    // Load brainstorm agent from template
    const agentType = "agents/brainstorm.md";
    const agentDefinition = await tryLoadAgentDefinition(projectId, agentType);

    if (!agentDefinition) {
      throw new Error(
        `Brainstorm agent not found in template for project ${projectId}`,
      );
    }

    // Include agent instructions in prompt for new sessions
    // (resumed sessions already have agent context)
    const fullPrompt = existingClaudeSessionId
      ? prompt
      : `${agentDefinition.prompt}\n\n---\n\n${prompt}`;

    const args = [
      "--dangerously-skip-permissions",
      "--output-format",
      "stream-json",
      "--verbose",
      "--mcp-config",
      JSON.stringify(mcpConfig),
    ];

    const disallowed = ["Skill(superpowers:*)", "AskUserQuestion"];
    if (disallowed.length > 0) {
      args.push("--disallowedTools", disallowed.join(","));
    }

    // Use --resume for continuing existing Claude session, --print for new sessions
    if (existingClaudeSessionId) {
      console.log(
        `[spawnForBrainstorm] Resuming Claude session ${existingClaudeSessionId}`,
      );
      args.push("--resume", existingClaudeSessionId);
    }
    args.push("--print", fullPrompt);

    let claudePath: string;
    try {
      claudePath = execSync("which claude", { encoding: "utf-8" }).trim();
    } catch {
      claudePath = path.join(process.env.HOME || "", ".local", "bin", "claude");
    }

    const proc = pty.spawn(claudePath, args, {
      name: "xterm-256color",
      cols: 120,
      rows: 40,
      cwd: projectPath,
      env: {
        ...process.env,
        POTATO_PROJECT_ID: projectId,
        POTATO_BRAINSTORM_ID: brainstormId,
      },
    });

    let exitResolver!: () => void;
    const exitPromise = new Promise<void>((resolve) => {
      exitResolver = resolve;
    });

    this.sessions.set(sessionId, {
      process: proc,
      meta,
      logStream,
      exitPromise,
      exitResolver,
    });

    this.eventEmitter.emit("session:started", { sessionId, ...meta });

    let claudeSessionIdCaptured = !!existingClaudeSessionId;

    proc.onData((data: string) => {
      const lines = data.split("\n").filter(Boolean);
      for (const line of lines) {
        try {
          const event = JSON.parse(line);
          const logEntry = { ...event, timestamp: new Date().toISOString() };
          logStream.write(JSON.stringify(logEntry) + "\n");
          this.eventEmitter.emit("session:output", {
            sessionId,
            ...meta,
            event: logEntry,
          });

          // Capture Claude's session ID from the init event (first session only)
          if (
            !claudeSessionIdCaptured &&
            event.type === "system" &&
            event.subtype === "init" &&
            event.session_id
          ) {
            claudeSessionIdCaptured = true;
            console.log(
              `[spawnForBrainstorm] Captured Claude session ID: ${event.session_id}`,
            );
            // Store in session record
            updateClaudeSessionId(sessionId, event.session_id);
          }
        } catch {
          const logEntry = {
            type: "raw",
            content: line,
            timestamp: new Date().toISOString(),
          };
          logStream.write(JSON.stringify(logEntry) + "\n");
        }
      }
    });

    proc.onExit(({ exitCode }) => {
      const endMeta: SessionMeta = {
        ...meta,
        status: exitCode === 0 ? "completed" : "failed",
        exitCode,
        endedAt: new Date().toISOString(),
      };

      logStream.write(
        JSON.stringify({
          type: "session_end",
          meta: endMeta,
          timestamp: new Date().toISOString(),
        }) + "\n",
      );
      logStream.end();

      // End session record in database
      endStoredSession(sessionId, exitCode);

      const session = this.sessions.get(sessionId);
      if (session?.exitResolver) {
        session.exitResolver();
      }

      this.sessions.delete(sessionId);
      this.eventEmitter.emit("session:ended", { sessionId, ...endMeta });
    });

    return sessionId;
  }

  /**
   * Spawn an agent session via the worker executor
   */
  async spawnAgentWorker(
    projectId: string,
    ticketId: string,
    phase: TicketPhase,
    projectPath: string,
    agentWorker: AgentWorker,
    taskContext?: TaskContext,
    ralphContext?: { phaseId: string; ralphLoopId: string; taskId: string | null }
  ): Promise<string> {
    console.log(`[spawnAgentWorker] Spawning ${agentWorker.source} for phase ${phase}`);

    // Terminate any existing session first (uses sessions table as lock)
    await this.terminateExistingSession('ticket', ticketId);

    const sessionId = this.generateSessionId();

    const ticket = await getTicket(projectId, ticketId);
    const images = await listTicketImages(projectId, ticketId);

    const project = getProjectById(projectId);
    const branchPrefix = project?.branchPrefix || 'potato';

    const needsWorktree = await phaseRequiresWorktree(projectId, phase);
    const worktreePath = needsWorktree
      ? await ensureWorktree(projectPath, ticketId, branchPrefix)
      : projectPath;

    // Load agent definition
    const agentDefinition = await tryLoadAgentDefinition(projectId, agentWorker.source);
    if (!agentDefinition) {
      throw new Error(`Agent ${agentWorker.source} not found in template`);
    }

    // Build prompt with task context if provided
    let prompt = agentDefinition.prompt;
    if (taskContext) {
      prompt += `\n\n---\n\n${formatTaskContext(taskContext)}`;
    }

    // Build ticket context with optional ralph feedback injection
    const ticketContext = await buildAgentPrompt(
      projectId,
      ticketId,
      ticket,
      phase,
      agentWorker,
      images,
      undefined, // agentPrompt - we already have it
      ralphContext
    );
    prompt += `\n\n---\n\n${ticketContext}`;

    const meta: SessionMeta = {
      projectId,
      ticketId,
      ticketTitle: ticket.title,
      phase,
      worktreePath,
      branchName: `${branchPrefix}/${ticketId}`,
      startedAt: new Date().toISOString(),
      status: "running",
      agentType: agentWorker.source,
      stage: 0,
    };

    // Resolve model for this agent
    const resolvedModel = resolveModel(agentWorker.model);

    return this.spawnClaudeSession(
      sessionId,
      meta,
      prompt,
      worktreePath,
      projectId,
      ticketId,
      "",
      agentWorker.source,
      phase,
      projectPath,
      0,
      agentWorker.disallowTools,
      resolvedModel ?? undefined,
    );
  }

  /**
   * Get executor callbacks bound to this service
   */
  private getExecutorCallbacks(): ExecutorCallbacks {
    return {
      spawnAgent: this.spawnAgentWorker.bind(this),
      onPhaseComplete: this.handlePhaseTransition.bind(this),
      onTicketBlocked: this.handleTicketBlocked.bind(this),
    };
  }

  /**
   * Handle phase transition via executor
   */
  private async handlePhaseTransition(
    projectId: string,
    ticketId: string,
    completedPhase: TicketPhase,
    projectPath: string
  ): Promise<void> {
    const nextPhase = await getNextEnabledPhase(projectId, completedPhase);
    if (!nextPhase) {
      console.log(`[handlePhaseTransition] No next phase after ${completedPhase}`);
      return;
    }

    await updateTicket(projectId, ticketId, { phase: nextPhase });
    console.log(`[handlePhaseTransition] Transitioned to ${nextPhase}`);

    // Check if next phase has workers
    const phaseConfig = await getPhaseConfig(projectId, nextPhase);
    if (phaseConfig?.workers && phaseConfig.workers.length > 0) {
      await startPhase(projectId, ticketId, nextPhase, projectPath, this.getExecutorCallbacks());
    }
  }

  /**
   * Handle ticket blocked - move to Blocked phase
   */
  private async handleTicketBlocked(
    projectId: string,
    ticketId: string,
    reason: string
  ): Promise<void> {
    console.log(`[handleTicketBlocked] Blocking ticket ${ticketId}: ${reason}`);
    await updateTicket(projectId, ticketId, { phase: "Blocked" });
    await logToDaemon(projectId, ticketId, `Ticket blocked: ${reason}`);
    // TODO: Send chat notification
  }

  async stopAll(timeout: number = 4000): Promise<void> {
    if (this.sessions.size === 0) return;

    console.log(
      `[stopAll] Stopping ${this.sessions.size} active session(s)...`,
    );

    const exitPromises: Promise<void>[] = [];
    for (const [sessionId, session] of this.sessions) {
      if (session.exitPromise) {
        exitPromises.push(session.exitPromise);
      }
      this.stopSession(sessionId);
    }

    if (exitPromises.length > 0) {
      const timeoutPromise = new Promise<void>((resolve) =>
        setTimeout(() => {
          console.log(`[stopAll] Timeout waiting for sessions to exit`);
          resolve();
        }, timeout),
      );

      await Promise.race([Promise.all(exitPromises), timeoutPromise]);
    }

    console.log(`[stopAll] All sessions stopped`);
  }
}
