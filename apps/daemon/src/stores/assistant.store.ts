import type Database from "better-sqlite3";
import type { Assistant } from "@fleet-command/shared";
import { getDatabase } from "./db.js";
import {
  createConversationStore,
  ConversationStore,
} from "./conversation.store.js";

// Re-export Assistant from shared
export type { Assistant };

// =============================================================================
// Row Types
// =============================================================================

interface AssistantRow {
  id: string;
  project_id: string;
  conversation_id: string | null;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// Row Mappers
// =============================================================================

function rowToAssistant(row: AssistantRow): Assistant {
  return {
    id: row.id,
    projectId: row.project_id,
    conversationId: row.conversation_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// =============================================================================
// Helpers
// =============================================================================

function generateAssistantId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `asst_${timestamp}_${random}`;
}

// =============================================================================
// AssistantStore Class
// =============================================================================

export class AssistantStore {
  private conversationStore: ConversationStore;

  constructor(private db: Database.Database) {
    this.conversationStore = createConversationStore(db);
  }

  getAssistant(projectId: string): Assistant | null {
    const row = this.db
      .prepare("SELECT * FROM assistants WHERE project_id = ?")
      .get(projectId) as AssistantRow | undefined;

    return row ? rowToAssistant(row) : null;
  }

  getAssistantById(assistantId: string): Assistant | null {
    const row = this.db
      .prepare("SELECT * FROM assistants WHERE id = ?")
      .get(assistantId) as AssistantRow | undefined;

    return row ? rowToAssistant(row) : null;
  }

  getOrCreateAssistant(projectId: string): Assistant {
    const existing = this.getAssistant(projectId);
    if (existing) {
      // Fix migrated assistants that lost their conversation link
      if (!existing.conversationId) {
        const conversation = this.conversationStore.createConversation(projectId, {
          assistantId: existing.id,
        });
        this.switchConversation(existing.id, conversation.id);
        return this.getAssistant(projectId)!;
      }
      return existing;
    }

    const id = generateAssistantId();
    const now = new Date().toISOString();

    // Create associated conversation linked to this assistant
    const conversation = this.conversationStore.createConversation(projectId, {
      assistantId: id,
    });

    this.db
      .prepare(
        `INSERT INTO assistants (id, project_id, conversation_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(id, projectId, conversation.id, now, now);

    return this.getAssistant(projectId)!;
  }

  switchConversation(assistantId: string, conversationId: string): Assistant | null {
    const now = new Date().toISOString();
    this.db
      .prepare("UPDATE assistants SET conversation_id = ?, updated_at = ? WHERE id = ?")
      .run(conversationId, now, assistantId);
    return this.getAssistantById(assistantId);
  }
}

// =============================================================================
// Factory & Convenience Functions
// =============================================================================

export function createAssistantStore(db: Database.Database): AssistantStore {
  return new AssistantStore(db);
}

export function getOrCreateAssistant(projectId: string): Assistant {
  return new AssistantStore(getDatabase()).getOrCreateAssistant(projectId);
}

export function getAssistantById(assistantId: string): Assistant | null {
  return new AssistantStore(getDatabase()).getAssistantById(assistantId);
}
