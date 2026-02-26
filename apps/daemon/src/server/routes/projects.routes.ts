import type { Express, Request, Response } from "express";
import fs from "fs/promises";
import path from "path";
import { execSync } from "child_process";
import {
  getAllProjectsMap,
  getProjectById,
  createProject,
  updateProject,
  updateProjectTemplate,
  deleteProject,
} from "../../stores/project.store.js";
import {
  getTemplate,
  getDefaultTemplate,
  getTemplateWithFullPhasesForProject,
  getTemplateChangelog,
  getAgentPrompt as getGlobalAgentPrompt,
} from "../../stores/template.store.js";
import {
  copyTemplateToProject,
  getProjectTemplate,
  hasProjectTemplate,
  hasProjectAgentOverride,
  getProjectAgentOverride,
  saveProjectAgentOverride,
  getProjectAgentPrompt,
  deleteProjectAgentOverride,
} from "../../stores/project-template.store.js";
import { listTickets, updateTicket } from "../../stores/ticket.store.js";
import { getActiveSessionForTicket } from "../../stores/session.store.js";
import {
  resolveTargetPhase,
  getPhaseConfig,
} from "../../services/session/phase-config.js";
import { clearWorkerState } from "../../services/session/worker-state.js";
import { getUpgradeType } from "../../utils/semver.js";
import type { Project } from "../../types/config.types.js";
import type { TicketPhase } from "../../types/ticket.types.js";
import type { SessionService } from "../../services/session/index.js";
import type { Worker } from "../../types/template.types.js";

let projects: Map<string, Project> = new Map();

/**
 * Validate agentType parameter to prevent path traversal.
 * Only allows alphanumeric characters, underscores, and hyphens.
 */
function isValidAgentType(agentType: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(agentType);
}

export async function refreshProjects(): Promise<Map<string, Project>> {
  projects = getAllProjectsMap();
  return projects;
}

export function getProjects(): Map<string, Project> {
  return projects;
}

/**
 * Migrate tickets from a disabled phase to the next enabled phase.
 * Tickets are moved sequentially. Automation is queued and spawned with delays.
 */
async function migrateTicketsFromDisabledPhase(
  projectId: string,
  disabledPhase: string,
  sessionService: SessionService,
): Promise<void> {
  const tickets = await listTickets(projectId, { phase: disabledPhase as TicketPhase });
  if (tickets.length === 0) {
    return;
  }

  console.log(
    `[migrateTicketsFromDisabledPhase] Migrating ${tickets.length} tickets from ${disabledPhase}`,
  );

  const project = getProjectById(projectId);
  if (!project) return;

  const automationQueue: Array<{ ticketId: string; phase: string }> = [];

  // Move tickets sequentially
  for (const ticket of tickets) {
    try {
      const targetPhase = await resolveTargetPhase(projectId, disabledPhase);
      await updateTicket(projectId, ticket.id, {
        phase: targetPhase as TicketPhase,
      });

      console.log(
        `[migrateTicketsFromDisabledPhase] Moved ticket ${ticket.id} from ${disabledPhase} to ${targetPhase}`,
      );

      // Queue automation if target phase has it and ticket has no active session
      const targetConfig = await getPhaseConfig(projectId, targetPhase);
      const hasAutomation =
        targetConfig &&
        targetConfig.workers &&
        targetConfig.workers.length > 0;

      if (hasAutomation && !getActiveSessionForTicket(ticket.id)) {
        automationQueue.push({ ticketId: ticket.id, phase: targetPhase });
      }
    } catch (error) {
      console.error(
        `[migrateTicketsFromDisabledPhase] Failed to migrate ticket ${ticket.id}:`,
        error,
      );
      // Continue with other tickets
    }
  }

  // Spawn queued automation with delays
  for (const item of automationQueue) {
    try {
      await sessionService.spawnForTicket(
        projectId,
        item.ticketId,
        item.phase as TicketPhase,
        project.path,
      );
      await new Promise((resolve) => setTimeout(resolve, 500)); // 500ms delay between spawns
    } catch (error) {
      console.error(
        `[migrateTicketsFromDisabledPhase] Failed to spawn automation for ${item.ticketId}:`,
        error,
      );
    }
  }
}

