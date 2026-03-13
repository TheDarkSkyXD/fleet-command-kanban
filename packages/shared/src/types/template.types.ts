export interface Template {
  name: string
  description?: string
  version: number
  isDefault?: boolean
  phases: TemplatePhase[]
  createdAt: string
  updatedAt: string
}

export interface TemplatePhase {
  id: string
  name: string
  description?: string
  requiresWorktree?: boolean
  skippable?: boolean
  transitions?: {
    next?: string
    manual?: boolean
  }
  output?: {
    artifacts?: string[]
  }
  workers?: TemplateWorker[]
  agents?: TemplateAgent[]
  ralphLoop?: RalphLoopConfig
  ticketLoop?: TicketLoopConfig
}

export interface TemplateWorker {
  id: string
  type: 'agent' | 'ralphLoop' | 'taskLoop' | 'answerBot'
  description?: string
  source?: string
  workers?: TemplateWorker[]
  maxAttempts?: number
}

export interface TemplateAgent {
  id?: string
  type: string
  role: 'primary' | 'adversarial' | 'validation'
  description?: string
  prompt?: string
  context?: {
    artifacts?: string[]
  }
}

export interface RalphLoopConfig {
  loopId: string
  maxAttempts: number
  agents: TemplateAgent[]
}

export interface TicketLoopConfig {
  loopId: string
  input: string[]
  agents?: TemplateAgent[]
  ralphLoop?: RalphLoopConfig
}
