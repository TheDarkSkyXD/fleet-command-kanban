import * as pty from "node-pty";
import { randomBytes } from "crypto";
import type { WebSocket } from "ws";
import type { TerminalInfo, TerminalMessage } from "@fleet-command/shared";

interface TerminalSession {
  id: string;
  projectId: string;
  name: string;
  cwd: string;
  createdAt: string;
  ptyProcess: pty.IPty;
  clients: Set<WebSocket>;
}

function getDefaultShell(): string {
  if (process.platform === "win32") {
    return process.env.COMSPEC || "powershell.exe";
  }
  return process.env.SHELL || "/bin/bash";
}

export class TerminalManager {
  private sessions: Map<string, TerminalSession> = new Map();

  private getKey(projectId: string, terminalId: string): string {
    return `${projectId}:${terminalId}`;
  }

  createTerminal(projectId: string, cwd: string, name?: string): TerminalInfo {
    const id = randomBytes(8).toString("hex");
    const shell = getDefaultShell();
    const createdAt = new Date().toISOString();
    const terminalName = name || `Terminal ${this.getProjectTerminals(projectId).length + 1}`;

    const ptyProcess = pty.spawn(shell, [], {
      name: "xterm-256color",
      cols: 80,
      rows: 24,
      cwd,
      env: {
        ...process.env,
        TERM: "xterm-256color",
      } as Record<string, string>,
      // On Windows, ConPTY's console list agent crashes when the daemon is
      // spawned without a console (e.g. from Electron with windowsHide:true).
      // Falling back to WinPTY avoids "AttachConsole failed" errors.
      useConpty: process.platform !== "win32",
    });

    const session: TerminalSession = {
      id,
      projectId,
      name: terminalName,
      cwd,
      createdAt,
      ptyProcess,
      clients: new Set(),
    };

    const key = this.getKey(projectId, id);
    this.sessions.set(key, session);

    // Broadcast PTY output to all attached clients
    ptyProcess.onData((data: string) => {
      const message: TerminalMessage = {
        type: "output",
        data: Buffer.from(data, "utf-8").toString("base64"),
      };
      const payload = JSON.stringify(message);
      for (const client of session.clients) {
        if (client.readyState === 1) {
          // WebSocket.OPEN
          client.send(payload);
        }
      }
    });

    ptyProcess.onExit(({ exitCode }) => {
      const exitMessage: TerminalMessage = {
        type: "exit",
        code: exitCode,
      };
      const payload = JSON.stringify(exitMessage);
      for (const client of session.clients) {
        if (client.readyState === 1) {
          client.send(payload);
        }
      }
    });

    return { id, projectId, name: terminalName, createdAt };
  }

  deleteTerminal(projectId: string, terminalId: string): boolean {
    const key = this.getKey(projectId, terminalId);
    const session = this.sessions.get(key);
    if (!session) return false;

    // Disconnect all clients
    for (const client of session.clients) {
      client.close(1000, "Terminal deleted");
    }
    session.clients.clear();

    // Kill PTY process
    try {
      session.ptyProcess.kill();
    } catch {
      // Process may already be dead
    }

    this.sessions.delete(key);
    return true;
  }

  listTerminals(projectId: string): TerminalInfo[] {
    return this.getProjectTerminals(projectId).map((s) => ({
      id: s.id,
      projectId: s.projectId,
      name: s.name,
      createdAt: s.createdAt,
    }));
  }

  renameTerminal(
    projectId: string,
    terminalId: string,
    name: string,
  ): boolean {
    const key = this.getKey(projectId, terminalId);
    const session = this.sessions.get(key);
    if (!session) return false;
    session.name = name;
    return true;
  }

  attachClient(projectId: string, terminalId: string, ws: WebSocket): boolean {
    const key = this.getKey(projectId, terminalId);
    const session = this.sessions.get(key);
    if (!session) return false;

    session.clients.add(ws);

    ws.on("message", (raw: Buffer | string) => {
      try {
        const msg: TerminalMessage = JSON.parse(
          typeof raw === "string" ? raw : raw.toString(),
        );

        if (msg.type === "input" && msg.data) {
          const decoded = Buffer.from(msg.data, "base64").toString("utf-8");
          session.ptyProcess.write(decoded);
        } else if (
          msg.type === "resize" &&
          msg.cols &&
          msg.rows &&
          msg.cols > 0 &&
          msg.rows > 0
        ) {
          session.ptyProcess.resize(msg.cols, msg.rows);
        }
      } catch {
        // Ignore malformed messages
      }
    });

    ws.on("close", () => {
      session.clients.delete(ws);
    });

    return true;
  }

  cleanup(): void {
    for (const [key, session] of this.sessions) {
      for (const client of session.clients) {
        client.close(1000, "Server shutting down");
      }
      try {
        session.ptyProcess.kill();
      } catch {
        // Process may already be dead
      }
    }
    this.sessions.clear();
  }

  private getProjectTerminals(projectId: string): TerminalSession[] {
    const terminals: TerminalSession[] = [];
    for (const session of this.sessions.values()) {
      if (session.projectId === projectId) {
        terminals.push(session);
      }
    }
    return terminals;
  }
}

export const terminalManager = new TerminalManager();
