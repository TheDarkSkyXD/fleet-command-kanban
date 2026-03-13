export interface ConversationEntry {
  id: string
  question: string
  options?: string[]
  askedAt: string
  phase?: string
  answer?: string
  answeredAt?: string
}

export interface TicketPendingQuestion {
  conversationId: string
  question: string
  options?: string[]
  askedAt: string
  phase?: string
  claudeSessionId?: string
}

export interface TicketPendingResponse {
  question?: TicketPendingQuestion
}

export interface TicketMessage {
  type: 'question' | 'user' | 'notification' | 'artifact'
  text: string
  conversationId?: string
  options?: string[]
  timestamp: string
  artifact?: {
    filename: string
    description?: string
  }
}

export interface TicketMessagesResponse {
  messages: TicketMessage[]
}

export interface ArtifactChatMessage {
  type: 'question' | 'user' | 'error' | 'system'
  text: string
  conversationId?: string
  options?: string[]
  timestamp: string
}

export interface ArtifactChatPendingResponse {
  question?: {
    conversationId: string
    question: string
    options?: string[]
    askedAt: string
  }
  sessionActive: boolean
  endReason?: 'completed' | 'error' | 'timeout'
}

export interface ArtifactChatStartResponse {
  sessionId: string
  contextId: string
}
