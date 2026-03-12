import path from "path";
import os from "os";

export const GLOBAL_DIR = path.join(os.homedir(), ".fleet-command");
export const CONFIG_FILE = path.join(GLOBAL_DIR, "config.json");
export const PROJECTS_DIR = path.join(GLOBAL_DIR, "projects");
export const TASKS_DIR = path.join(GLOBAL_DIR, "tickets");
export const SESSIONS_DIR = path.join(GLOBAL_DIR, "sessions");
export const BRAINSTORMS_DIR = path.join(GLOBAL_DIR, "brainstorms");
export const ARTIFACT_CHAT_DIR = path.join(GLOBAL_DIR, "artifact-chats");
export const TEMPLATES_DIR = path.join(GLOBAL_DIR, "templates");
export const MARKETPLACE_DIR = path.join(GLOBAL_DIR, "marketplace");
export const PID_FILE = path.join(GLOBAL_DIR, "daemon.pid");
export const LOCK_FILE = path.join(GLOBAL_DIR, "daemon.lock");
export const DAEMON_INFO_FILE = path.join(GLOBAL_DIR, "daemon.json");
export const LOG_FILE = path.join(GLOBAL_DIR, "daemon.log");
export const DB_FILE = path.join(GLOBAL_DIR, "fleet-command.db");

/**
 * Get the data directory for a specific project.
 * Contains: template/, tickets/, brainstorms/
 */
export function getProjectDataDir(projectId: string): string {
  const safeId = projectId.replace(/\//g, "__");
  return path.join(GLOBAL_DIR, "project-data", safeId);
}

/**
 * Get the template directory for a specific project.
 */
export function getProjectTemplateDir(projectId: string): string {
  return path.join(getProjectDataDir(projectId), "template");
}

/**
 * Get the files directory for a specific project.
 * Contains: tickets/, brainstorms/
 */
export function getProjectFilesDir(projectId: string): string {
  const safeId = projectId.replace(/\//g, "__");
  return path.join(GLOBAL_DIR, "projects", safeId);
}

/**
 * Get the ticket files directory.
 * Contains: artifacts/, images/, logs/
 */
export function getTicketFilesDir(projectId: string, ticketId: string): string {
  return path.join(getProjectFilesDir(projectId), "tickets", ticketId);
}

/**
 * Get the brainstorm files directory.
 */
export function getBrainstormFilesDir(projectId: string, brainstormId: string): string {
  return path.join(getProjectFilesDir(projectId), "brainstorms", brainstormId);
}

export const paths = {
  GLOBAL_DIR,
  CONFIG_FILE,
  PROJECTS_DIR,
  TASKS_DIR,
  SESSIONS_DIR,
  BRAINSTORMS_DIR,
  ARTIFACT_CHAT_DIR,
  TEMPLATES_DIR,
  MARKETPLACE_DIR,
  PID_FILE,
  LOCK_FILE,
  DAEMON_INFO_FILE,
  LOG_FILE,
  DB_FILE,
} as const;
