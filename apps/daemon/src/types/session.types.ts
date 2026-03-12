export interface SessionMeta {
  projectId: string;
  ticketId?: string;
  ticketTitle?: string;
  brainstormId?: string;
  brainstormName?: string;
  phase?: string;
  worktreePath?: string;
  branchName?: string;
  startedAt: string;
  status?: "running" | "completed" | "failed";
  exitCode?: number;
  endedAt?: string;
  /** The agent type being run (e.g., 'fleet-command:refinement') */
  agentType?: string;
  /** Current stage index within the phase */
  stage?: number;
}

export interface Session {
  id: string;
  meta: SessionMeta;
  status: "running" | "completed" | "error";
}

export interface SessionInfo {
  id: string;
  projectId: string;
  ticketId?: string;
  ticketTitle?: string;
  brainstormId?: string;
  brainstormName?: string;
  phase?: string;
  worktreePath?: string;
  branchName?: string;
  startedAt: string;
  status: "running" | "completed" | "failed";
  exitCode?: number;
  endedAt?: string;
}

export interface SessionLogEntry {
  type: "session_start" | "output" | "session_end" | "raw";
  timestamp: string;
  meta?: SessionMeta;
  data?: string;
  content?: string;
}

export interface SessionOptions {
  phase?: string;
  resumeId?: string;
}

// =============================================================================
// Session Store Types (SQLite-backed)
// =============================================================================

export interface CreateSessionInput {
  projectId: string;
  ticketId?: string;
  brainstormId?: string;
  claudeSessionId?: string;
  agentSource?: string;
  phase?: string;
  metadata?: Record<string, unknown>;
}

export interface StoredSession {
  id: string;
  projectId: string;
  ticketId?: string;
  brainstormId?: string;
  conversationId?: string;
  claudeSessionId?: string;
  agentSource?: string;
  startedAt: string;
  endedAt?: string;
  exitCode?: number;
  phase?: string;
  metadata?: Record<string, unknown>;
}
