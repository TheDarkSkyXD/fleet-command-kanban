// src/types/template.types.ts

// Worker types
export type WorkerType = "agent" | "ralphLoop" | "taskLoop";

export interface BaseWorker {
  id: string;
  type: WorkerType;
  description?: string;
}

/**
 * Model specification - either a string shortcut/ID or an object with provider info.
 * String format: "haiku", "sonnet", "opus" (shortcuts) or "claude-sonnet-4-20250514" (explicit ID)
 * Object format: { id: "claude-sonnet-4-20250514", provider: "anthropic" }
 */
export type ModelSpec = string | { id: string; provider?: string };

export interface AgentWorker extends BaseWorker {
  type: "agent";
  source: string;
  disallowTools?: string[];
  model?: ModelSpec;
}

export interface RalphLoopWorker extends BaseWorker {
  type: "ralphLoop";
  maxAttempts: number;
  workers: Worker[];
}

export interface TaskLoopWorker extends BaseWorker {
  type: "taskLoop";
  maxAttempts: number;
  workers: Worker[]; // Cannot contain TaskLoopWorker
}

export type Worker = AgentWorker | RalphLoopWorker | TaskLoopWorker;

// Phase types
export interface Transitions {
  next: string | null;
  manual?: boolean;
}

export interface Phase {
  id: string;
  name: string;
  description: string;
  workers: Worker[];
  transitions: Transitions;
  requiresWorktree?: boolean;
  skippable?: boolean;
}

// Template types
export interface WorkflowTemplate {
  name: string;
  description: string;
  version: string; // Semver format "1.0.0"
  phases: Phase[];
}

export interface TemplateRegistryEntry {
  name: string;
  version: string; // Semver format "1.0.0"
  isDefault: boolean;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface TemplateRegistry {
  templates: TemplateRegistryEntry[];
}

export interface ProjectTemplateRef {
  name: string;
  version: string; // Semver format "1.0.0"
}

// Type guards
export function isAgentWorker(worker: Worker): worker is AgentWorker {
  return worker.type === "agent";
}

export function isRalphLoopWorker(worker: Worker): worker is RalphLoopWorker {
  return worker.type === "ralphLoop";
}

export function isTaskLoopWorker(worker: Worker): worker is TaskLoopWorker {
  return worker.type === "taskLoop";
}
