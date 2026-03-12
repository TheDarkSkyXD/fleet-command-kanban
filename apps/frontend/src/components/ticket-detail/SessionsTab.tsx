import { useMemo, useState } from 'react'
import { Loader2, Play, Square, Clock, Terminal, ExternalLink } from 'lucide-react'
import { useSessions, useStopSession, useSessionLog } from '@/hooks/queries'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog'
import { timeAgo } from '@/lib/utils'
import type { Session, SessionLogEntry } from '@fleet-command/shared'

interface SessionsTabProps {
  ticketId: string
}

function formatDuration(start: string, end?: string): string {
  const startTime = new Date(start).getTime()
  const endTime = end ? new Date(end).getTime() : Date.now()
  const seconds = Math.floor((endTime - startTime) / 1000)

  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
}

function getStatusColor(status: Session['status']) {
  switch (status) {
    case 'running':
      return 'bg-accent-green/20 text-accent-green border-accent-green/30'
    case 'completed':
      return 'bg-text-muted/20 text-text-secondary border-text-muted/30'
    case 'failed':
      return 'bg-accent-red/20 text-accent-red border-accent-red/30'
    default:
      return 'bg-text-muted/20 text-text-muted border-text-muted/30'
  }
}

function SessionLogViewer({ entries }: { entries: SessionLogEntry[] }) {
  return (
    <div className="space-y-2 font-mono text-xs">
      {entries.map((entry, i) => (
        <div key={i} className="p-2 rounded bg-bg-tertiary">
          <div className="flex items-center gap-2 mb-1">
            <Badge
              variant="outline"
              className={
                entry.type === 'assistant'
                  ? 'border-accent text-accent'
                  : entry.type === 'tool_use'
                  ? 'border-accent-yellow text-accent-yellow'
                  : entry.type === 'tool_result'
                  ? 'border-accent-green text-accent-green'
                  : entry.type === 'user'
                  ? 'border-accent-purple text-accent-purple'
                  : 'border-text-muted text-text-muted'
              }
            >
              {entry.type}
            </Badge>
            {entry.tool_name && (
              <span className="text-text-muted">{entry.tool_name}</span>
            )}
            {entry.timestamp && (
              <span className="text-text-muted ml-auto">{timeAgo(entry.timestamp)}</span>
            )}
          </div>
          {entry.content && (
            <pre className="text-text-secondary whitespace-pre-wrap break-words overflow-hidden">
              {entry.content.slice(0, 500)}
              {entry.content.length > 500 && '...'}
            </pre>
          )}
          {entry.tool_result && (
            <pre className="text-text-secondary whitespace-pre-wrap break-words overflow-hidden mt-1">
              {entry.tool_result.slice(0, 300)}
              {entry.tool_result.length > 300 && '...'}
            </pre>
          )}
        </div>
      ))}
    </div>
  )
}

function SessionCard({
  session,
  onViewLog,
  onStop
}: {
  session: Session
  onViewLog: () => void
  onStop?: () => void
}) {
  const isRunning = session.status === 'running'

  return (
    <div className="p-3 rounded-lg bg-bg-secondary border border-border hover:bg-bg-hover transition-colors">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {isRunning ? (
            <Play className="h-3 w-3 text-accent-green animate-pulse" />
          ) : (
            <Terminal className="h-3 w-3 text-text-muted" />
          )}
          <span className="text-xs font-mono text-text-muted">{session.id.slice(0, 8)}</span>
        </div>
        <Badge variant="outline" className={getStatusColor(session.status)}>
          {session.status}
        </Badge>
      </div>

      <div className="flex items-center gap-3 text-xs text-text-muted mb-2">
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {formatDuration(session.startedAt, session.endedAt)}
        </span>
        <span>{timeAgo(session.startedAt)}</span>
      </div>

      {session.preview && (
        <p className="text-xs text-text-secondary line-clamp-2 mb-2">
          {session.preview}
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button variant="outline" size="xs" onClick={onViewLog}>
          <ExternalLink className="h-3 w-3" />
          View Log
        </Button>
        {isRunning && onStop && (
          <Button
            variant="outline"
            size="xs"
            onClick={onStop}
            className="text-accent-red border-accent-red/50 hover:bg-accent-red/10"
          >
            <Square className="h-3 w-3" />
            Stop
          </Button>
        )}
      </div>
    </div>
  )
}

export function SessionsTab({ ticketId }: SessionsTabProps) {
  const { data: allSessions, isLoading } = useSessions()
  const stopSession = useStopSession()
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const { data: sessionLog, isLoading: logLoading } = useSessionLog(selectedSessionId)

  // Filter sessions for this ticket
  const ticketSessions = useMemo(() => {
    if (!allSessions) return []
    return allSessions.filter((s) => s.ticketId === ticketId)
  }, [allSessions, ticketId])

  // Group into active and inactive
  const activeSessions = useMemo(
    () => ticketSessions.filter((s) => s.status === 'running'),
    [ticketSessions]
  )
  const inactiveSessions = useMemo(
    () => ticketSessions.filter((s) => s.status !== 'running'),
    [ticketSessions]
  )

  const handleStop = (sessionId: string) => {
    stopSession.mutate(sessionId)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-text-muted" />
      </div>
    )
  }

  if (ticketSessions.length === 0) {
    return (
      <p className="text-sm text-text-muted italic py-4">No sessions for this ticket</p>
    )
  }

  return (
    <div className="space-y-6">
      {/* Active Sessions */}
      {activeSessions.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-text-primary mb-2 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-accent-green animate-pulse" />
            Active ({activeSessions.length})
          </h4>
          <div className="space-y-2">
            {activeSessions.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                onViewLog={() => setSelectedSessionId(session.id)}
                onStop={() => handleStop(session.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Inactive Sessions */}
      {inactiveSessions.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-text-primary mb-2">
            Inactive ({inactiveSessions.length})
          </h4>
          <div className="space-y-2">
            {inactiveSessions.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                onViewLog={() => setSelectedSessionId(session.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Session Log Modal */}
      <Dialog
        open={!!selectedSessionId}
        onOpenChange={(open) => !open && setSelectedSessionId(null)}
      >
        <DialogContent className="bg-bg-secondary border-border max-w-3xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-text-primary flex items-center gap-2">
              <Terminal className="h-4 w-4" />
              Session Log
              <span className="text-xs font-mono text-text-muted">
                {selectedSessionId?.slice(0, 8)}
              </span>
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="flex-1 min-h-0 max-h-[60vh]">
            {logLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-text-muted" />
              </div>
            ) : sessionLog && sessionLog.length > 0 ? (
              <SessionLogViewer entries={sessionLog} />
            ) : (
              <p className="text-sm text-text-muted italic py-4">No log entries</p>
            )}
          </ScrollArea>
          <DialogFooter showCloseButton />
        </DialogContent>
      </Dialog>
    </div>
  )
}
