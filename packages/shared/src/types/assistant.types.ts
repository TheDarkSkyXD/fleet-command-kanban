export interface Assistant {
  id: string
  projectId: string
  conversationId: string | null
  createdAt: string
  updatedAt: string
  hasActiveSession?: boolean
}