export function registerProjectRoutes(
  app: Express,
  sessionService: SessionService,
): void {
  app.get("/api/projects", async (_req: Request, res: Response) => {
    try {
      await refreshProjects();

      // Migrate existing projects to local templates if needed
      for (const project of projects.values()) {
        if (!project.template) continue;

        try {
          if (!(await hasProjectTemplate(project.id))) {
            const copied = await copyTemplateToProject(project.id, project.template.name);
            updateProjectTemplate(project.id, project.template.name, copied.version);
            console.log(`[projects] Migrated template for project ${project.id}`);
          }
        } catch (err) {
          console.error(`[projects] Failed to migrate template for ${project.id}: ${(err as Error).message}`);
        }
      }

      // Auto-upgrade patch versions
      for (const project of projects.values()) {
        if (!project.template) continue;

        try {
          const localTemplate = await getProjectTemplate(project.id);
          const catalogTemplate = await getTemplate(project.template.name);

          if (localTemplate && catalogTemplate) {
            const currentVersion = localTemplate.version;
            const availableVersion = typeof catalogTemplate.version === "number"
              ? `${catalogTemplate.version}.0.0`
              : catalogTemplate.version;

            const upgradeType = getUpgradeType(currentVersion, availableVersion);

            if (upgradeType === "patch") {
              await copyTemplateToProject(project.id, project.template.name);
              updateProjectTemplate(project.id, project.template.name, availableVersion);
              console.log(`[projects] Auto-upgraded ${project.id} template to ${availableVersion}`);
            }
          }
        } catch {
          // Silently continue if auto-upgrade fails
        }
      }

      // Refresh again after auto-upgrades
      await refreshProjects();

      const list = Array.from(projects.values()).map((p) => ({
        id: p.id,
        slug: p.slug,
        displayName: p.displayName || p.id,
        path: p.path,
        registeredAt: p.registeredAt,
        icon: p.icon,
        color: p.color,
        template: p.template,
        disabledPhases: p.disabledPhases,
        disabledPhaseMigration: p.disabledPhaseMigration,
        swimlaneColors: p.swimlaneColors,
        folderId: p.folderId,
      }));
      res.json(list);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.post("/api/projects", async (req: Request, res: Response) => {
    try {
      const {
        path: projectPath,
        displayName,
        template: templateName,
      } = req.body as {
        path?: string;
        displayName?: string;
        template?: string;
      };

      if (!projectPath) {
        res.status(400).json({ error: "Missing path" });
        return;
      }

      await fs.access(projectPath);

      // Use displayName if provided, otherwise derive from path or git remote
      let name = displayName || path.basename(projectPath);
      try {
        const remote = execSync("git remote get-url origin", {
          cwd: projectPath,
          encoding: "utf-8",
        }).trim();
        const match = remote.match(/[:/]([^/]+\/[^/]+?)(?:\.git)?$/);
        if (match && !displayName) {
          // Use last segment of git remote as display name
          name = match[1].split("/").pop() || match[1];
        }
      } catch {
        // Not a git repo
      }

      // Create project with auto-generated UUID
      const project = createProject({
        displayName: name,
        path: projectPath,
      });

      // Copy template to project
      let templateToCopy = templateName;
      if (!templateToCopy) {
        const defaultTemplate = await getDefaultTemplate();
        templateToCopy = defaultTemplate?.name;
      }

      if (templateToCopy) {
        try {
          const copiedTemplate = await copyTemplateToProject(project.id, templateToCopy);
          updateProjectTemplate(project.id, templateToCopy, copiedTemplate.version);
        } catch (error) {
          console.error(`Failed to copy template: ${(error as Error).message}`);
          // Still register project, just without template
        }
      }

      await refreshProjects();

      // Return the full project object so frontend has id and slug
      const refreshedProject = getProjectById(project.id);
      res.json(refreshedProject);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.delete("/api/projects/:id", async (req: Request, res: Response) => {
    try {
      const id = decodeURIComponent(req.params.id);
      deleteProject(id);
      await refreshProjects();
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // PATCH /api/projects/:id - Update project settings
  app.patch("/api/projects/:id", async (req: Request, res: Response) => {
    try {
      const id = decodeURIComponent(req.params.id);
      const updates = req.body as {
        displayName?: string;
        icon?: string;
        color?: string;
        swimlaneColors?: Record<string, string>;
        folderId?: string | null;
      };

      const project = getProjectById(id);
      if (!project) {
        res.status(404).json({ error: "Project not found" });
        return;
      }

      const updatedProject = updateProject(id, updates);
      await refreshProjects();
      res.json(updatedProject);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // PATCH /api/projects/:id/disabled-phases - Toggle phase disabled state
  app.patch(
    "/api/projects/:id/disabled-phases",
    async (req: Request, res: Response) => {
      try {
        const id = decodeURIComponent(req.params.id);
        const { phaseId, disabled } = req.body as {
          phaseId: string;
          disabled: boolean;
        };

        const project = getProjectById(id);
        if (!project) {
          res.status(404).json({ error: "Project not found" });
          return;
        }

        // Check for migration in progress
        if (project.disabledPhaseMigration) {
          res.status(409).json({ error: "Migration in progress, please wait" });
          return;
        }

        // Validate phase exists in template
        if (project.template) {
          const template = await getTemplateWithFullPhasesForProject(id);
          const phaseExists = template?.phases.some(
            (p) => p.name === phaseId || p.id === phaseId,
          );
          if (!phaseExists) {
            res.status(400).json({ error: "Invalid phase ID" });
            return;
          }
        }

        // Update disabledPhases array
        const disabledPhases = project.disabledPhases ?? [];
        const updated = disabled
          ? [...new Set([...disabledPhases, phaseId])]
          : disabledPhases.filter((p) => p !== phaseId);

        // If disabling and phase has tickets, need to migrate them
        if (disabled) {
          updateProject(id, {
            disabledPhaseMigration: true,
            disabledPhases: updated,
          });

          try {
            await migrateTicketsFromDisabledPhase(id, phaseId, sessionService);
          } finally {
            // Always clear migration flag, even on partial failure
            updateProject(id, { disabledPhaseMigration: false });
          }
        } else {
          updateProject(id, { disabledPhases: updated });
        }

        const result = getProjectById(id);
        await refreshProjects();
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    },
  );

  // PUT /api/projects/:id/template - Apply template to project
  app.put("/api/projects/:id/template", async (req: Request, res: Response) => {
    try {
      const id = decodeURIComponent(req.params.id);
      const { name } = req.body;

      const template = await getTemplate(name);
      if (!template) {
        res.status(404).json({ error: "Template not found" });
        return;
      }

      const project = updateProjectTemplate(id, name, template.version);
      if (!project) {
        res.status(404).json({ error: "Project not found" });
        return;
      }

      await refreshProjects();
      res.json(project);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // GET /api/projects/:id/template-status - Check for template updates
  app.get(
    "/api/projects/:id/template-status",
    async (req: Request, res: Response) => {
      try {
        const id = decodeURIComponent(req.params.id);
        const project = getProjectById(id);

        if (!project?.template) {
          res.json({ current: null, available: null, upgradeType: null });
          return;
        }

        // Get local template version
        let currentVersion: string | null = null;
        if (await hasProjectTemplate(id)) {
          const localTemplate = await getProjectTemplate(id);
          currentVersion = localTemplate?.version || null;
        } else {
          // Legacy: no local copy, use project metadata
          currentVersion = typeof project.template.version === "number"
            ? `${project.template.version}.0.0`
            : project.template.version;
        }

        // Get global catalog version
        const catalogTemplate = await getTemplate(project.template.name);
        const availableVersion = catalogTemplate?.version
          ? (typeof catalogTemplate.version === "number"
              ? `${catalogTemplate.version}.0.0`
              : catalogTemplate.version)
          : null;

        if (!currentVersion || !availableVersion) {
          res.json({ current: currentVersion, available: availableVersion, upgradeType: null });
          return;
        }

        const upgradeType = getUpgradeType(currentVersion, availableVersion);

        res.json({
          current: currentVersion,
          available: availableVersion,
          upgradeType,
        });
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    },
  );

  // GET /api/projects/:id/template-changelog - Get changelog for template updates
  app.get(
    "/api/projects/:id/template-changelog",
    async (req: Request, res: Response) => {
      try {
        const id = decodeURIComponent(req.params.id);
        const project = getProjectById(id);

        if (!project?.template) {
          res.status(404).json({ error: "Project has no template assigned" });
          return;
        }

        // Get changelog from global catalog (shows what's coming in the upgrade)
        const changelog = await getTemplateChangelog(project.template.name);

        if (!changelog) {
          res.json({ changelog: null });
          return;
        }

        res.json({ changelog });
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    },
  );

  // POST /api/projects/:id/upgrade-template - Upgrade project template
  app.post(
    "/api/projects/:id/upgrade-template",
    async (req: Request, res: Response) => {
      try {
        const id = decodeURIComponent(req.params.id);
        const { force } = req.body as { force?: boolean };

        const project = getProjectById(id);
        if (!project?.template) {
          res.status(400).json({ error: "Project has no template assigned" });
          return;
        }

        // Get current and available versions
        const localTemplate = await getProjectTemplate(id);
        const catalogTemplate = await getTemplate(project.template.name);

        if (!catalogTemplate) {
          res.status(404).json({ error: "Template not found in catalog" });
          return;
        }

        const currentVersion = localTemplate?.version || "1.0.0";
        const availableVersion = typeof catalogTemplate.version === "number"
          ? `${catalogTemplate.version}.0.0`
          : catalogTemplate.version;

        const upgradeType = getUpgradeType(currentVersion, availableVersion);

        if (!upgradeType) {
          res.json({ message: "Already up to date", upgraded: false });
          return;
        }

        // Major upgrade requires force flag and resets tickets
        if (upgradeType === "major") {
          if (!force) {
            // Return info about what will be reset
            const tickets = await listTickets(id);
            const inProgressTickets = tickets.filter(
              (t) => t.phase !== "Ideas" && t.phase !== "Done"
            );
            res.status(409).json({
              error: "Major upgrade requires confirmation",
              upgradeType: "major",
              ticketsToReset: inProgressTickets.map((t) => ({
                id: t.id,
                title: t.title,
                phase: t.phase,
              })),
            });
            return;
          }

          // Reset all in-progress tickets
          const tickets = await listTickets(id);
          for (const ticket of tickets) {
            if (ticket.phase !== "Ideas" && ticket.phase !== "Done") {
              // Stop active session if any
              const activeSession = getActiveSessionForTicket(ticket.id);
              if (activeSession) {
                sessionService.stopSession(activeSession.id);
              }

              // Clear worker state
              await clearWorkerState(id, ticket.id);

              // Move to Ideas
              await updateTicket(id, ticket.id, {
                phase: "Ideas" as TicketPhase,
              });
            }
          }
        }

        // Copy new template
        const newTemplate = await copyTemplateToProject(id, project.template.name);
        updateProjectTemplate(id, project.template.name, newTemplate.version);

        await refreshProjects();

        res.json({
          upgraded: true,
          previousVersion: currentVersion,
          newVersion: newTemplate.version,
          upgradeType,
        });
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    },
  );

  // GET /api/projects/:id/phases - Get phases from project's template
  app.get("/api/projects/:id/phases", async (req: Request, res: Response) => {
    try {
      const id = decodeURIComponent(req.params.id);
      const project = getProjectById(id);

      if (!project?.template) {
        // No template assigned - return just Ideas and Done
        res.json(["Ideas", "Done"]);
        return;
      }

      const template = await getTemplateWithFullPhasesForProject(id);
      if (!template) {
        res.json(["Ideas", "Done"]);
        return;
      }

      const phaseNames = template.phases.map((p) => p.name);
      res.json(phaseNames);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // GET /api/projects/:id/agents/:agentType/override - Get agent override content
  app.get(
    "/api/projects/:id/agents/:agentType/override",
    async (req: Request, res: Response) => {
      try {
        const id = decodeURIComponent(req.params.id);
        const agentType = decodeURIComponent(req.params.agentType);

        if (!isValidAgentType(agentType)) {
          res.status(400).json({ error: "Invalid agent type" });
          return;
        }

        const project = getProjectById(id);
        if (!project) {
          res.status(404).json({ error: "Project not found" });
          return;
        }

        const agentPath = `agents/${agentType}.md`;

        if (!(await hasProjectAgentOverride(id, agentPath))) {
          res.status(404).json({ error: "Override not found" });
          return;
        }

        const content = await getProjectAgentOverride(id, agentPath);
        res.json({ content });
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    }
  );

  // PUT /api/projects/:id/agents/:agentType/override - Create or update agent override
  app.put(
    "/api/projects/:id/agents/:agentType/override",
    async (req: Request, res: Response) => {
      try {
        const id = decodeURIComponent(req.params.id);
        const agentType = decodeURIComponent(req.params.agentType);
        const { content } = req.body as { content?: string };

        if (!isValidAgentType(agentType)) {
          res.status(400).json({ error: "Invalid agent type" });
          return;
        }

        if (!content) {
          res.status(400).json({ error: "Content is required" });
          return;
        }

        const project = getProjectById(id);
        if (!project) {
          res.status(404).json({ error: "Project not found" });
          return;
        }

        const agentPath = `agents/${agentType}.md`;

        // Verify base agent exists before creating override
        try {
          await getProjectAgentPrompt(id, agentPath);
        } catch {
          res.status(400).json({ error: "Agent type does not exist in template" });
          return;
        }

        await saveProjectAgentOverride(id, agentPath, content);
        res.json({ ok: true });
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    }
  );

  // DELETE /api/projects/:id/agents/:agentType/override - Remove agent override
  app.delete(
    "/api/projects/:id/agents/:agentType/override",
    async (req: Request, res: Response) => {
      try {
        const id = decodeURIComponent(req.params.id);
        const agentType = decodeURIComponent(req.params.agentType);

        if (!isValidAgentType(agentType)) {
          res.status(400).json({ error: "Invalid agent type" });
          return;
        }

        const project = getProjectById(id);
        if (!project) {
          res.status(404).json({ error: "Project not found" });
          return;
        }

        const agentPath = `agents/${agentType}.md`;
        await deleteProjectAgentOverride(id, agentPath);
        res.json({ ok: true });
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    }
  );

  // GET /api/projects/:id/agents/:agentType/default - Get default agent prompt
  app.get(
    "/api/projects/:id/agents/:agentType/default",
    async (req: Request, res: Response) => {
      try {
        const id = decodeURIComponent(req.params.id);
        const agentType = decodeURIComponent(req.params.agentType);

        if (!isValidAgentType(agentType)) {
          res.status(400).json({ error: "Invalid agent type" });
          return;
        }

        const project = getProjectById(id);
        if (!project) {
          res.status(404).json({ error: "Project not found" });
          return;
        }

        const agentPath = `agents/${agentType}.md`;

        // Try project template first, then fall back to global
        try {
          const content = await getProjectAgentPrompt(id, agentPath);
          res.json({ content });
          return;
        } catch {
          // Fall through to global template
        }

        // Try global template
        if (project.template?.name) {
          try {
            const content = await getGlobalAgentPrompt(project.template.name, agentPath);
            res.json({ content });
            return;
          } catch {
            // Fall through to 404
          }
        }

        res.status(404).json({ error: "Agent not found in template" });
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    }
  );

  // GET /api/projects/:id/phases/:phase/workers - Get worker tree for a phase
  app.get(
    "/api/projects/:id/phases/:phase/workers",
    async (req: Request, res: Response) => {
      try {
        const id = decodeURIComponent(req.params.id);
        const phaseName = decodeURIComponent(req.params.phase);

        const project = getProjectById(id);
        if (!project) {
          res.status(404).json({ error: "Project not found" });
          return;
        }

        if (!project.template) {
          res.json({ workers: [] });
          return;
        }

        const template = await getTemplateWithFullPhasesForProject(id);
        if (!template) {
          res.json({ workers: [] });
          return;
        }

        const phase = template.phases.find((p) => p.name === phaseName);
        if (!phase) {
          res.status(404).json({ error: "Phase not found" });
          return;
        }

        // Transform workers to include override status
        async function transformWorkers(
          workers: Worker[] | undefined
        ): Promise<Array<{
          id: string;
          type: string;
          description?: string;
          agentType?: string;
          model?: string;
          hasOverride?: boolean;
          maxAttempts?: number;
          workers?: Array<unknown>;
        }>> {
          if (!workers) return [];

          const result = [];
          for (const worker of workers) {
            const node: {
              id: string;
              type: string;
              description?: string;
              agentType?: string;
              model?: string;
              hasOverride?: boolean;
              maxAttempts?: number;
              workers?: Array<unknown>;
            } = {
              id: worker.id,
              type: worker.type,
              description: worker.description,
            };

            if (worker.type === "agent" && worker.source) {
              // Extract agent type from source path (e.g., "agents/refinement.md" -> "refinement")
              const match = worker.source.match(/agents\/([^.]+)\.md$/);
              if (match) {
                node.agentType = match[1];
                // Check if override exists
                const agentPath = `agents/${match[1]}.md`;
                node.hasOverride = await hasProjectAgentOverride(id, agentPath);
              }
              // Model is typically in the worker config but may need template lookup
              // For now, we'll leave model as undefined - can be added later if available
            }

            if (worker.type === "ralphLoop" || worker.type === "taskLoop") {
              node.maxAttempts = worker.maxAttempts;
              if (worker.workers) {
                node.workers = await transformWorkers(worker.workers);
              }
            }

            result.push(node);
          }
          return result;
        }

        const workers = await transformWorkers(phase.workers);
        res.json({ workers });
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    }
  );
}
