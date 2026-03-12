// Re-export API-facing types from shared package
export type {
  Project,
  SessionStatus,
  Session,
  SessionLogEntry,
  BrainstormStatus,
  Brainstorm,
  BrainstormQuestion,
  BrainstormMessage,
  Template,
  TemplatePhase,
  TemplateWorker,
  TemplateAgent,
  RalphLoopConfig,
  TicketLoopConfig,
  TaskStatus,
  TaskComment,
  Task,
  TicketPendingQuestion,
  TicketPendingResponse,
  TicketMessagesResponse,
  ArtifactChatMessage,
  ArtifactChatPendingResponse,
  ArtifactChatStartResponse,
  Artifact,
  LogLevel,
  LogEntry,
  ApiError,
  CreateBrainstormResponse,
  BrainstormPendingResponse,
  BrainstormMessagesResponse,
  WorkerNode,
  WorkerTreeResponse,
} from '@fleet-command/shared'

// Re-export constants from shared package (only DEFAULT_PORT since others come from ticket.types.ts)
export { DEFAULT_PORT } from '@fleet-command/shared'

// Ticket types - these re-export shared types plus daemon-specific extensions
export * from "./ticket.types.js";

// Internal types (not in shared)
export * from "./config.types.js";
export * from "./mcp.types.js";
export * from "./orchestration.types.js";
export * from "./ralph-feedback.types.js";
