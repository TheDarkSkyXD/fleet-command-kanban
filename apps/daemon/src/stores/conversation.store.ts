import type Database from "better-sqlite3";
import { randomUUID } from "crypto";
import { getDatabase } from "./db.js";
import type {
  Conversation,
  ConversationMessage,
  CreateMessageInput,
} from "../types/conversation.types.js";

// =============================================================================
// Row Types
// =============================================================================

interface ConversationRow {
  id: string;
  project_id: string;
  title: string | null;
  assistant_id: string | null;
  created_at: string;
  updated_at: string;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  type: string;
  text: string;
  options: string | null;
  timestamp: string;
  answered_at: string | null;
  metadata: string | null;
}

// =============================================================================
// Row Mappers
// =============================================================================

function rowToConversation(row: ConversationRow): Conversation {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    assistantId: row.assistant_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToMessage(row: MessageRow): ConversationMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    type: row.type as ConversationMessage["type"],
    text: row.text,
    options: row.options ? JSON.parse(row.options) : undefined,
    timestamp: row.timestamp,
    answeredAt: row.answered_at || undefined,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
  };
}

// =============================================================================
// ConversationStore Class
// =============================================================================

export class ConversationStore {
  constructor(private db: Database.Database) {}

  // ---------------------------------------------------------------------------
  // Conversation CRUD
  // ---------------------------------------------------------------------------

  createConversation(
    projectId: string,
    options?: { title?: string; assistantId?: string }
  ): Conversation {
    const id = randomUUID();
    const now = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO conversations (id, project_id, title, assistant_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(id, projectId, options?.title || null, options?.assistantId || null, now, now);

    return this.getConversation(id)!;
  }

  getConversation(conversationId: string): Conversation | null {
    const row = this.db
      .prepare("SELECT * FROM conversations WHERE id = ?")
      .get(conversationId) as ConversationRow | undefined;

    return row ? rowToConversation(row) : null;
  }

  getConversationsByAssistant(assistantId: string): Conversation[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM conversations WHERE assistant_id = ? ORDER BY updated_at DESC"
      )
      .all(assistantId) as ConversationRow[];

    return rows.map(rowToConversation);
  }

  updateConversationTitle(conversationId: string, title: string): boolean {
    const result = this.db
      .prepare("UPDATE conversations SET title = ? WHERE id = ?")
      .run(title, conversationId);
    return result.changes > 0;
  }

  getMessageCount(conversationId: string): number {
    const row = this.db
      .prepare(
        "SELECT COUNT(*) as count FROM conversation_messages WHERE conversation_id = ?"
      )
      .get(conversationId) as { count: number };
    return row.count;
  }

  deleteConversation(conversationId: string): boolean {
    const result = this.db
      .prepare("DELETE FROM conversations WHERE id = ?")
      .run(conversationId);
    return result.changes > 0;
  }

  // ---------------------------------------------------------------------------
  // Message CRUD
  // ---------------------------------------------------------------------------

  addMessage(
    conversationId: string,
    input: CreateMessageInput
  ): ConversationMessage {
    const id = randomUUID();
    const now = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO conversation_messages (id, conversation_id, type, text, options, timestamp, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        conversationId,
        input.type,
        input.text,
        input.options ? JSON.stringify(input.options) : null,
        now,
        input.metadata ? JSON.stringify(input.metadata) : null
      );

    // Update conversation's updated_at
    this.db
      .prepare("UPDATE conversations SET updated_at = ? WHERE id = ?")
      .run(now, conversationId);

    return this.getMessage(id)!;
  }

  getMessage(messageId: string): ConversationMessage | null {
    const row = this.db
      .prepare("SELECT * FROM conversation_messages WHERE id = ?")
      .get(messageId) as MessageRow | undefined;

    return row ? rowToMessage(row) : null;
  }

  getMessages(conversationId: string): ConversationMessage[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM conversation_messages WHERE conversation_id = ? ORDER BY timestamp"
      )
      .all(conversationId) as MessageRow[];

    return rows.map(rowToMessage);
  }

  getPendingQuestion(conversationId: string): ConversationMessage | null {
    const row = this.db
      .prepare(
        `SELECT * FROM conversation_messages
         WHERE conversation_id = ? AND type = 'question' AND answered_at IS NULL
         ORDER BY timestamp DESC LIMIT 1`
      )
      .get(conversationId) as MessageRow | undefined;

    return row ? rowToMessage(row) : null;
  }

  answerQuestion(messageId: string): boolean {
    const now = new Date().toISOString();
    const result = this.db
      .prepare("UPDATE conversation_messages SET answered_at = ? WHERE id = ?")
      .run(now, messageId);
    return result.changes > 0;
  }
}

// =============================================================================
// Factory & Convenience Functions
// =============================================================================

export function createConversationStore(
  db: Database.Database
): ConversationStore {
  return new ConversationStore(db);
}

// Singleton convenience functions
export function createConversation(projectId: string): Conversation {
  return new ConversationStore(getDatabase()).createConversation(projectId);
}

export function getConversation(conversationId: string): Conversation | null {
  return new ConversationStore(getDatabase()).getConversation(conversationId);
}

export function deleteConversation(conversationId: string): boolean {
  return new ConversationStore(getDatabase()).deleteConversation(conversationId);
}

export function addMessage(
  conversationId: string,
  input: CreateMessageInput
): ConversationMessage {
  return new ConversationStore(getDatabase()).addMessage(conversationId, input);
}

export function getMessages(conversationId: string): ConversationMessage[] {
  return new ConversationStore(getDatabase()).getMessages(conversationId);
}

export function getPendingQuestion(
  conversationId: string
): ConversationMessage | null {
  return new ConversationStore(getDatabase()).getPendingQuestion(
    conversationId
  );
}

export function answerQuestion(messageId: string): boolean {
  return new ConversationStore(getDatabase()).answerQuestion(messageId);
}

export function getConversationsByAssistant(
  assistantId: string
): Conversation[] {
  return new ConversationStore(getDatabase()).getConversationsByAssistant(
    assistantId
  );
}

export function updateConversationTitle(
  conversationId: string,
  title: string
): boolean {
  return new ConversationStore(getDatabase()).updateConversationTitle(
    conversationId,
    title
  );
}

export function getMessageCount(conversationId: string): number {
  return new ConversationStore(getDatabase()).getMessageCount(conversationId);
}
