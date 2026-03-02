import { useState, useMemo, useCallback, useRef } from 'react'
import { renderMarkdown } from '@/lib/markdown'
import {
  Pencil,
  Save,
  X,
  Upload,
  FileText,
  ChevronDown,
  ChevronUp,
  Loader2,
  Clock,
  ArrowRight,
  Terminal
} from 'lucide-react'
import {
  useUpdateTicket,
  useTicketArtifacts,
  useSessions,
  useSessionLog,
  useProjects
} from '@/hooks/queries'
import { api } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { IconButton } from '@/components/ui/icon-button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog'
import { cn, formatDate, formatTime, timeAgo } from '@/lib/utils'
import { ArtifactViewerFull } from './ArtifactViewerFull'
import type { Artifact, TicketHistoryEntry, SessionLogEntry } from '@potato-cannon/shared'

interface DetailsTabProps {
  projectId: string
  ticketId: string
  description?: string
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

interface SessionTerminalBarProps {
  sessionId: string
  isRunning: boolean
  // TODO: Re-enable onClick when session log feature is ready
  // onClick: () => void
}

function SessionTerminalBar({ sessionId, isRunning }: SessionTerminalBarProps) {
  // TODO: Re-enable click functionality when session log feature is ready
  // - Change div back to button
  // - Add onClick prop back to interface and function params
  // - Restore: onClick={onClick} hover:border-text-muted cursor-pointer group
  // - Restore "click to view" hint span with group-hover:opacity-100
  return (
    <div className="flex items-center gap-2 w-full px-3 py-1.5 mt-2 rounded bg-black/80 border border-border cursor-default">
      {isRunning ? (
        <span className="w-2 h-2 rounded-full bg-accent-green animate-pulse shrink-0" />
      ) : (
        <Terminal className="h-3 w-3 text-text-muted shrink-0" />
      )}
      <span className="font-mono text-xs text-accent-green">
        {sessionId.slice(0, 8)}
      </span>
    </div>
  )
}

export function DetailsTab({ projectId, ticketId, description, history }: DetailsTabProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editedDescription, setEditedDescription] = useState(description ?? '')
  const [isExpanded, setIsExpanded] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(null)
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const descriptionRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const updateTicket = useUpdateTicket()
  const { data: artifacts } = useTicketArtifacts(projectId, ticketId)
  const { data: allSessions } = useSessions()
  const { data: projects } = useProjects()
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

