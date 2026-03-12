import { useState, useEffect, useRef, useCallback } from 'react'
import { Search, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLogEntries } from '@/hooks/useSSE'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import type { LogEntry, LogLevel } from '@fleet-command/shared'

const MAX_ENTRIES = 500

/**
 * Returns the badge color classes for a log level
 */
function getLevelStyles(level: LogLevel): string {
  switch (level) {
    case 'info':
      return 'bg-blue-500/20 text-blue-400 border-blue-500/30'
    case 'warn':
      return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
    case 'error':
      return 'bg-red-500/20 text-red-400 border-red-500/30'
    case 'debug':
      return 'bg-gray-500/20 text-gray-400 border-gray-500/30'
    default:
      return 'bg-gray-500/20 text-gray-400 border-gray-500/30'
  }
}

/**
 * Formats timestamp to HH:MM:SS
 */
function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp)
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

function LogEntryRow({ entry }: { entry: LogEntry }) {
  const levelStyles = getLevelStyles(entry.level)

  return (
    <div className="flex items-start gap-3 py-1.5 px-2 hover:bg-bg-hover rounded text-sm">
      <span className="text-text-muted font-mono text-xs shrink-0">
        {formatTimestamp(entry.timestamp)}
      </span>
      <Badge variant="outline" className={cn('text-xs uppercase shrink-0', levelStyles)}>
        {entry.level}
      </Badge>
      <span className="font-mono text-text-primary break-all">
        {entry.message}
      </span>
    </div>
  )
}

export function LogsView() {
  const [entries, setEntries] = useState<LogEntry[]>(() => [
    {
      level: 'info',
      message: 'Dashboard started',
      timestamp: new Date().toISOString()
    }
  ])
  const [searchQuery, setSearchQuery] = useState('')
  const [levelFilter, setLevelFilter] = useState<LogLevel | 'all'>('all')
  const [autoScroll, setAutoScroll] = useState(true)

  const scrollRef = useRef<HTMLDivElement>(null)

  // Subscribe to SSE log entries
  const handleLogEntry = useCallback((data: Record<string, unknown>) => {
    const newEntry: LogEntry = {
      level: (data.level as LogLevel) || 'info',
      message: (data.message as string) || '',
      timestamp: (data.timestamp as string) || new Date().toISOString(),
      data: data.data as Record<string, unknown> | undefined
    }

    setEntries((prev) => {
      const updated = [...prev, newEntry]
      // Keep only the last MAX_ENTRIES
      if (updated.length > MAX_ENTRIES) {
        return updated.slice(updated.length - MAX_ENTRIES)
      }
      return updated
    })
  }, [])

  useLogEntries(handleLogEntry)

  // Auto-scroll to bottom when new entries arrive
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      const scrollElement = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]')
      if (scrollElement) {
        scrollElement.scrollTop = scrollElement.scrollHeight
      }
    }
  }, [entries, autoScroll])

  // Filter entries based on search and level
  const filteredEntries = entries.filter((entry) => {
    // Level filter
    if (levelFilter !== 'all' && entry.level !== levelFilter) {
      return false
    }
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      return entry.message.toLowerCase().includes(query)
    }
    return true
  })

  return (
    <div className="p-4 text-text-primary h-full flex flex-col">
      <h2 className="text-xl font-semibold mb-4">Logs</h2>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        {/* Search Input */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
          <Input
            type="text"
            placeholder="Search logs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Level Filter */}
        <Select value={levelFilter} onValueChange={(value) => setLevelFilter(value as LogLevel | 'all')}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Level" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="info">Info</SelectItem>
            <SelectItem value="warn">Warn</SelectItem>
            <SelectItem value="error">Error</SelectItem>
            <SelectItem value="debug">Debug</SelectItem>
          </SelectContent>
        </Select>

        {/* Auto-scroll Checkbox */}
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <button
            type="button"
            role="checkbox"
            aria-checked={autoScroll}
            onClick={() => setAutoScroll(!autoScroll)}
            className={cn(
              'h-4 w-4 rounded border transition-colors flex items-center justify-center',
              autoScroll
                ? 'bg-accent border-accent text-white'
                : 'border-border bg-bg-secondary'
            )}
          >
            {autoScroll && <Check className="h-3 w-3" />}
          </button>
          <span className="text-sm text-text-muted">Auto-scroll</span>
        </label>
      </div>

      {/* Entry count */}
      <div className="text-xs text-text-muted mb-2">
        Showing {filteredEntries.length} of {entries.length} entries
      </div>

      {/* Log Entries */}
      <ScrollArea ref={scrollRef} className="flex-1 bg-bg-secondary rounded-lg border border-border">
        <div className="p-2 min-h-full">
          {filteredEntries.length === 0 ? (
            <div className="text-center text-text-muted py-8">
              No log entries {searchQuery || levelFilter !== 'all' ? 'matching filters' : ''}
            </div>
          ) : (
            filteredEntries.map((entry, index) => (
              <LogEntryRow key={index} entry={entry} />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
