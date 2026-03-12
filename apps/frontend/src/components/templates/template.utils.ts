import type { TemplatePhase } from '@fleet-command/shared'

export type AutomationType = 'manual' | 'agents' | 'ralph-loop' | 'ticket-loop'

/**
 * Get automation type from phase configuration
 */
export function getAutomationType(phase: TemplatePhase): AutomationType {
  if (phase.ralphLoop) return 'ralph-loop'
  if (phase.ticketLoop) return 'ticket-loop'
  if (phase.agents && phase.agents.length > 0) return 'agents'
  return 'manual'
}

/**
 * Generate a unique ID for agents
 */
export function generateAgentId(): string {
  return `agent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}
