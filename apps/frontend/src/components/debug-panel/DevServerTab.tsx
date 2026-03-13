import { useState, useEffect, useRef, useCallback } from 'react'
import { Trash2, Play, Square, ExternalLink, AlertTriangle, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  useDevServerStatus,
  useDevServerConfig,
  useStartDevServer,
  useStopDevServer
} from '@/hooks/queries'
import { useDevServerWebSocket } from '@/hooks/useWebSocket'
import { DevServerConfigDialog } from './DevServerConfigDialog'
import type { DevServerLogEntry } from '@fleet-command/shared'

const MAX_LOG_ENTRIES = 300

interface DevServerTabProps {
  projectId: string
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

export function DevServerTab({ projectId }: DevServerTabProps) {
  const { data: status } = useDevServerStatus(projectId)
  const { data: config } = useDevServerConfig(projectId)
  const startDevServer = useStartDevServer()
  const stopDevServer = useStopDevServer()
  const [logs, setLogs] = useState<DevServerLogEntry[]>([])
  const [autoScroll, setAutoScroll] = useState(true)
  const [configOpen, setConfigOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const handleWsMessage = useCallback((data: unknown) => {
    const msg = data as { type: string; entry?: DevServerLogEntry; status?: string }
    if (msg.type === 'log' && msg.entry) {
      setLogs(prev => {
        const next = [...prev, msg.entry!]
        return next.length > MAX_LOG_ENTRIES ? next.slice(-MAX_LOG_ENTRIES) : next
      })
    }
  }, [])

  const isRunning = status?.status === 'running' || status?.status === 'starting'

  useDevServerWebSocket(projectId, {
    onMessage: handleWsMessage,
    enabled: isRunning
  })

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [logs, autoScroll])

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 50)
  }, [])

  function handleStart() {
    startDevServer.mutate({ projectId })
  }

  function handleStop() {
    stopDevServer.mutate(projectId)
  }

  const serverStatus = status?.status ?? 'stopped'
  const isCrashed = serverStatus === 'crashed'

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 h-8 shrink-0 border-b border-border">
        <div className="flex items-center gap-1.5">
          {isRunning ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={handleStop}
              className="h-5 px-1.5 text-xs"
            >
              <Square className="h-3 w-3 mr-1 text-red-400" />
              Stop
            </Button>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              onClick={handleStart}
              className={cn("h-5 px-1.5 text-xs", isCrashed && "text-destructive")}
            >
              {isCrashed ? (
                <AlertTriangle className="h-3 w-3 mr-1" />
              ) : (
                <Play className="h-3 w-3 mr-1 text-green-400" />
              )}
              {isCrashed ? 'Restart' : 'Start'}
            </Button>
          )}
        </div>

        {/* Status badge */}
        <Badge
          variant="outline"
          className={cn(
            'text-[10px] px-1.5 py-0',
            serverStatus === 'running' && 'bg-green-500/10 text-green-400 border-green-500/30',
            serverStatus === 'starting' && 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
            serverStatus === 'crashed' && 'bg-red-500/10 text-red-400 border-red-500/30',
            serverStatus === 'stopped' && 'bg-gray-500/10 text-gray-400 border-gray-500/30',
          )}
        >
          {serverStatus}
        </Badge>

        {/* Detected URL */}
        {status?.detectedUrl && (
          <a
            href={status.detectedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
          >
            <ExternalLink className="h-3 w-3" />
            {status.detectedUrl}
          </a>
        )}

        <div className="flex-1" />

        <span className="text-xs text-text-muted">{logs.length} lines</span>
        {!autoScroll && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-yellow-500/10 text-yellow-400 border-yellow-500/30">
            Paused
          </Badge>
        )}

        <button
          onClick={() => setLogs([])}
          className="text-text-muted hover:text-text-secondary"
          title="Clear logs"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>

        <button
          onClick={() => setConfigOpen(true)}
          className="text-text-muted hover:text-text-secondary"
          title="Dev server settings"
        >
          <Settings className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Logs */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto font-mono text-xs p-2"
        onScroll={handleScroll}
      >
        {logs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-text-muted">
            {isRunning ? 'Waiting for output...' : 'Dev server not running. Click Start to begin.'}
          </div>
        ) : (
          logs.map((entry, i) => (
            <div
              key={i}
              className={cn(
                'py-0.5 px-1 hover:bg-bg-hover rounded whitespace-pre-wrap break-all',
                entry.stream === 'stderr' ? 'text-red-400' : 'text-text-primary'
              )}
            >
              <span className="text-text-muted mr-2">{formatTime(entry.timestamp)}</span>
              {entry.message}
            </div>
          ))
        )}
      </div>

      <DevServerConfigDialog
        projectId={projectId}
        open={configOpen}
        onOpenChange={setConfigOpen}
        config={config}
      />
    </div>
  )
}
