import { Express } from "express";
import { devServerManager } from "../../services/devserver/devserver-manager.js";
import { getProjects } from "./projects.routes.js";

export function registerDevServerRoutes(app: Express): void {
  // Get dev server status
  app.get("/api/projects/:projectId/devserver/status", (req, res) => {
    const { projectId } = req.params;
    res.json(devServerManager.getStatus(projectId));
  });

  // Start dev server
  app.post("/api/projects/:projectId/devserver/start", (req, res) => {
    const { projectId } = req.params;
    const { command } = req.body || {};

    const project = getProjects().get(projectId);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    const result = devServerManager.startDevServer(
      projectId,
      project.path,
      command,
    );
    res.json(result);
  });

  // Stop dev server
  app.post("/api/projects/:projectId/devserver/stop", (req, res) => {
    const { projectId } = req.params;
    const success = devServerManager.stopDevServer(projectId);
    res.json({ success });
  });

  // Get dev server config
  app.get("/api/projects/:projectId/devserver/config", (req, res) => {
    const { projectId } = req.params;
    const project = getProjects().get(projectId);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    res.json(devServerManager.getConfig(projectId, project.path));
  });

  // Update dev server config
  app.patch("/api/projects/:projectId/devserver/config", (req, res) => {
    const { projectId } = req.params;
    const { customCommand } = req.body;
    devServerManager.setConfig(projectId, customCommand ?? null);
    res.json({ success: true });
  });

  // Get log buffer
  app.get("/api/projects/:projectId/devserver/logs", (req, res) => {
    const { projectId } = req.params;
    res.json(devServerManager.getLogBuffer(projectId));
  });
}
