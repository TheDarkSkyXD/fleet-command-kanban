import type { Express, Request, Response } from "express";
import { createWriteStream } from "fs";
import path from "path";
import pty from "node-pty";
import { fileURLToPath } from "url";
import { findClaudeBinary, getClaudeSpawnEnv } from "../../utils/claude-path.js";
import { artifactChatStore } from "../../stores/artifact-chat.store.js";
import {
  readQuestion,
  writeResponse,
  clearQuestion,
  clearResponse,
} from "../../stores/chat.store.js";
import { listArtifacts, getTicket, getArtifactContent } from "../../stores/ticket.store.js";
import { tryLoadAgentDefinition } from "../../services/session/index.js";
import { SESSIONS_DIR } from "../../config/paths.js";
import type { SessionService } from "../../services/session/index.js";
import type { Project } from "../../types/config.types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function registerArtifactChatRoutes(
  app: Express,
  sessionService: SessionService,
  getProjects: () => Map<string, Project>
): void {
  // Start artifact chat session
  app.post(
    "/api/artifact-chat/:project/:ticket/:artifact/start",
    async (req: Request, res: Response) => {
      try {
        const projectId = decodeURIComponent(req.params.project);
        const ticketId = req.params.ticket;
        const artifactFilename = decodeURIComponent(req.params.artifact);
        const { message } = req.body as { message?: string };

        if (!message) {
          res.status(400).json({ error: "Missing message" });
          return;
        }

        // Validate project exists
        const projects = getProjects();
        const project = projects.get(projectId);
        if (!project) {
          res.status(404).json({ error: "Project not found" });
          return;
        }

        // Validate artifact exists
        const artifacts = await listArtifacts(projectId, ticketId);
        const artifact = artifacts.find((a) => a.filename === artifactFilename);
        if (!artifact) {
          res.status(404).json({ error: "Artifact not found" });
          return;
        }

        // Check for existing active session
        const existingSession = artifactChatStore.getActiveSessionForArtifact(
          projectId,
          ticketId,
          artifactFilename
        );
        if (existingSession) {
          res.status(409).json({
            error: "Active session already exists for this artifact",
            contextId: existingSession.contextId,
          });
          return;
        }

        // Create session in store
        const session = artifactChatStore.createSession(
          projectId,
          ticketId,
          artifactFilename
        );

        // Get ticket and artifact content for prompt
        const ticket = await getTicket(projectId, ticketId);
        const artifactContent = await getArtifactContent(
          projectId,
          ticketId,
          artifactFilename
        );

        // Load agent definition
        const agentDef = await tryLoadAgentDefinition(
          projectId,
          "agents/artifact-qa.md"
        );
        if (!agentDef) {
          artifactChatStore.deleteSession(session.contextId);
          res.status(500).json({ error: "Artifact Q&A agent not found" });
          return;
        }

        // Build prompt with context
        const prompt = buildArtifactChatPrompt(
          agentDef.prompt,
          projectId,
          ticketId,
          ticket.title,
          ticket.description || "",
          artifactFilename,
          artifactContent,
          message
        );

        // Spawn Claude session
        await spawnArtifactChatSession(
          session,
          prompt,
          project.path,
          projectId,
          ticketId
        );

        res.json({
          sessionId: session.sessionId,
          contextId: session.contextId,
        });
      } catch (error) {
        console.error("[artifact-chat/start] Error:", error);
        res.status(500).json({ error: (error as Error).message });
      }
    }
  );

  // Get pending question
  app.get(
    "/api/artifact-chat/:project/:ticket/:artifact/pending",
    async (req: Request, res: Response) => {
      try {
        const projectId = decodeURIComponent(req.params.project);
        const contextId = req.query.contextId as string;

        if (!contextId) {
          res.status(400).json({ error: "Missing contextId" });
          return;
        }

        const session = artifactChatStore.getSession(contextId);
        if (!session) {
          res.json({
            sessionActive: false,
            endReason: "completed",
          });
          return;
        }

        // Update activity timestamp
        artifactChatStore.updateActivity(contextId);

        const question = await readQuestion(projectId, contextId);

        res.json({
          question: question
            ? {
                conversationId: question.conversationId,
                question: question.question,
                options: question.options || undefined,
                askedAt: question.askedAt,
              }
            : undefined,
          sessionActive: session.active,
          endReason: session.endReason,
        });
      } catch (error) {
        console.error("[artifact-chat/pending] Error:", error);
        res.status(500).json({ error: (error as Error).message });
      }
    }
  );

  // Send user input
  app.post(
    "/api/artifact-chat/:project/:ticket/:artifact/input",
    async (req: Request, res: Response) => {
      try {
        const projectId = decodeURIComponent(req.params.project);
        const { contextId, message } = req.body as {
          contextId?: string;
          message?: string;
        };

        if (!contextId || !message) {
          res.status(400).json({ error: "Missing contextId or message" });
          return;
        }

        const session = artifactChatStore.getSession(contextId);
        if (!session) {
          res.status(404).json({ error: "Session not found" });
          return;
        }

        if (!session.active) {
          res.status(400).json({ error: "Session is no longer active" });
          return;
        }

        // Update activity and write response
        artifactChatStore.updateActivity(contextId);
        await writeResponse(projectId, contextId, { answer: message });

        res.json({ ok: true });
      } catch (error) {
        console.error("[artifact-chat/input] Error:", error);
        res.status(500).json({ error: (error as Error).message });
      }
    }
  );

  // End session (called when modal closes)
  app.post(
    "/api/artifact-chat/:project/:ticket/:artifact/end",
    async (req: Request, res: Response) => {
      try {
        const projectId = decodeURIComponent(req.params.project);
        const { contextId } = req.body as { contextId?: string };

        if (!contextId) {
          res.status(400).json({ error: "Missing contextId" });
          return;
        }

        const session = artifactChatStore.getSession(contextId);
        if (session) {
          // Stop the Claude session if active
          if (session.active) {
            sessionService.stopSession(session.sessionId);
          }

          // Clean up files
          await clearQuestion(projectId, contextId).catch(() => {});
          await clearResponse(projectId, contextId).catch(() => {});

          // Remove from store
          artifactChatStore.deleteSession(contextId);
        }

        res.json({ ok: true });
      } catch (error) {
        console.error("[artifact-chat/end] Error:", error);
        res.status(500).json({ error: (error as Error).message });
      }
    }
  );
}

