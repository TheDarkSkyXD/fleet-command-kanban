import { spawn, ChildProcess } from "child_process";
import { existsSync, readFileSync } from "fs";
import path from "path";
import type { WebSocket } from "ws";
import { eventBus } from "../../utils/event-bus.js";
import type {
  DevServerStatus,
  DevServerState,
  DevServerConfig,
  DevServerLogEntry,
} from "@fleet-command/shared";

const MAX_LOG_BUFFER = 200;
const URL_REGEX =
  /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d{4,5})\/?/i;

interface DevServerInstance {
  projectId: string;
  projectPath: string;
  process: ChildProcess;
  status: DevServerStatus;
  command: string;
  detectedUrl: string | null;
  startedAt: string;
  logBuffer: DevServerLogEntry[];
  clients: Set<WebSocket>;
  customCommand?: string;
}

function detectProjectType(
  projectPath: string,
): { type: string; command: string } | null {
  const pkgPath = path.join(projectPath, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      const scripts = pkg.scripts || {};
      if (scripts.dev) return { type: "nodejs", command: "npm run dev" };
      if (scripts.start) return { type: "nodejs", command: "npm run start" };
      if (scripts.serve) return { type: "nodejs", command: "npm run serve" };
    } catch {
      // Ignore parse errors
    }
  }

  // Check for pnpm
  if (existsSync(path.join(projectPath, "pnpm-lock.yaml"))) {
    const pkgPathCheck = path.join(projectPath, "package.json");
    if (existsSync(pkgPathCheck)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPathCheck, "utf-8"));
        if (pkg.scripts?.dev) return { type: "nodejs-pnpm", command: "pnpm dev" };
      } catch { /* ignore */ }
    }
  }

  // Python
  if (existsSync(path.join(projectPath, "manage.py"))) {
    return { type: "python-django", command: "python manage.py runserver" };
  }
  if (existsSync(path.join(projectPath, "pyproject.toml"))) {
    return { type: "python", command: "python -m uvicorn main:app --reload" };
  }

  return null;
}

export class DevServerManager {
  private instances: Map<string, DevServerInstance> = new Map();
  private configs: Map<string, string> = new Map(); // projectId -> customCommand

  startDevServer(
    projectId: string,
    projectPath: string,
    command?: string,
  ): DevServerState {
    // Stop existing instance if any
    if (this.instances.has(projectId)) {
      this.stopDevServer(projectId);
    }

    const customCommand = command || this.configs.get(projectId);
    let finalCommand: string;

    if (customCommand) {
      finalCommand = customCommand;
    } else {
      const detected = detectProjectType(projectPath);
      if (!detected) {
        return {
          status: "stopped",
          command: undefined,
        };
      }
      finalCommand = detected.command;
    }

    const [cmd, ...args] = finalCommand.split(/\s+/);
    const isWindows = process.platform === "win32";

    const child = spawn(cmd, args, {
      cwd: projectPath,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        FORCE_COLOR: "1",
        NODE_ENV: "development",
      },
      ...(isWindows ? {} : { detached: true }),
    });

    const startedAt = new Date().toISOString();
    const instance: DevServerInstance = {
      projectId,
      projectPath,
      process: child,
      status: "starting",
      command: finalCommand,
      detectedUrl: null,
      startedAt,
      logBuffer: [],
      clients: new Set(),
    };

    this.instances.set(projectId, instance);

    const handleOutput = (data: Buffer, stream: "stdout" | "stderr") => {
      const message = data.toString();
      const entry: DevServerLogEntry = {
        message,
        timestamp: new Date().toISOString(),
        stream,
      };

      // Buffer log
      instance.logBuffer.push(entry);
      if (instance.logBuffer.length > MAX_LOG_BUFFER) {
        instance.logBuffer.shift();
      }

      // Detect URL in output
      const urlMatch = message.match(URL_REGEX);
      if (urlMatch && !instance.detectedUrl) {
        instance.detectedUrl = urlMatch[0];
        instance.status = "running";
        this.emitStatus(projectId);
      }

      // If still starting and we got output, mark as running after a delay
      if (instance.status === "starting") {
        instance.status = "running";
        this.emitStatus(projectId);
      }

      // Broadcast to WebSocket clients
      const payload = JSON.stringify({ type: "log", entry });
      for (const client of instance.clients) {
        if (client.readyState === 1) {
          client.send(payload);
        }
      }

      // Also emit via SSE
      eventBus.emit("devserver:output", { projectId, entry });
    };

