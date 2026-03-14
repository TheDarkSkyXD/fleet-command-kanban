export interface Conversation {
  id: string;
  projectId: string;
  title?: string | null;
  assistantId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationMessage {
  id: string;
  conversationId: string;
  type: "question" | "user" | "notification" | "artifact";
  text: string;
  options?: string[];
  timestamp: string;
  answeredAt?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateMessageInput {
  type: ConversationMessage["type"];
  text: string;
  options?: string[];
  metadata?: Record<string, unknown>;
}