  // Group artifacts by phase
  const artifactsByPhase = useMemo(() => {
    const map = new Map<number, Artifact[]>()
    if (!artifacts || !sortedHistory.length) return map

    for (const artifact of artifacts) {
      if (artifact.phase) {
        const phaseIndex = sortedHistory.findIndex((entry) => entry.phase === artifact.phase)
        if (phaseIndex !== -1) {
          const existing = map.get(phaseIndex) || []
          existing.push(artifact)
          map.set(phaseIndex, existing)
          continue
        }
      }

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

  // Render markdown content
  const renderedDescription = useMemo(() => {
    if (!description) return ''
    return renderMarkdown(description)
  }, [description])

  // Check if description needs "See more" toggle
  const needsExpansion = useMemo(() => {
    if (!description) return false
    // Rough estimate: if more than 200 chars or 5 lines
    return description.length > 200 || description.split('\n').length > 5
  }, [description])

  const handleEdit = () => {
    setEditedDescription(description ?? '')
    setIsEditing(true)
  }

  const handleCancel = () => {
    setEditedDescription(description ?? '')
    setIsEditing(false)
  }

  const handleSave = useCallback(() => {
    updateTicket.mutate(
      {
        projectId,
        ticketId,
        updates: { description: editedDescription }
      },
      {
        onSuccess: () => {
          setIsEditing(false)
        }
      }
    )
  }, [projectId, ticketId, editedDescription, updateTicket])

  const handleImageUpload = useCallback(
    async (file: File) => {
      setIsUploading(true)
      try {
        const result = await api.uploadImage(projectId, ticketId, file)
        // Insert markdown image at cursor or end
        const imageMarkdown = `\n![${file.name}](/api/tickets/${encodeURIComponent(projectId)}/${ticketId}/images/${encodeURIComponent(result.name)})\n`
        setEditedDescription((prev) => prev + imageMarkdown)
      } catch (error) {
        console.error('Failed to upload image:', error)
      } finally {
        setIsUploading(false)
      }
    },
    [projectId, ticketId]
  )

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      handleImageUpload(file)
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  return (
    <div className="space-y-6">
      {/* Description Section */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-medium text-text-muted uppercase tracking-wide">Description</h3>
          {!isEditing && (
            <IconButton tooltip="Edit" onClick={handleEdit}>
              <Pencil className="h-4 w-4" />
            </IconButton>
          )}
        </div>

        {isEditing ? (
          <div className="rounded-lg bg-bg-tertiary border border-border p-3 space-y-3">
            <Textarea
              value={editedDescription}
              onChange={(e) => setEditedDescription(e.target.value)}
              className="min-h-[150px] bg-bg-secondary border-border text-text-primary"
              placeholder="Enter ticket description (supports markdown)..."
            />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                >
                  {isUploading ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Upload className="h-3 w-3" />
                  )}
                  Add Image
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleCancel}>
                  <X className="h-3 w-3" />
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={updateTicket.isPending}
                >
                  {updateTicket.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Save className="h-3 w-3" />
                  )}
                  Save
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-lg bg-bg-tertiary border border-border p-3">
            {description ? (
              <>
                <div
                  ref={descriptionRef}
                  className={cn(
                    'prose prose-sm prose-invert max-w-none text-text-secondary',
                    '[&_p]:my-2 [&_ul]:my-2 [&_ol]:my-2 [&_li]:my-0',
                    '[&_a]:text-accent [&_a]:no-underline hover:[&_a]:underline',
                    '[&_code]:bg-bg-tertiary [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded',
                    '[&_pre]:bg-bg-tertiary [&_pre]:p-2 [&_pre]:rounded',
                    '[&_img]:max-w-full [&_img]:rounded',
                    !isExpanded && needsExpansion && 'max-h-[100px] overflow-hidden'
                  )}
                  dangerouslySetInnerHTML={{ __html: renderedDescription }}
                />
                {needsExpansion && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="mt-2 text-text-muted hover:text-text-secondary w-full"
                  >
                    {isExpanded ? (
                      <>
                        <ChevronUp className="h-3 w-3" />
                        Show less
                      </>
                    ) : (
                      <>
                        <ChevronDown className="h-3 w-3" />
                        See more
                      </>
                    )}
                  </Button>
                )}
              </>
            ) : (
              <p className="text-sm text-text-primary italic">No description</p>
            )}
          </div>
        )}
      </div>

      {/* History Section */}
      <div>
        <h3 className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2">History</h3>

        {!history || history.length === 0 ? (
          <p className="text-sm text-text-muted italic">No phase history</p>
        ) : (
          <div className="relative">
            <div className="space-y-4">
              {sortedHistory.map((entry, i) => {
                const duration = formatDuration(entry.at, entry.endedAt)
                const isFirst = i === 0
                const isLast = i === sortedHistory.length - 1
                const isSessionRunning = entry.sessionId
                  ? sessionStatusMap.get(entry.sessionId) ?? false
                  : false
                const phaseArtifacts = artifactsByPhase.get(i) || []

                return (
                  <div key={i} className="relative pl-8">
                    {/* Timeline line segment */}
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

                      {/* Session terminal bar if present */}
                      {entry.sessionId && (
                        <SessionTerminalBar
                          sessionId={entry.sessionId}
                          isRunning={isSessionRunning}
                          // TODO: Re-enable onClick={() => setSelectedSessionId(entry.sessionId!)}
                        />
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
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

      {/* Artifact Viewer Full Modal */}
      <ArtifactViewerFull
        projectId={projectId}
        ticketId={ticketId}
        artifact={selectedArtifact}
        onClose={() => setSelectedArtifact(null)}
      />
    </div>
  )
}
