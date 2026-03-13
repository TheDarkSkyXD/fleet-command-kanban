export type DevServerStatus = 'stopped' | 'starting' | 'running' | 'crashed'

export interface DevServerState {
  status: DevServerStatus
  command?: string
  detectedUrl?: string
  pid?: number
  startedAt?: string
}

export interface DevServerConfig {
  projectType?: string
  customCommand?: string
  detectedCommand?: string
}

export interface DevServerLogEntry {
  message: string
  timestamp: string
  stream: 'stdout' | 'stderr'
}
