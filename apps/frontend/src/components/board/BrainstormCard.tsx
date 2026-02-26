import { useState, useCallback } from 'react'
import { MessageSquare, Clock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { ListItemCard } from '@/components/ui/list-item-card'
import { cn, timeAgo } from '@/lib/utils'
import { useBrainstormMessage } from '@/hooks/useSSE'
import { useAppStore } from '@/stores/appStore'
import type { Brainstorm } from '@potato-cannon/shared'

interface BrainstormCardProps {
  brainstorm: Brainstorm
  projectId: string
}

function getSeenKey(projectId: string, brainstormId: string) {
  return `brainstorm-seen-${projectId}-${brainstormId}`
}

export function BrainstormCard({ brainstorm, projectId }: BrainstormCardProps) {
  const openBrainstormSheet = useAppStore((s) => s.openBrainstormSheet)
  const brainstormSheetBrainstormId = useAppStore((s) => s.brainstormSheetBrainstormId)

  const [pendingConversationId, setPendingConversationId] = useState<string | null>(null)
  const [lastSeenId, setLastSeenId] = useState<string | null>(() => {
    return localStorage.getItem(getSeenKey(projectId, brainstorm.id))
  })

  // Subscribe to brainstorm messages for real-time pending status
  useBrainstormMessage(useCallback((data: { brainstormId?: string; message?: { type?: string; conversationId?: string } }) => {
    if (data.brainstormId !== brainstorm.id) return

    const msg = data.message
    if (!msg) return

    if (msg.type === 'question' && msg.conversationId) {
      setPendingConversationId(msg.conversationId)
    } else if (msg.type === 'user') {
      setPendingConversationId(null)
    }
  }, [brainstorm.id]))

  const handleClick = useCallback(() => {
    if (pendingConversationId && pendingConversationId !== lastSeenId) {
      localStorage.setItem(getSeenKey(projectId, brainstorm.id), pendingConversationId)
      setLastSeenId(pendingConversationId)
    }
    openBrainstormSheet(projectId, brainstorm.id, brainstorm.name)
  }, [projectId, brainstorm.id, brainstorm.name, pendingConversationId, lastSeenId, openBrainstormSheet])

  const hasUnseenQuestion = pendingConversationId !== null && pendingConversationId !== lastSeenId
  const isThinking = brainstorm.status === 'active' && brainstorm.hasActiveSession && pendingConversationId === null
  const isSelected = brainstormSheetBrainstormId === brainstorm.id

  return (
    <ListItemCard asChild isSelected={isSelected} className={cn(isThinking && 'thinking-shimmer')}>
      <button onClick={handleClick} className="w-full text-left overflow-hidden">
        <div className="flex items-start gap-3">
          <div className="shrink-0 mt-0.5">
            <MessageSquare className="h-4 w-4 text-text-muted" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 min-w-0">
              <span className="text-text-primary text-sm font-medium line-clamp-2 flex-1 min-w-0">
                {brainstorm.name}
              </span>
              <StatusIndicator
                status={brainstorm.status}
                hasUnseenQuestion={hasUnseenQuestion}
              />
            </div>
            <span className="flex items-center gap-1 text-xs text-text-muted">
              <Clock className="h-3 w-3" />
              {timeAgo(brainstorm.updatedAt)}
            </span>
          </div>
        </div>
      </button>
    </ListItemCard>
  )
}

function StatusIndicator({
  status,
  hasUnseenQuestion
}: {
  status: Brainstorm['status']
  hasUnseenQuestion: boolean
}) {
  if (status === 'completed') {
    return (
      <Badge variant="secondary" className="shrink-0 text-xs">
        completed
      </Badge>
    )
  }

  if (hasUnseenQuestion) {
    return (
      <span className="shrink-0 flex items-center justify-center w-2 h-2 bg-accent rounded-full" />
    )
  }

  return null
}
