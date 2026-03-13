import { useState, useEffect, useRef, useCallback } from 'react'
import { Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSessionOutput } from '@/hooks/useSSE'
import { Badge } from '@/components/ui/badge'

interface AgentLogEntry {
  type: string
  content?: string
  toolName?: string
  timestamp: string
  projectId?: string
  ticketId?: string
}

const MAX_ENTRIES = 200

function getTypeStyles(type: string): string {
  switch (type) {
    case 'assistant':
      return 'bg-blue-500/20 text-blue-400 border-blue-500/30'
    case 'tool_use':
      return 'bg-amber-500/20 text-amber-400 border-amber-500/30'
    case 'tool_result':
      return 'bg-gray-500/20 text-gray-400 border-gray-500/30'
    case 'system':
      return 'bg-purple-500/20 text-purple-400 border-purple-500/30'
    case 'error':
      return 'bg-red-500/20 text-red-400 border-red-500/30'
    default:
      return 'bg-gray-500/20 text-gray-400 border-gray-500/30'
  }
}

function formatTime(timestamp: string): string {
  const date = new Date(timestamp)
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

interface AgentLogTabProps {
  projectId: string | null
}

export function AgentLogTab({ projectId }: AgentLogTabProps) {
  const [entries, setEntries] = useState<AgentLogEntry[]>([])
  const [autoScroll, setAutoScroll] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)

  const handleSessionOutput = useCallback((data: Record<string, unknown>) => {
    // Filter by project if set
    if (projectId && data.projectId && data.projectId !== projectId) return

    const event = data.event as {
      type?: string
      message?: { content?: Array<{ type: string; text?: string; name?: string }> }
    } | undefined

    if (!event) return

    const timestamp = new Date().toISOString()

    if (event.type === 'assistant' && event.message?.content) {
      for (const block of event.message.content) {
        if (block.type === 'text' && block.text) {
          setEntries(prev => {
            const next = [...prev, { type: 'assistant', content: block.text, timestamp, projectId: data.projectId as string, ticketId: data.ticketId as string }]
            return next.length > MAX_ENTRIES ? next.slice(-MAX_ENTRIES) : next
          })
        } else if (block.type === 'tool_use') {
          setEntries(prev => {
            const next = [...prev, { type: 'tool_use', toolName: block.name, timestamp, projectId: data.projectId as string, ticketId: data.ticketId as string }]
            return next.length > MAX_ENTRIES ? next.slice(-MAX_ENTRIES) : next
          })
        }
      }
    } else if (event.type === 'result') {
      setEntries(prev => {
        const next = [...prev, { type: 'tool_result', content: 'Tool completed', timestamp }]
        return next.length > MAX_ENTRIES ? next.slice(-MAX_ENTRIES) : next
      })
    }
  }, [projectId])

  useSessionOutput(handleSessionOutput)

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [entries, autoScroll])

  // Detect user scroll
  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 50
    setAutoScroll(isNearBottom)
  }, [])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 h-8 shrink-0 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted">{entries.length} entries</span>
          {!autoScroll && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-yellow-500/10 text-yellow-400 border-yellow-500/30">
              Paused
            </Badge>
          )}
        </div>
        <button
          onClick={() => setEntries([])}
          className="text-text-muted hover:text-text-secondary"
          title="Clear logs"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto font-mono text-xs p-2"
        onScroll={handleScroll}
      >
        {entries.length === 0 ? (
          <div className="flex items-center justify-center h-full text-text-muted">
            Waiting for agent output...
          </div>
        ) : (
          entries.map((entry, i) => (
            <div key={i} className="flex items-start gap-2 py-0.5 hover:bg-bg-hover rounded px-1">
              <span className="text-text-muted shrink-0">{formatTime(entry.timestamp)}</span>
              <Badge variant="outline" className={cn('text-[10px] uppercase shrink-0 px-1.5 py-0', getTypeStyles(entry.type))}>
                {entry.type === 'tool_use' ? 'tool' : entry.type}
              </Badge>
              <span className="text-text-primary break-all">
                {entry.type === 'tool_use' ? entry.toolName : (entry.content?.slice(0, 300) || '')}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
