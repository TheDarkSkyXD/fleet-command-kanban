import { useMemo, useState } from 'react'
import { ArrowRight, Clock, Terminal, Loader2, FileText } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog'
import { formatDate, formatTime, timeAgo } from '@/lib/utils'
import { useSessions, useSessionLog, useTicketArtifacts, useProjects } from '@/hooks/queries'
import { ArtifactViewerFull } from './ArtifactViewerFull'
import type { TicketHistoryEntry, SessionLogEntry, Artifact } from '@fleet-command/shared'

interface HistoryTabProps {
  projectId: string
  ticketId: string
  history?: TicketHistoryEntry[]
}

function formatDuration(start: string, end?: string): string | null {
  if (!end) return null
  const startTime = new Date(start).getTime()
  const endTime = new Date(end).getTime()
  const seconds = Math.floor((endTime - startTime) / 1000)

  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
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

/**
 * Extract readable agent name from source path.
 * "agents/refinement.md" → "refinement"
 * "agents/adversarial-refinement.md" → "adversarial-refinement"
 */
function getAgentName(source: string): string {
  if (!source || source === 'unknown') return 'agent'
  // Extract filename without extension
  const filename = source.split('/').pop() || source
  return filename.replace(/\.md$/, '')
}

interface SessionTerminalBarProps {
  sessionId: string
  isRunning: boolean
  agentName?: string
  duration?: string | null
  exitCode?: number
  onClick: () => void
}

function SessionTerminalBar({ sessionId, isRunning, agentName, duration, exitCode, onClick }: SessionTerminalBarProps) {
  // Determine status color
  const isFailed = exitCode !== undefined && exitCode !== 0
  const statusColor = isRunning
    ? 'bg-accent-green'
    : isFailed
    ? 'bg-accent-red'
    : 'bg-text-muted'

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 w-full px-3 py-1.5 rounded bg-black/80 border border-border hover:border-text-muted transition-colors cursor-pointer group"
    >
      {isRunning ? (
        <span className={`w-2 h-2 rounded-full ${statusColor} animate-pulse shrink-0`} />
      ) : (
        <Terminal className={`h-3 w-3 shrink-0 ${isFailed ? 'text-accent-red' : 'text-text-muted'}`} />
      )}
      {agentName && (
        <span className="font-medium text-xs text-text-primary">
          {agentName}
        </span>
      )}
      <span className="font-mono text-xs text-accent-green/70 group-hover:text-accent-green/90">
        {sessionId.slice(0, 8)}
      </span>
      {duration && (
        <span className="text-[10px] text-text-muted">
          {duration}
        </span>
      )}
      <span className="ml-auto text-[10px] text-text-muted opacity-0 group-hover:opacity-100 transition-opacity">
        click to view
      </span>
    </button>
  )
}