// Helper to build the prompt
function buildArtifactChatPrompt(
  agentPrompt: string,
  projectId: string,
  ticketId: string,
  ticketTitle: string,
  ticketDescription: string,
  artifactFilename: string,
  artifactContent: string,
  initialMessage: string
): string {
  return `${agentPrompt}

---

## Context

**Project:** ${projectId}
**Ticket:** ${ticketId}
**Title:** ${ticketTitle}
${ticketDescription ? `**Description:** ${ticketDescription}` : ""}

## Artifact: ${artifactFilename}

\`\`\`markdown
${artifactContent}
\`\`\`

## User's Question

${initialMessage}

---

Begin by answering the user's question about this artifact.`;
}

// Helper to spawn Claude session for artifact chat
async function spawnArtifactChatSession(
  session: ReturnType<typeof artifactChatStore.createSession>,
  prompt: string,
  projectPath: string,
  projectId: string,
  ticketId: string
): Promise<void> {
  const logPath = path.join(SESSIONS_DIR, `${session.sessionId}.jsonl`);
  const logStream = createWriteStream(logPath, { flags: "a" });

  const meta = {
    projectId,
    ticketId,
    artifactChat: true,
    contextId: session.contextId,
    startedAt: new Date().toISOString(),
    status: "running" as const,
  };

  logStream.write(
    JSON.stringify({
      type: "session_start",
      meta,
      timestamp: new Date().toISOString(),
    }) + "\n"
  );

  const mcpProxyPath = path.join(__dirname, "..", "..", "mcp", "proxy.js");

  const mcpConfig = {
    mcpServers: {
      "fleet-command": {
        command: "node",
        args: [mcpProxyPath],
        env: {
          FLEET_PROJECT_ID: projectId,
          FLEET_TICKET_ID: ticketId,
          FLEET_BRAINSTORM_ID: session.contextId, // Use contextId for chat routing
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
    "Skill(superpowers:*),Edit,Write,NotebookEdit",
    "--print",
    prompt,
  ];

  const claudePath = findClaudeBinary();
  if (!claudePath) {
    throw new Error("Claude CLI binary not found");
  }

  const proc = pty.spawn(claudePath, args, {
    name: "xterm-256color",
    cols: 120,
    rows: 40,
    cwd: projectPath,
    env: {
      ...getClaudeSpawnEnv(),
      FLEET_PROJECT_ID: projectId,
      FLEET_TICKET_ID: ticketId,
      FLEET_BRAINSTORM_ID: session.contextId,
    },
  });

  proc.onData((data: string) => {
    const lines = data.split("\n").filter(Boolean);
    for (const line of lines) {
      try {
        const event = JSON.parse(line);
        const logEntry = { ...event, timestamp: new Date().toISOString() };
        logStream.write(JSON.stringify(logEntry) + "\n");
      } catch {
        logStream.write(
          JSON.stringify({
            type: "raw",
            content: line,
            timestamp: new Date().toISOString(),
          }) + "\n"
        );
      }
    }
  });

  proc.onExit(({ exitCode }) => {
    console.log(
      `[artifact-chat] Session ${session.contextId} exited with code: ${exitCode}`
    );

    const endReason =
      exitCode === 0 ? "completed" : exitCode === -1 ? "timeout" : "error";
    artifactChatStore.endSession(session.contextId, endReason);

    logStream.write(
      JSON.stringify({
        type: "session_end",
        meta: {
          ...meta,
          status: exitCode === 0 ? "completed" : "failed",
          exitCode,
          endedAt: new Date().toISOString(),
        },
        timestamp: new Date().toISOString(),
      }) + "\n"
    );
    logStream.end();
  });
}
