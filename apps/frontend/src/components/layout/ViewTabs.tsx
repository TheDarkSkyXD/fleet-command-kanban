import { Link, useLocation } from '@tanstack/react-router'
import { LayoutDashboard, SlidersHorizontal, Terminal } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useClaudeStatus } from '@/hooks/queries'

function ClaudeStatusIndicator() {
  const { data: status, isLoading, isError } = useClaudeStatus()

  if (isLoading) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs text-text-muted">
            <div className="h-2 w-2 rounded-full bg-text-muted animate-pulse" />
            <span>Claude</span>
          </div>
        </TooltipTrigger>
        <TooltipContent>Checking Claude CLI status...</TooltipContent>
      </Tooltip>
    )
  }

  if (isError || !status) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs text-text-muted">
            <div className="h-2 w-2 rounded-full bg-accent-yellow animate-pulse" />
            <span>Claude</span>
          </div>
        </TooltipTrigger>
        <TooltipContent>Unable to check Claude CLI status</TooltipContent>
      </Tooltip>
    )
  }

  const isReady = status.installed && status.authenticated
  const label = !status.installed
    ? 'Claude CLI not installed'
    : !status.authenticated
      ? 'Claude CLI not authenticated'
      : `Claude CLI v${status.version}${status.email ? ` · ${status.email}` : ''}`

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs text-text-muted">
          <div className={cn(
            'h-2 w-2 rounded-full',
            isReady ? 'bg-accent-green' : 'bg-accent-red'
          )} />
          <span>Claude</span>
        </div>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

const isElectron = !!(window as { electronAPI?: unknown }).electronAPI

function DevToolsToggle() {
  if (!isElectron) return null

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={() => (window as { electronAPI?: { invoke: (channel: string) => void } }).electronAPI?.invoke('toggle-devtools')}
          className="flex items-center justify-center w-8 h-8 rounded-md text-text-muted hover:text-accent hover:bg-bg-hover active:bg-bg-tertiary transition-colors"
        >
          <Terminal className="h-4 w-4" strokeWidth={2.5} />
        </button>
      </TooltipTrigger>
      <TooltipContent>Toggle DevTools</TooltipContent>
    </Tooltip>
  )
}

export function ViewTabs() {
  const location = useLocation()

  // Extract projectId from URL
  const projectMatch = location.pathname.match(/^\/projects\/([^/]+)/)
  const projectId = projectMatch ? decodeURIComponent(projectMatch[1]) : null

  if (!projectId) return null // Don't show tabs if not on a project route

  const isBoardActive = location.pathname.endsWith('/board')
  const isConfigureActive = location.pathname.endsWith('/configure')

  return (
    <nav className="hidden sm:flex flex-1 items-center gap-1">
      <div className="flex-1" />
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            to="/projects/$projectId/board"
            params={{ projectId }}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors',
              isBoardActive
                ? 'bg-bg-tertiary text-text-primary'
                : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'
            )}
          >
            <LayoutDashboard className="h-4 w-4" />
            <span>Board</span>
          </Link>
        </TooltipTrigger>
        <TooltipContent>An AI Assisted Kanban board</TooltipContent>
      </Tooltip>
      <ClaudeStatusIndicator />
      <DevToolsToggle />
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            to="/projects/$projectId/configure"
            params={{ projectId }}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors',
              isConfigureActive
                ? 'bg-bg-tertiary text-text-primary'
                : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'
            )}
          >
            <SlidersHorizontal className="h-4 w-4" />
            <span>Configure</span>
          </Link>
        </TooltipTrigger>
        <TooltipContent>Configure Project</TooltipContent>
      </Tooltip>
    </nav>
  )
}
