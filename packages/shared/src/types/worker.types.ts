export interface WorkerNode {
  id: string
  type: 'agent' | 'ralphLoop' | 'taskLoop' | 'answerBot'
  description?: string
  agentType?: string
  model?: string
  hasOverride?: boolean
  maxAttempts?: number
  workers?: WorkerNode[]
}

export interface WorkerTreeResponse {
  workers: WorkerNode[]
}