    child.stdout?.on("data", (data: Buffer) => handleOutput(data, "stdout"));
    child.stderr?.on("data", (data: Buffer) => handleOutput(data, "stderr"));

    child.on("error", (err) => {
      instance.status = "crashed";
      const entry: DevServerLogEntry = {
        message: `Process error: ${err.message}`,
        timestamp: new Date().toISOString(),
        stream: "stderr",
      };
      instance.logBuffer.push(entry);
      this.emitStatus(projectId);
    });

    child.on("exit", (code) => {
      if (instance.status !== "stopped") {
        instance.status = code === 0 ? "stopped" : "crashed";
      }
      this.emitStatus(projectId);
    });

    this.emitStatus(projectId);

    return {
      status: instance.status,
      command: finalCommand,
      pid: child.pid,
      startedAt,
    };
  }

  stopDevServer(projectId: string): boolean {
    const instance = this.instances.get(projectId);
    if (!instance) return false;

    instance.status = "stopped";

    // Kill process tree
    try {
      if (process.platform === "win32") {
        // On Windows, spawn taskkill for the process tree
        if (instance.process.pid) {
          spawn("taskkill", ["/pid", String(instance.process.pid), "/T", "/F"], {
            stdio: "ignore",
          });
        }
      } else {
        // On Unix, kill the process group
        if (instance.process.pid) {
          try {
            process.kill(-instance.process.pid, "SIGTERM");
          } catch {
            instance.process.kill("SIGTERM");
          }
        }
      }
    } catch {
      // Process may already be dead
    }

    // Notify clients
    for (const client of instance.clients) {
      if (client.readyState === 1) {
        client.send(JSON.stringify({ type: "status", status: "stopped" }));
      }
    }

    this.instances.delete(projectId);
    this.emitStatus(projectId);
    return true;
  }

  getStatus(projectId: string): DevServerState {
    const instance = this.instances.get(projectId);
    if (!instance) {
      return { status: "stopped" };
    }
    return {
      status: instance.status,
      command: instance.command,
      detectedUrl: instance.detectedUrl ?? undefined,
      pid: instance.process.pid,
      startedAt: instance.startedAt,
    };
  }

  getConfig(projectId: string, projectPath: string): DevServerConfig {
    const customCommand = this.configs.get(projectId);
    const detected = detectProjectType(projectPath);
    return {
      projectType: detected?.type,
      customCommand,
      detectedCommand: detected?.command,
    };
  }

  setConfig(projectId: string, customCommand: string | null): void {
    if (customCommand) {
      this.configs.set(projectId, customCommand);
    } else {
      this.configs.delete(projectId);
    }
  }

  getLogBuffer(projectId: string): DevServerLogEntry[] {
    return this.instances.get(projectId)?.logBuffer ?? [];
  }

  attachLogClient(projectId: string, ws: WebSocket): void {
    const instance = this.instances.get(projectId);
    if (instance) {
      instance.clients.add(ws);

      // Send buffered logs
      for (const entry of instance.logBuffer) {
        ws.send(JSON.stringify({ type: "log", entry }));
      }

      // Send current status
      ws.send(
        JSON.stringify({
          type: "status",
          ...this.getStatus(projectId),
        }),
      );

      ws.on("close", () => {
        instance.clients.delete(ws);
      });
    } else {
      // No active instance, just send stopped status
      ws.send(JSON.stringify({ type: "status", status: "stopped" }));
      ws.on("close", () => {});
    }
  }

  cleanup(): void {
    for (const [projectId] of this.instances) {
      this.stopDevServer(projectId);
    }
  }

  private emitStatus(projectId: string): void {
    eventBus.emit("devserver:status", {
      projectId,
      ...this.getStatus(projectId),
    });
  }
}

export const devServerManager = new DevServerManager();
