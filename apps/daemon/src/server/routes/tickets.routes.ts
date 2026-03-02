import type { Express, Request, Response } from "express";
import path from "path";
import multer from "multer";
import { eventBus } from "../../utils/event-bus.js";
import { TASKS_DIR } from "../../config/paths.js";
import {
  listTickets,
  getTicket,
  createTicket,
  updateTicket,
  deleteTicket,
  archiveTicket,
  restoreTicket,
  listTicketImages,
  saveTicketImage,
  deleteTicketImage,
  listArtifacts,
  getArtifactContent,
  saveArtifact,
  loadConversations,
  appendConversation,
} from "../../stores/ticket.store.js";
import { DEFAULT_PHASES } from "../../types/index.js";
import { readQuestion, writeResponse } from "../../stores/chat.store.js";
import { getActiveSessionForTicket } from "../../stores/session.store.js";
import { getMessages } from "../../stores/conversation.store.js";
import type { SessionService } from "../../services/session/index.js";
import type { Project } from "../../types/config.types.js";
import type { TicketPhase } from "../../types/ticket.types.js";
import { resolveTargetPhase, getPhaseConfig } from "../../services/session/phase-config.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

export function registerTicketRoutes(
  app: Express,
  sessionService: SessionService,
  getProjects: () => Map<string, Project>,
): void {
  // List tickets
  app.get("/api/tickets/:project", async (req: Request, res: Response) => {
    try {
      const projectId = decodeURIComponent(req.params.project);
      const phase = (req.query.phase as TicketPhase) || null;
      const archivedParam = req.query.archived as string | undefined;

      // Parse archived parameter: "true" = only archived, "false" or absent = non-archived
      let archived: boolean | undefined;
      if (archivedParam === "true") {
        archived = true;
      } else if (archivedParam === "false") {
        archived = false;
      }
      // If archivedParam is undefined, archived stays undefined (default = false in store)

      const tickets = await listTickets(projectId, { phase, archived });
      res.json(tickets);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Create ticket
  app.post("/api/tickets/:project", async (req: Request, res: Response) => {
    try {
      const projectId = decodeURIComponent(req.params.project);
      const { title, description } = req.body as {
        title?: string;
        description?: string;
      };

      if (!title) {
        res.status(400).json({ error: "Missing title" });
        return;
      }

      const ticket = await createTicket(projectId, { title, description });
      eventBus.emit("ticket:created", { projectId, ticket });
      res.json(ticket);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Get ticket
  app.get("/api/tickets/:project/:id", async (req: Request, res: Response) => {
    try {
      const projectId = decodeURIComponent(req.params.project);
      const ticketId = req.params.id;
      const ticket = await getTicket(projectId, ticketId);
      res.json(ticket);
    } catch (error) {
      res.status(404).json({ error: "Ticket not found" });
    }
  });

  // Update ticket
  app.put("/api/tickets/:project/:id", async (req: Request, res: Response) => {
    try {
      const projectId = decodeURIComponent(req.params.project);
      const ticketId = req.params.id;
      const updates = req.body as { phase?: TicketPhase; sessionId?: string };

      const oldTicket = await getTicket(projectId, ticketId);
      const oldPhase = oldTicket.phase;

      // Resolve target phase if moving to a potentially disabled phase
      let resolvedPhase = updates.phase;
      if (updates.phase && updates.phase !== oldPhase) {
        resolvedPhase = (await resolveTargetPhase(
          projectId,
          updates.phase,
        )) as TicketPhase;
        if (resolvedPhase !== updates.phase) {
          console.log(
            `[updateTicket] Phase ${updates.phase} is disabled, resolved to ${resolvedPhase}`,
          );
        }
      }

      const ticket = await updateTicket(projectId, ticketId, {
        ...updates,
        phase: resolvedPhase,
      });

      eventBus.emit("ticket:updated", { projectId, ticket });

      if (resolvedPhase && resolvedPhase !== oldPhase) {
        eventBus.emit("ticket:moved", {
          projectId,
          ticketId,
          from: oldPhase,
          to: resolvedPhase,
        });

        // Check if target phase has automation (workers defined in template)
        const phaseConfig = await getPhaseConfig(projectId, resolvedPhase);
        const hasAutomation = phaseConfig?.workers && phaseConfig.workers.length > 0;

        if (hasAutomation) {
          const projects = getProjects();
          const project = projects.get(projectId);
          if (project) {
            const activeSession = getActiveSessionForTicket(ticketId);
            if (activeSession) {
              console.log(
                `Ticket ${ticketId} already has an active session, skipping spawn`,
              );
            } else {
              console.log(
                `Ticket ${ticketId} moved to ${resolvedPhase}, spawning Claude...`,
              );
              sessionService
                .spawnForTicket(
                  projectId,
                  ticketId,
                  resolvedPhase,
                  project.path,
                )
                .catch((error: Error) => {
                  console.error(
                    `[spawnForTicket] Failed to spawn session: ${error.message}`,
                  );
                });
            }
          }
        }
      }

      res.json(ticket);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Delete ticket
  app.delete(
    "/api/tickets/:project/:id",
    async (req: Request, res: Response) => {
      try {
        const projectId = decodeURIComponent(req.params.project);
        const ticketId = req.params.id;
        await deleteTicket(projectId, ticketId);
        eventBus.emit("ticket:deleted", { projectId, ticketId });
        res.json({ ok: true });
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    },
  );

  // Archive ticket
  app.patch(
    "/api/tickets/:project/:id/archive",
    async (req: Request, res: Response) => {
      try {
        const projectId = decodeURIComponent(req.params.project);
        const ticketId = req.params.id;

        const result = await archiveTicket(projectId, ticketId);
        eventBus.emit("ticket:archived", {
          projectId,
          ticketId,
          ticket: result.ticket,
          cleanup: result.cleanup,
        });
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    },
  );

  // Restore ticket
  app.patch(
    "/api/tickets/:project/:id/restore",
    async (req: Request, res: Response) => {
      try {
        const projectId = decodeURIComponent(req.params.project);
        const ticketId = req.params.id;

        const ticket = await restoreTicket(projectId, ticketId);
        eventBus.emit("ticket:restored", { projectId, ticketId, ticket });
        res.json(ticket);
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    },
  );

  // List ticket images
  app.get(
    "/api/tickets/:project/:id/images",
    async (req: Request, res: Response) => {
      try {
        const projectId = decodeURIComponent(req.params.project);
        const ticketId = req.params.id;
        const images = await listTicketImages(projectId, ticketId);
        res.json(images);
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    },
  );

  // Upload image
  app.post(
    "/api/tickets/:project/:id/images",
    upload.single("image"),
    async (req: Request, res: Response) => {
      try {
        const projectId = decodeURIComponent(req.params.project);
        const ticketId = req.params.id;

        if (!req.file) {
          res.status(400).json({ error: "No image uploaded" });
          return;
        }

        const filename = req.file.originalname || `image-${Date.now()}.png`;
        const image = await saveTicketImage(
          projectId,
          ticketId,
          filename,
          req.file.buffer,
        );

        res.json(image);
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    },
  );

  // Serve ticket image
  app.get(
    "/api/tickets/:project/:id/images/:name",
    async (req: Request, res: Response) => {
      try {
        const projectId = decodeURIComponent(req.params.project);
        const ticketId = req.params.id;
        const filename = req.params.name;

        const safeProjectId = projectId.replace(/\//g, "__");
        const imagePath = path.join(
          TASKS_DIR,
          safeProjectId,
          ticketId,
          "images",
          filename,
        );

        res.sendFile(imagePath);
      } catch (error) {
        res.status(404).json({ error: "Image not found" });
      }
    },
  );

  // Delete image
  app.delete(
    "/api/tickets/:project/:id/images/:name",
    async (req: Request, res: Response) => {
      try {
        const projectId = decodeURIComponent(req.params.project);
        const ticketId = req.params.id;
        const filename = req.params.name;
        await deleteTicketImage(projectId, ticketId, filename);
        res.json({ ok: true });
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    },
  );

  // List artifacts
  app.get(
    "/api/tickets/:project/:id/artifacts",
    async (req: Request, res: Response) => {
      try {
        const projectId = decodeURIComponent(req.params.project);
        const ticketId = req.params.id;
        const artifacts = await listArtifacts(projectId, ticketId);
        res.json(artifacts);
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    },
  );

  // Get artifact content
  app.get(
    "/api/tickets/:project/:id/artifacts/:filename",
    async (req: Request, res: Response) => {
      try {
        const projectId = decodeURIComponent(req.params.project);
        const ticketId = req.params.id;
        const filename = req.params.filename;

        const content = await getArtifactContent(projectId, ticketId, filename);
        res.type("text/plain").send(content);
      } catch (error) {
        res.status(404).json({ error: "Artifact not found" });
      }
    },
  );

  // Update artifact content (manual edit)
  app.put(
    "/api/tickets/:project/:id/artifacts/:filename",
    async (req: Request, res: Response) => {
      try {
        const projectId = decodeURIComponent(req.params.project);
        const ticketId = req.params.id;
        const filename = req.params.filename;
        const { content } = req.body;

        if (typeof content !== "string") {
          res.status(400).json({ error: "content is required and must be a string" });
          return;
        }

        const result = await saveArtifact(projectId, ticketId, filename, content);

        // Notify listeners so the frontend can update artifact list
        eventBus.emit("ticket:updated", { projectId, ticketId });

        res.json({
          ok: true,
          filename: result.filename,
          isNewVersion: result.isNewVersion,
        });
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    },
  );

  // Get conversations
  app.get(
    "/api/tickets/:project/:id/conversations",
    async (req: Request, res: Response) => {
      try {
        const projectId = decodeURIComponent(req.params.project);
        const ticketId = req.params.id;
        const conversations = await loadConversations(projectId, ticketId);
        res.json(conversations);
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    },
  );

  // Add conversation
  app.post(
    "/api/tickets/:project/:id/conversations",
    async (req: Request, res: Response) => {
      try {
        const projectId = decodeURIComponent(req.params.project);
        const ticketId = req.params.id;
        const entry = req.body;

        if (!entry.id) {
          res.status(400).json({ error: "Missing conversation id" });
          return;
        }

        const conversations = await appendConversation(
          projectId,
          ticketId,
          entry,
        );
        res.json(conversations);
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    },
  );

  // Get pending question for ticket
  app.get(
    "/api/tickets/:project/:id/pending",
    async (req: Request, res: Response) => {
      try {
        const projectId = decodeURIComponent(req.params.project);
        const ticketId = req.params.id;

        const question = await readQuestion(projectId, ticketId);

        res.json({ question });
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    },
  );

  // Submit response to pending question
  app.post(
    "/api/tickets/:project/:id/input",
    async (req: Request, res: Response) => {
      try {
        const projectId = decodeURIComponent(req.params.project);
        const ticketId = req.params.id;
        const { message } = req.body;

        if (!message) {
          res.status(400).json({ error: "Missing message" });
          return;
        }

        await writeResponse(projectId, ticketId, { answer: message });

        // Check if there's an active session for this ticket.
        // If not, this is a response to a suspended session — spawn a resumed session.
        const activeSession = getActiveSessionForTicket(ticketId);

        if (!activeSession) {
          const projects = getProjects();
          const project = projects.get(projectId);

          if (project) {
            try {
              const newSessionId = await sessionService.resumeSuspendedTicket(
                projectId,
                ticketId,
                message,
              );
              console.log(`[input] Spawned resumed session ${newSessionId} for suspended ticket ${ticketId}`);
              res.json({ success: true, sessionId: newSessionId, resumed: true });
              return;
            } catch (err) {
              console.error(`[input] Failed to resume suspended ticket: ${(err as Error).message}`);
              // Fall through — response is already written, blocking session may pick it up
            }
          }
        }

        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    },
  );

  // Get ticket messages (unified chat history)
  app.get(
    "/api/tickets/:project/:id/messages",
    async (req: Request, res: Response) => {
      try {
        const projectId = decodeURIComponent(req.params.project);
        const ticketId = req.params.id;

        const ticket = await getTicket(projectId, ticketId);
        if (!ticket.conversationId) {
          res.json({ messages: [] });
          return;
        }

        const rawMessages = getMessages(ticket.conversationId);

        // Map message id to conversationId for frontend compatibility
        // The frontend uses conversationId for deduplication
        // Also extract artifact from metadata for artifact messages
        const messages = rawMessages.map((msg) => ({
          ...msg,
          conversationId: msg.id,
          // Extract artifact from metadata for frontend compatibility
          artifact: msg.metadata?.artifact as { filename: string; description?: string } | undefined,
        }));

        res.json({ messages });
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    },
  );

  // Restart ticket to a specific phase
  app.post(
    "/api/tickets/:project/:id/restart",
    async (req: Request, res: Response) => {
      try {
        const projectId = decodeURIComponent(req.params.project);
        const ticketId = req.params.id;
        const { targetPhase } = req.body as { targetPhase?: string };

        if (!targetPhase) {
          res.status(400).json({ error: "Missing targetPhase" });
          return;
        }

        const { restartToPhase } = await import(
          "../../services/ticket-restart.service.js"
        );

        const result = await restartToPhase(
          projectId,
          ticketId,
          targetPhase,
          sessionService,
        );

        // Emit events for UI updates
        eventBus.emit("ticket:restarted", {
          projectId,
          ticketId,
          targetPhase,
          ticket: result.ticket,
        });
        eventBus.emit("ticket:updated", { projectId, ticket: result.ticket });

        res.json(result);
      } catch (error) {
        const message = (error as Error).message;
        if (message.includes("not found")) {
          res.status(404).json({ error: message });
        } else if (message.includes("archived") || message.includes("history")) {
          res.status(400).json({ error: message });
        } else {
          res.status(500).json({ error: message });
        }
      }
    },
  );

  // Phases reference
  app.get("/api/phases", (_req: Request, res: Response) => {
    res.json(DEFAULT_PHASES);
  });
}
