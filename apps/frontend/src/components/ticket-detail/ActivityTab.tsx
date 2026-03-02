import { useState, useEffect, useRef, useCallback, useMemo, type KeyboardEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Send, Loader2, AlertCircle, Bell, Paperclip, Bot, Brain } from 'lucide-react'
import { renderMarkdown } from '@/lib/markdown'
import { api } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn, timeAgo, formatToolActivity } from '@/lib/utils'
import { Linkify } from '@/components/ui/linkify'
import { ArtifactViewerFull } from './ArtifactViewerFull'
import { TaskList } from './TaskList'
import { RestartPhaseButton } from './RestartPhaseButton'
import type { Artifact, TicketHistoryEntry } from '@potato-cannon/shared'
import { useSessionOutput, useTicketMessage, useSessionEnded } from '@/hooks/useSSE'

interface ActivityTabProps {
  projectId: string
  ticketId: string
  currentPhase?: string
  history?: TicketHistoryEntry[]
  archived?: boolean
}

interface ChatMessage {
  type: 'question' | 'user' | 'notification' | 'error' | 'artifact'
  text: string
  conversationId?: string
  options?: string[]
  timestamp?: string
  artifact?: {
    filename: string
    description?: string
  }
}

export function ActivityTab({ projectId, ticketId, currentPhase: propPhase, history, archived }: ActivityTabProps) {
  const [input, setInput] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isWaitingForResponse, setIsWaitingForResponse] = useState(false)
  const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(null)
  const [currentActivity, setCurrentActivity] = useState<string | null>(null)
  const [currentPhase, setCurrentPhase] = useState<string | null>(null)

  const queryClient = useQueryClient()

  // Fetch messages using react-query
  const { data: messages = [], isLoading: isLoadingHistory } = useQuery({
    queryKey: ['ticket-messages', projectId, ticketId],
    queryFn: async () => {
      const response = await api.getTicketMessages(projectId, ticketId)
      return response.messages.map(msg => ({
        type: msg.type,
        text: msg.text,
        conversationId: msg.conversationId,
        options: msg.options,
        timestamp: msg.timestamp,
        artifact: msg.artifact
      })) as ChatMessage[]
    },
  })

  // Derive pending options from last message
  const pendingOptions = useMemo(() => {
    if (!messages.length) return []
    const lastMessage = messages[messages.length - 1]
    if (lastMessage.type === 'question' && lastMessage.options) {
      return lastMessage.options
    }
    return []
  }, [messages])

  // Subscribe to session output for streaming activity
  useSessionOutput(useCallback((data: { ticketId?: string; event?: { type?: string; message?: { content?: Array<{ type?: string; name?: string; input?: Record<string, unknown>; text?: string }> } } }) => {
    // Only process events for this ticket
    if (data.ticketId !== ticketId) return

    const event = data.event
    if (!event) return

    // Handle assistant message with tool use or text
    if (event.type === 'assistant' && event.message?.content) {
      for (const block of event.message.content) {
        if (block.type === 'tool_use' && block.name) {
          const activity = formatToolActivity(block.name, block.input as Record<string, unknown>)
          setCurrentActivity(activity)
        } else if (block.type === 'text' && block.text) {
          // When we get text output, clear activity (response is coming)
          setCurrentActivity(null)
        }
      }
    }
  }, [ticketId]))

  // Subscribe to ticket messages via SSE - refetch on new messages
  useTicketMessage(useCallback((data: { ticketId?: string; message?: { type?: string } }) => {
    // Only process messages for this ticket
    if (data.ticketId !== ticketId) return

    // Clear activity when we receive a new message from Claude
    setCurrentActivity(null)

    // Refetch messages to get the new one
    queryClient.refetchQueries({ queryKey: ['ticket-messages', projectId, ticketId] })

    // Clear waiting state if we received a question or notification
    if (data.message?.type === 'question' || data.message?.type === 'notification' || data.message?.type === 'artifact') {
      setIsWaitingForResponse(false)
    }
  }, [ticketId, queryClient, projectId]))

  // Subscribe to session ended events to clear activity
  useSessionEnded(useCallback((data: { ticketId?: string }) => {
    // Only process events for this ticket
    if (data.ticketId !== ticketId) return

    // Clear activity when session ends
    setCurrentActivity(null)
  }, [ticketId]))

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isAtBottomRef = useRef(true)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // Scroll to bottom when messages change, but only if user was already at bottom
  useEffect(() => {
    if (isAtBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  // Track scroll position to determine if user is at bottom
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container
      // Consider "at bottom" if within 50px of the bottom
      const atBottom = scrollHeight - scrollTop - clientHeight < 50
      isAtBottomRef.current = atBottom
    }

    container.addEventListener('scroll', handleScroll)
    return () => container.removeEventListener('scroll', handleScroll)
  }, [])

  // Fetch ticket to get current phase for task list (only if not provided via props)
  useEffect(() => {
    // If phase is provided via props, use it
    if (propPhase) {
      setCurrentPhase(propPhase)
      return
    }

    // Otherwise fetch it
    let active = true

    const fetchTicket = async () => {
      try {
        const ticket = await api.getTicket(projectId, ticketId)
        if (active) {
          setCurrentPhase(ticket.phase)
        }
      } catch {
        // Ignore errors - phase will stay null and TaskList won't render
      }
    }

    fetchTicket()

    return () => {
      active = false
    }
  }, [projectId, ticketId, propPhase])

  const handleSend = useCallback(async (text: string) => {
    if (!text.trim() || isSubmitting) return

    const messageText = text.trim()
    setInput('')
    setIsSubmitting(true)

    // Optimistically add user message
    const optimisticMessage: ChatMessage = {
      type: 'user',
      text: messageText,
      timestamp: new Date().toISOString()
    }
    queryClient.setQueryData<ChatMessage[]>(
      ['ticket-messages', projectId, ticketId],
      (old) => [...(old || []), optimisticMessage]
    )

    try {
      await api.sendTicketInput(projectId, ticketId, messageText)
      setIsWaitingForResponse(true)
    } catch (error) {
      // Add error message
      const errorMessage: ChatMessage = {
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to send message'
      }
      queryClient.setQueryData<ChatMessage[]>(
        ['ticket-messages', projectId, ticketId],
        (old) => [...(old || []), errorMessage]
      )
    } finally {
      setIsSubmitting(false)
      textareaRef.current?.focus()
    }
  }, [projectId, ticketId, isSubmitting, queryClient])

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend(input)
    }
  }

  const handleOptionClick = (option: string) => {
    handleSend(option)
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 px-4 pb-0">
      {/* Section Label */}
      <div className="px-3 pb-2 shrink-0 flex items-center justify-between">
        <h3 className="text-xs font-medium text-text-muted uppercase tracking-wide">Conversation</h3>
            {currentPhase && history && (
              <RestartPhaseButton
                projectId={projectId}
                ticketId={ticketId}
                currentPhase={currentPhase}
                history={history}
                disabled={archived}
              />
            )}
      </div>
 

      {/* Chat Section */}
      <div className="flex-1 flex flex-col min-h-0 rounded-lg border border-border bg-bg-tertiary overflow-hidden mb-3">
        {/* Messages area */}
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto min-h-0">
          <div className="space-y-4 py-4 px-4">
            {isLoadingHistory && (
              <div className="text-center py-8 text-text-muted text-sm flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading conversation...
              </div>
            )}
            {!isLoadingHistory && messages.length === 0 && !isWaitingForResponse && (
              <div className="text-center py-8 text-text-muted text-sm">
                No messages yet
              </div>
            )}

            {messages.map((message, index) => (
              <MessageBubble
                key={index}
                message={message}
                onArtifactClick={(filename, description) => {
                  setSelectedArtifact({
                    filename,
                    type: 'other',
                    description,
                    versionCount: 1
                  })
                }}
              />
            ))}

            {(isWaitingForResponse || currentActivity) && <ThinkingIndicator activity={currentActivity} />}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Option buttons */}
        {pendingOptions.length > 0 && (
          <div className="pb-2 px-7 flex flex-wrap gap-2 shrink-0">
            {pendingOptions.map((option, index) => (
              <Button
                key={index}
                variant="outline"
                size="sm"
                onClick={() => handleOptionClick(option)}
                className="text-xs"
              >
                {option}
              </Button>
            ))}
          </div>
        )}

        {/* Input area */}
        <div className="py-3 border-t border-border shrink-0">
          <div className="flex gap-2 px-4">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your response..."
              className="min-h-[44px] max-h-[120px] resize-none"
              disabled={isSubmitting}
            />
            <Button
              onClick={() => handleSend(input)}
              disabled={!input.trim() || isSubmitting}
              size="icon"
              className="shrink-0 self-end"
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="text-xs text-text-muted mt-2 px-4">
            Press Enter to send, Shift+Enter for new line
          </p>
        </div>
      </div>

      {/* Task List - only renders when tasks exist */}
      {currentPhase && (
        <TaskList
          projectId={projectId}
          ticketId={ticketId}
          currentPhase={currentPhase}
        />
      )}

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

