import { useState, useEffect, useCallback } from 'react'
import { MessageSquare, MessageSquarePlus, Loader2, Trash2 } from 'lucide-react'
import { api } from '@/api/client'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn, timeAgo } from '@/lib/utils'

interface Thread {
  id: string
  title: string
  messageCount: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

interface ConversationHistoryProps {
  projectId: string
  activeConversationId: string | null
  onSelect: (conversationId: string) => void
  onNewThread: () => void
  onDeleted: (deletedId: string, newActiveId: string | null) => void
}

export function ConversationHistory({
  projectId,
  activeConversationId,
  onSelect,
  onNewThread,
  onDeleted,
}: ConversationHistoryProps) {
  const [threads, setThreads] = useState<Thread[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    api.getAssistantThreads(projectId)
      .then((data) => {
        if (!cancelled) {
          setThreads(data.threads)
        }
      })
      .catch((err) => {
        console.error('Failed to load threads:', err)
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false)
        }
      })

    return () => { cancelled = true }
  }, [projectId])

  const handleDelete = useCallback(async (e: React.MouseEvent, threadId: string) => {
    e.stopPropagation()
    setDeletingId(threadId)

    try {
      const result = await api.deleteAssistantThread(projectId, threadId)
      setThreads(prev => prev.filter(t => t.id !== threadId))
      onDeleted(threadId, result.newActiveConversationId)
    } catch (err) {
      console.error('Failed to delete thread:', err)
    } finally {
      setDeletingId(null)
    }
  }, [projectId, onDeleted])

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-muted text-sm gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading conversations...
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* New conversation button */}
      <div className="px-4 pb-3">
        <Button
          variant="outline"
          className="w-full justify-start gap-2 text-sm"
          onClick={onNewThread}
        >
          <MessageSquarePlus className="h-4 w-4" />
          New Conversation
        </Button>
      </div>

      {/* Thread list */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="px-4 space-y-1 pb-4">
          {threads.length === 0 ? (
            <div className="text-center py-8 text-text-muted text-sm">
              No conversations yet.
            </div>
          ) : (
            threads.map((thread) => (
              <button
                key={thread.id}
                onClick={() => onSelect(thread.id)}
                className={cn(
                  'group w-full text-left px-3 py-2.5 rounded-lg transition-colors',
                  'hover:bg-bg-tertiary/50',
                  deletingId === thread.id && 'opacity-50 pointer-events-none',
                  thread.id === activeConversationId
                    ? 'bg-accent/10 border border-accent/20'
                    : 'border border-transparent'
                )}
              >
                <div className="flex items-start gap-2.5">
                  <MessageSquare className="h-4 w-4 text-text-muted shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">
                      {thread.title}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-text-muted">
                        {thread.messageCount} messages
                      </span>
                      <span className="text-xs text-text-muted">
                        {timeAgo(thread.updatedAt)}
                      </span>
                    </div>
                  </div>
                  {threads.length > 1 && (
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={(e) => handleDelete(e, thread.id)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleDelete(e as unknown as React.MouseEvent, thread.id) }}
                      className="shrink-0 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity text-text-muted hover:text-destructive hover:bg-destructive/10 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/50"
                    >
                      {deletingId === thread.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </div>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
