import { useState, useEffect } from 'react'
import { Square, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { Session, SessionStatus } from '@fleet-command/shared'

interface SessionCardProps {
  session: Session
  onStop: (sessionId: string) => void
  onViewLog: (sessionId: string) => void
}

/**
 * Formats the duration between two dates or from a date to now
 */
function formatDuration(startedAt: string, endedAt?: string): string {
  const start = new Date(startedAt).getTime()
  const end = endedAt ? new Date(endedAt).getTime() : Date.now()
  const seconds = Math.floor((end - start) / 1000)

  if (seconds < 60) {
    return `${seconds}s`
  }
  if (seconds < 3600) {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}m ${secs}s`
  }
  const hours = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  return `${hours}h ${mins}m`
}

/**
 * Returns the badge variant and color classes for a session status
 */
function getStatusStyles(status: SessionStatus): { variant: 'default' | 'secondary' | 'destructive'; className: string } {
  switch (status) {
    case 'running':
      return { variant: 'default', className: 'bg-green-600 hover:bg-green-600' }
    case 'completed':
      return { variant: 'secondary', className: 'bg-gray-500 hover:bg-gray-500 text-white' }
    case 'failed':
      return { variant: 'destructive', className: '' }
  }
}

export function SessionCard({ session, onStop, onViewLog }: SessionCardProps) {
  const [duration, setDuration] = useState(() =>
    formatDuration(session.startedAt, session.endedAt)
  )

  // Update duration every second for running sessions
  useEffect(() => {
    if (session.status !== 'running') return

    const interval = setInterval(() => {
      setDuration(formatDuration(session.startedAt))
    }, 1000)

    return () => clearInterval(interval)
  }, [session.status, session.startedAt])

  const statusStyles = getStatusStyles(session.status)

  const handleStopClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onStop(session.id)
  }

  const handleCardClick = () => {
    onViewLog(session.id)
  }

  return (
    <div
      onClick={handleCardClick}
      className={cn(
        'bg-bg-secondary rounded-lg p-4 cursor-pointer transition-all',
        'hover:bg-bg-hover border border-border',
        session.status === 'running' && 'border-green-500/50 shadow-[0_0_10px_rgba(34,197,94,0.2)]'
      )}
    >
      {/* Header: Session ID and Status Badge */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-text-muted font-mono">{session.id}</span>
        <Badge variant={statusStyles.variant} className={cn('text-xs', statusStyles.className)}>
          {session.status}
        </Badge>
      </div>

      {/* Project and Ticket/Brainstorm Info */}
      <div className="mb-2">
        <div className="text-sm text-text-primary font-medium">
          {session.projectId}
        </div>
        {(session.ticketId || session.brainstormId) && (
          <div className="text-xs text-text-muted mt-1">
            {session.ticketId && <span>Ticket: {session.ticketId}</span>}
            {session.brainstormId && <span>Brainstorm: {session.brainstormId}</span>}
          </div>
        )}
      </div>

      {/* Duration */}
      <div className="flex items-center gap-2 text-xs text-text-muted mb-2">
        <span>Duration: {duration}</span>
        {session.status === 'running' && (
          <span className="inline-block w-2 h-2 bg-green-500 rounded-full animate-pulse" />
        )}
      </div>

      {/* Preview text if available */}
      {session.preview && (
        <div className="text-xs text-text-muted line-clamp-2 mb-3">
          {session.preview}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        {session.status === 'running' && (
          <Button
            variant="destructive"
            size="sm"
            onClick={handleStopClick}
            className="h-7 text-xs"
          >
            <Square className="h-3 w-3 mr-1" />
            Stop
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={handleCardClick}
          className="h-7 text-xs"
        >
          <ExternalLink className="h-3 w-3 mr-1" />
          View Log
        </Button>
      </div>
    </div>
  )
}