interface MessageBubbleProps {
  message: ChatMessage
  onArtifactClick?: (filename: string, description?: string) => void
}

function MessageBubble({ message, onArtifactClick }: MessageBubbleProps) {
  const isUser = message.type === 'user'
  const isError = message.type === 'error'
  const isNotification = message.type === 'notification'
  const isArtifact = message.type === 'artifact'
  const isQuestion = message.type === 'question'

  const renderedContent = useMemo(() => {
    if (!isQuestion || !message.text) return null
    try {
      return renderMarkdown(message.text)
    } catch {
      return null
    }
  }, [message.text, isQuestion])

  // Artifact messages render as a special clickable card
  if (isArtifact && message.artifact) {
    return (
      <div className="flex justify-start">
        <button
          type="button"
          onClick={() => onArtifactClick?.(message.artifact!.filename, message.artifact!.description)}
          className="max-w-[85%] rounded-lg border border-accent/30 bg-accent/5 px-4 py-3 rounded-bl-sm text-left transition-colors hover:border-accent hover:bg-accent/10 cursor-pointer"
        >
          <div className="flex items-center gap-2 mb-1 text-accent">
            <Paperclip className="h-3 w-3" />
            <span className="text-xs font-medium">Artifact</span>
          </div>
          <p className="text-sm font-medium text-text-primary">{message.artifact.filename}</p>
          {message.artifact.description && (
            <p className="text-xs text-text-muted mt-1">{message.artifact.description}</p>
          )}
          {message.timestamp && (
            <p className="text-xs opacity-60 mt-1">
              {timeAgo(message.timestamp)}
            </p>
          )}
        </button>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'flex',
        isUser ? 'justify-end' : 'justify-start'
      )}
    >
      <div
        className={cn(
          'max-w-[85%] rounded-lg px-4 py-3 leading-normal',
          isUser && 'bg-accent/50 text-accent-foreground rounded-br-sm',
          isQuestion && 'bg-accent-purple/10 rounded-bl-sm',
          isNotification && 'bg-bg-secondary border border-border rounded-bl-sm',
          isError && 'bg-destructive/10 border border-destructive/20 text-destructive'
        )}
      >
        {isQuestion && (
          <div className="flex items-center gap-2 mb-2 text-text-muted">
            <Bot className="h-3 w-3" />
            <span className="text-xs font-medium">Potato</span>
          </div>
        )}
        {isNotification && (
          <div className="flex items-center gap-2 mb-1 text-text-muted">
            <Bell className="h-3 w-3" />
            <span className="text-xs font-medium">Status Update</span>
          </div>
        )}
        {isError && (
          <div className="flex items-center gap-2 mb-1">
            <AlertCircle className="h-4 w-4" />
            <span className="text-xs font-medium">Error</span>
          </div>
        )}
        {isQuestion && renderedContent ? (
          <div
            className="prose prose-sm prose-invert max-w-none text-text-secondary break-words
              [&_p]:my-2 [&_ul]:my-2 [&_ol]:my-2 [&_li]:my-0
              [&_a]:text-accent [&_a]:no-underline hover:[&_a]:underline
              [&_code]:bg-bg-tertiary [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded
              [&_pre]:bg-bg-tertiary [&_pre]:p-3 [&_pre]:rounded [&_pre]:overflow-x-auto
              [&_h1]:text-lg [&_h1]:text-text-primary [&_h1]:mt-4 [&_h1]:mb-2
              [&_h2]:text-base [&_h2]:text-text-primary [&_h2]:mt-4 [&_h2]:mb-2
              [&_h3]:text-sm [&_h3]:text-text-primary [&_h3]:mt-3 [&_h3]:mb-1
              [&_blockquote]:border-l-2 [&_blockquote]:border-accent [&_blockquote]:pl-4 [&_blockquote]:italic
              [&_table]:w-full [&_th]:text-left [&_th]:p-2 [&_th]:border-b [&_th]:border-border
              [&_td]:p-2 [&_td]:border-b [&_td]:border-border"
            dangerouslySetInnerHTML={{ __html: renderedContent }}
          />
        ) : (
          <p className="text-sm whitespace-pre-wrap break-words">
            <Linkify text={message.text || ''} />
          </p>
        )}
        {message.timestamp && (
          <p className="text-xs opacity-60 mt-1">
            {timeAgo(message.timestamp)}
          </p>
        )}
      </div>
    </div>
  )
}

function ThinkingIndicator({ activity }: { activity?: string | null }) {
  return (
    <div className="flex justify-start">
      <div className="thinking-shimmer bg-accent-purple/10 rounded-lg rounded-bl-sm px-4 py-3 max-w-[85%]">
        <div className="flex items-center gap-2 text-text-muted">
          <Brain className="h-3 w-3 animate-pulse" />
          <span className="text-xs font-medium">
            {activity || 'Thinking'}
          </span>
        </div>
      </div>
    </div>
  )
}
