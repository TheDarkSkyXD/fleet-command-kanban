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
  disabledPhases?: string[]
  disabledPhaseMigration?: boolean
  swimlaneColors?: Record<string, string>
  branchPrefix?: string
  folderId?: string | null
}
