import { cn } from '@/lib/utils'
import { useSessionLog } from '@/hooks/queries'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { SessionLogEntry } from '@fleet-command/shared'

interface SessionLogModalProps {
  sessionId: string | null
  open: boolean
  onClose: () => void
}

/**
 * Returns the color classes for a log entry type
 */
function getEntryTypeStyles(type: SessionLogEntry['type'], isError?: boolean): string {
  if (isError) {
    return 'text-red-400 border-l-red-500'
  }

  switch (type) {
    case 'assistant':
      return 'text-blue-400 border-l-blue-500'
    case 'user':
      return 'text-green-400 border-l-green-500'
    case 'tool_use':
      return 'text-amber-400 border-l-amber-500'
    case 'tool_result':
      return 'text-gray-400 border-l-gray-500'
    case 'system':
      return 'text-purple-400 border-l-purple-500'
    default:
      return 'text-text-muted border-l-border'
  }
}

/**
 * Returns a human-readable label for the entry type
 */
function getEntryTypeLabel(type: SessionLogEntry['type']): string {
  switch (type) {
    case 'assistant':
      return 'Assistant'
    case 'user':
      return 'User'
    case 'tool_use':
      return 'Tool Call'
    case 'tool_result':
      return 'Tool Result'
    case 'system':
      return 'System'
    default:
      return type
  }
}

/**
 * Formats timestamp for display
 */
function formatTimestamp(timestamp?: string): string {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

function LogEntryItem({ entry }: { entry: SessionLogEntry }) {
  const styles = getEntryTypeStyles(entry.type, entry.is_error)
  const label = getEntryTypeLabel(entry.type)

  // Determine content to display
  let content = entry.content || ''
  if (entry.type === 'tool_use' && entry.tool_name) {
    content = `${entry.tool_name}(${entry.tool_input ? JSON.stringify(entry.tool_input, null, 2) : ''})`
  } else if (entry.type === 'tool_result' && entry.tool_result) {
    content = entry.tool_result
  }

  return (
    <div className={cn('border-l-2 pl-3 py-2', styles)}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs font-medium uppercase">{label}</span>
        {entry.tool_name && entry.type === 'tool_use' && (
          <span className="text-xs bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded">
            {entry.tool_name}
          </span>
        )}
        {entry.timestamp && (
          <span className="text-xs text-text-muted ml-auto">
            {formatTimestamp(entry.timestamp)}
          </span>
        )}
      </div>
      {content && (
        <pre className="text-sm font-mono whitespace-pre-wrap break-words text-text-primary/90">
          {content}
        </pre>
      )}
    </div>
  )
}

export function SessionLogModal({ sessionId, open, onClose }: SessionLogModalProps) {
  const { data: logEntries, isLoading } = useSessionLog(open ? sessionId : null)

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Session Log: {sessionId}</DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 h-[60vh]">
          <div className="space-y-2 p-4 bg-bg-primary rounded">
            {isLoading && (
              <div className="text-center text-text-muted py-8">
                Loading log entries...
              </div>
            )}

            {!isLoading && (!logEntries || logEntries.length === 0) && (
              <div className="text-center text-text-muted py-8">
                No log entries found
              </div>
            )}

            {logEntries?.map((entry, index) => (
              <LogEntryItem key={index} entry={entry} />
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
