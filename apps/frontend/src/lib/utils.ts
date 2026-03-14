import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function timeAgo(date: string | Date | undefined): string {
  if (!date) return ''
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

export function formatDate(date: string | Date | undefined): string {
  if (!date) return ''
  return new Date(date).toLocaleDateString()
}

export function formatTime(date: string | Date): string {
  return new Date(date).toLocaleTimeString('en-US', { hour12: false })
}

/**
 * Extract numeric portion from ticket ID for sorting
 * "POT-14" → 14, "ABC-2" → 2, "TICKET-123" → 123
 */
export function parseTicketNumber(id: string): number {
  const match = id.match(/-(\d+)$/)
  return match ? parseInt(match[1], 10) : 0
}

/**
 * Convert technical tool names to user-friendly activity descriptions.
 * Used to show human-readable status while Claude is working.
 */
export function formatToolActivity(toolName: string, input?: Record<string, unknown>): string {
  // Skills - fleet command specific
  const skillPhrases: Record<string, string> = {
    'fleet-command:read-artifacts': 'Reading project documents',
    'fleet-command:create-artifacts': 'Writing documentation',
    'fleet-command:add-comment-to-task': 'Adding notes to task',
    'fleet-command:notify-user': 'Preparing update',
    'fleet-command:ask-question': 'Formulating question',
    'fleet-command:update-ralph-loop': 'Updating review status',
    'fleet-command:create-task': 'Creating new task',
    'fleet-command:get-task': 'Checking task details',
    'fleet-command:update-task-status': 'Updating task progress',
    'pull-request': 'Preparing pull request',
  }

  // MCP tools
  const mcpPhrases: Record<string, string> = {
    'chat_ask': 'Preparing response',
    'chat_notify': 'Sending update',
    'get_artifact': 'Reading document',
    'attach_artifact': 'Saving document',
    'list_artifacts': 'Checking documents',
    'ralph_loop_dock': 'Submitting review verdict',
    'update_task_status': 'Updating task',
    'get_task': 'Checking task',
    'create_task': 'Creating task',
    'get_ticket': 'Loading ticket details',
  }

  // Handle Skill tool
  if (toolName === 'Skill') {
    const skill = input?.skill as string
    return skillPhrases[skill] || 'Working on it'
  }

  // Handle MCP tools
  if (toolName.startsWith('mcp__fleet-command__')) {
    const mcpTool = toolName.replace('mcp__fleet-command__', '')
    return mcpPhrases[mcpTool] || 'Processing'
  }

  // Handle Read tool
  if (toolName === 'Read') {
    const filePath = input?.file_path as string
    const fileName = filePath?.split('/').pop() || 'file'
    const ext = fileName.split('.').pop()?.toLowerCase()

    if (ext === 'md') return 'Reading documentation'
    if (ext === 'json') return 'Checking configuration'
    if (ext === 'ts' || ext === 'tsx') return 'Reviewing TypeScript code'
    if (ext === 'js' || ext === 'jsx') return 'Reviewing JavaScript code'
    if (ext === 'css') return 'Checking styles'
    if (ext === 'test.ts' || ext === 'test.tsx' || ext === 'spec.ts') return 'Reviewing tests'
    if (fileName === 'package.json') return 'Checking dependencies'
    if (fileName === 'tsconfig.json') return 'Checking TypeScript config'
    return `Reading ${fileName}`
  }

  // Handle Grep tool
  if (toolName === 'Grep') {
    return 'Searching codebase'
  }

  // Handle Glob tool
  if (toolName === 'Glob') {
    const pattern = input?.pattern as string
    if (pattern?.includes('test') || pattern?.includes('spec')) return 'Finding test files'
    if (pattern?.includes('.ts') || pattern?.includes('.tsx')) return 'Finding TypeScript files'
    if (pattern?.includes('.md')) return 'Finding documentation'
    return 'Finding files'
  }

  // Handle Edit tool
  if (toolName === 'Edit') {
    return 'Making code changes'
  }

  // Handle Write tool
  if (toolName === 'Write') {
    return 'Writing new file'
  }

  // Handle Bash tool
  if (toolName === 'Bash') {
    const command = input?.command as string
    if (!command) return 'Running command'

    const cmd = command.trim().split(/\s+/)[0]

    // Git commands
    if (cmd === 'git') {
      const subCmd = command.trim().split(/\s+/)[1]
      const gitPhrases: Record<string, string> = {
        'status': 'Checking git status',
        'diff': 'Reviewing changes',
        'log': 'Checking commit history',
        'show': 'Viewing commit details',
        'branch': 'Checking branches',
        'add': 'Staging changes',
        'commit': 'Creating commit',
        'push': 'Pushing to remote',
        'pull': 'Pulling latest changes',
        'checkout': 'Switching branches',
        'stash': 'Stashing changes',
        'fetch': 'Fetching updates',
        'merge': 'Merging branches',
        'rebase': 'Rebasing branch',
      }
      return gitPhrases[subCmd] || 'Working with git'
    }

    // NPM/package manager commands
    if (cmd === 'npm' || cmd === 'pnpm' || cmd === 'yarn') {
      const subCmd = command.trim().split(/\s+/)[1]
      if (subCmd === 'install' || subCmd === 'i') return 'Installing dependencies'
      if (subCmd === 'run') return 'Running script'
      if (subCmd === 'test') return 'Running tests'
      if (subCmd === 'build') return 'Building project'
      return 'Running package command'
    }

    // Other common commands
    if (cmd === 'npx') return 'Running tool'
    if (cmd === 'ls' || cmd === 'find') return 'Exploring files'
    if (cmd === 'mkdir') return 'Creating directory'
    if (cmd === 'curl') return 'Making HTTP request'
    if (cmd === 'gh') return 'Working with GitHub'
    if (cmd === 'node') return 'Running Node.js'

    return 'Running command'
  }

  // Handle Task/Agent tools
  if (toolName === 'Task') {
    return 'Delegating task'
  }
  if (toolName === 'Agent') {
    const desc = input?.description as string
    if (desc) return desc.length > 40 ? desc.substring(0, 37) + '...' : desc
    return 'Running sub-agent'
  }

  // Handle web tools
  if (toolName === 'WebSearch') {
    const query = input?.query as string
    if (query) return `Searching: ${query.length > 30 ? query.substring(0, 27) + '...' : query}`
    return 'Searching the web'
  }
  if (toolName === 'WebFetch') {
    return 'Fetching web page'
  }

  // Handle TodoWrite
  if (toolName === 'TodoWrite') {
    return 'Updating task list'
  }

  // Handle LSP
  if (toolName === 'LSP') {
    return 'Analyzing code structure'
  }

  // Handle NotebookEdit
  if (toolName === 'NotebookEdit') {
    return 'Editing notebook'
  }

  // Default fallback
  return 'Working'
}