export function HistoryTab({ projectId, ticketId, history }: HistoryTabProps) {
  const { data: allSessions } = useSessions()
  const { data: artifacts } = useTicketArtifacts(projectId, ticketId)
  const { data: projects } = useProjects()
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(null)
  const { data: sessionLog, isLoading: logLoading } = useSessionLog(selectedSessionId)

  // Get the project color
  const projectColor = useMemo(() => {
    const project = projects?.find((p) => p.id === projectId)
    return project?.color
  }, [projects, projectId])

  // Create a map of session IDs to their running status
  const sessionStatusMap = useMemo(() => {
    const map = new Map<string, boolean>()
    if (allSessions) {
      for (const session of allSessions) {
        map.set(session.id, session.status === 'running')
      }
    }
    return map
  }, [allSessions])

  // Reverse to show most recent first
  const sortedHistory = useMemo(() => {
    if (!history) return []
    return [...history].reverse()
  }, [history])

  // Group artifacts by phase - use phase field if available, fall back to timestamp matching for legacy artifacts
  const artifactsByPhase = useMemo(() => {
    const map = new Map<number, Artifact[]>()
    if (!artifacts || !sortedHistory.length) return map

    for (const artifact of artifacts) {
      // If artifact has a phase field, match by phase name
      if (artifact.phase) {
        const phaseIndex = sortedHistory.findIndex((entry) => entry.phase === artifact.phase)
        if (phaseIndex !== -1) {
          const existing = map.get(phaseIndex) || []
          existing.push(artifact)
          map.set(phaseIndex, existing)
          continue
        }
      }

      // Fall back to timestamp matching for legacy artifacts without phase field
      if (!artifact.savedAt) continue
      const artifactTime = new Date(artifact.savedAt).getTime()

      for (let i = 0; i < sortedHistory.length; i++) {
        const entry = sortedHistory[i]
        const phaseStart = new Date(entry.at).getTime()
        const phaseEnd = entry.endedAt ? new Date(entry.endedAt).getTime() : Date.now()

        if (artifactTime >= phaseStart && artifactTime <= phaseEnd) {
          const existing = map.get(i) || []
          existing.push(artifact)
          map.set(i, existing)
          break
        }
      }
    }
    return map
  }, [artifacts, sortedHistory])

  if (!history || history.length === 0) {
    return (
      <p className="text-sm text-text-muted italic py-4">No phase history</p>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-text-muted">
        Showing {sortedHistory.length} phase transition{sortedHistory.length !== 1 ? 's' : ''}
      </p>

      <div className="relative">
        <div className="space-y-4">
          {sortedHistory.map((entry, i) => {
            const duration = formatDuration(entry.at, entry.endedAt)
            const isFirst = i === 0
            const isLast = i === sortedHistory.length - 1
            const phaseArtifacts = artifactsByPhase.get(i) || []

            // Build list of sessions to display (new format or legacy fallback)
            const sessionsToRender: Array<{
              sessionId: string
              source?: string
              startedAt?: string
              endedAt?: string
              exitCode?: number
            }> = []

            if (entry.sessions && entry.sessions.length > 0) {
              // New format: use sessions array
              sessionsToRender.push(...entry.sessions)
            } else if (entry.sessionId) {
              // Legacy format: single sessionId
              sessionsToRender.push({
                sessionId: entry.sessionId,
                startedAt: entry.at,
                endedAt: entry.endedAt,
              })
            }

            return (
              <div key={i} className="relative pl-8">
                {/* Timeline line segment (connects to next item) */}
                {!isLast && (
                  <div
                    className={`absolute left-[11px] top-4 bottom-[-16px] w-px ${
                      isFirst ? 'bg-border' : 'bg-accent'
                    }`}
                  />
                )}
                {/* Timeline dot */}
                <div
                  className={`absolute left-1.5 top-1 w-3 h-3 rounded-full border-2 ${
                    isFirst
                      ? 'bg-transparent border-border'
                      : 'bg-accent border-accent'
                  }`}
                />

                <div className="p-3 rounded-lg bg-bg-tertiary border border-border">
                  {/* Phase name */}
                  <div className="flex items-center gap-2 mb-2">
                    <Badge
                      variant={isFirst ? 'default' : 'outline'}
                      className={isFirst ? 'bg-accent text-white' : ''}
                    >
                      {entry.phase}
                    </Badge>
                    {isFirst && (
                      <span className="text-xs text-text-muted">Current</span>
                    )}
                  </div>

                  {/* Timestamp */}
                  <div className="flex items-center gap-2 text-xs text-text-muted">
                    <Clock className="h-3 w-3" />
                    <span>
                      {formatDate(entry.at)} at {formatTime(entry.at)}
                    </span>
                  </div>

                  {/* Duration if available */}
                  {duration && (
                    <div className="flex items-center gap-2 text-xs text-text-muted mt-1">
                      <ArrowRight className="h-3 w-3" />
                      <span>Duration: {duration}</span>
                    </div>
                  )}

                  {/* Artifacts created during this phase */}
                  {phaseArtifacts.length > 0 && (
                    <div className="mt-3 space-y-1">
                      {phaseArtifacts.map((artifact) => (
                        <button
                          key={artifact.filename}
                          onClick={() => setSelectedArtifact(artifact)}
                          className="flex items-start gap-2 text-xs text-text-secondary bg-bg-secondary hover:bg-bg-hover rounded px-2 py-1.5 w-full text-left transition-colors cursor-pointer"
                        >
                          <FileText
                            className="h-3 w-3 shrink-0 mt-0.5"
                            style={projectColor ? { color: projectColor } : undefined}
                          />
                          <div className="min-w-0">
                            <span className="font-medium block">{artifact.filename}</span>
                            {artifact.description && (
                              <span className="text-text-muted text-[11px] block mt-0.5">
                                {artifact.description}
                              </span>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Session terminal bars */}
                  {sessionsToRender.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {sessionsToRender.map((session) => {
                        const isRunning = sessionStatusMap.get(session.sessionId) ?? false
                        const sessionDuration = session.startedAt
                          ? formatDuration(session.startedAt, session.endedAt)
                          : null

                        return (
                          <SessionTerminalBar
                            key={session.sessionId}
                            sessionId={session.sessionId}
                            isRunning={isRunning}
                            agentName={session.source ? getAgentName(session.source) : undefined}
                            duration={sessionDuration}
                            exitCode={session.exitCode}
                            onClick={() => setSelectedSessionId(session.sessionId)}
                          />
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

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

      {/* Artifact Viewer Modal */}
      <ArtifactViewerFull
        projectId={projectId}
        ticketId={ticketId}
        artifact={selectedArtifact}
        onClose={() => setSelectedArtifact(null)}
      />
    </div>
  )
}
