export interface Project {
  id: string
  slug: string
  path: string
  displayName?: string
  icon?: string
  color?: string
  template?: {
    name: string
    version: number
  }
  automatedPhases?: string[]
  automatedPhaseMigration?: boolean
  skippedPhases?: string[]
  swimlaneColors?: Record<string, string>
  wipLimits?: Record<string, number>
  branchPrefix?: string
  ticketPrefix?: string
  agentName?: string
  folderId?: string | null
}
