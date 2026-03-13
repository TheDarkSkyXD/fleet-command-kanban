import { Express } from "express";
import { terminalManager } from "../../services/terminal/terminal-manager.js";
import { getProjects } from "./projects.routes.js";

export function registerTerminalRoutes(app: Express): void {
  // List terminals for a project
  app.get("/api/terminal/:projectId", (req, res) => {
    const { projectId } = req.params;
    const terminals = terminalManager.listTerminals(projectId);

    // Auto-create a default terminal if none exist
    if (terminals.length === 0) {
      const project = getProjects().get(projectId);
      if (project) {
        const terminal = terminalManager.createTerminal(
          projectId,
          project.path,
        );
        res.json([terminal]);
        return;
      }
    }

    res.json(terminals);
  });

  // Create terminal
  app.post("/api/terminal/:projectId", (req, res) => {
    const { projectId } = req.params;
    const { name } = req.body || {};

    const project = getProjects().get(projectId);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    const terminal = terminalManager.createTerminal(
      projectId,
      project.path,
      name,
    );
    res.status(201).json(terminal);
  });

  // Rename terminal
  app.patch("/api/terminal/:projectId/:terminalId", (req, res) => {
    const { projectId, terminalId } = req.params;
    const { name } = req.body;

    if (!name || typeof name !== "string") {
      res.status(400).json({ error: "Name is required" });
      return;
    }

    const success = terminalManager.renameTerminal(
      projectId,
      terminalId,
      name,
    );
    if (!success) {
      res.status(404).json({ error: "Terminal not found" });
      return;
    }
    res.json({ success: true });
  });

  // Delete terminal
  app.delete("/api/terminal/:projectId/:terminalId", (req, res) => {
    const { projectId, terminalId } = req.params;
    const success = terminalManager.deleteTerminal(projectId, terminalId);
    if (!success) {
      res.status(404).json({ error: "Terminal not found" });
      return;
    }
    res.json({ success: true });
  });
}
