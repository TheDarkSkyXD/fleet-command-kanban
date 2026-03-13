export interface TerminalInfo {
  id: string
  projectId: string
  name: string
  createdAt: string
}

export interface TerminalMessage {
  type: 'input' | 'output' | 'resize' | 'exit'
  data?: string  // base64 for input/output
  cols?: number
  rows?: number
  code?: number
}
