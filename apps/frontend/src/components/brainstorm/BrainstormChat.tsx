import { useState, useEffect, useRef, useCallback, useMemo, type KeyboardEvent } from 'react'
import { ArrowLeft, Send, Loader2, AlertCircle, Trash2, Bot, Brain } from 'lucide-react'
import { renderMarkdown } from '@/lib/markdown'
import { api } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { cn, timeAgo, formatToolActivity } from '@/lib/utils'
import { Linkify } from '@/components/ui/linkify'
import { useSessionOutput, useBrainstormMessage, useSessionEnded } from '@/hooks/useSSE'
import type { BrainstormMessage } from '@potato-cannon/shared'

interface BrainstormChatProps {
  projectId: string
  brainstormId: string
  brainstormName: string
  initialMessage?: string
  onBack?: () => void
  onDelete?: () => void
}

export function BrainstormChat({
  projectId,
  brainstormId,
  brainstormName,
  initialMessage,
  onBack,
  onDelete
}: BrainstormChatProps) {
  const [messages, setMessages] = useState<BrainstormMessage[]>([])
  const [input, setInput] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isWaitingForResponse, setIsWaitingForResponse] = useState(!!initialMessage)
  const [isLoadingHistory, setIsLoadingHistory] = useState(true)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [currentActivity, setCurrentActivity] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isAtBottomRef = useRef(true)
  const scrollAreaRef = useRef<HTMLDivElement>(null)

  // Subscribe to session output for streaming activity
  useSessionOutput(useCallback((data: { brainstormId?: string; event?: { type?: string; message?: { content?: Array<{ type?: string; name?: string; input?: Record<string, unknown>; text?: string }> } } }) => {
    // Only process events for this brainstorm
    if (data.brainstormId !== brainstormId) return

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
  }, [brainstormId]))

  // Subscribe to brainstorm messages (notifications, user messages, and questions) via SSE
  useBrainstormMessage(useCallback((data: { brainstormId?: string; message?: { type?: string; text?: string; timestamp?: string; conversationId?: string; options?: string[] } }) => {
    // Only process messages for this brainstorm
    if (data.brainstormId !== brainstormId) return

    const msg = data.message
    if (!msg || !msg.type || !msg.text) return

    // Extract values for type narrowing in callback
    const messageType = msg.type as 'notification' | 'user' | 'question'
    const text = msg.text
    const timestamp = msg.timestamp
    const conversationId = msg.conversationId
    const options = msg.options

    // Check if message already exists (by conversationId for questions, or text+timestamp for others)
    setMessages((prev) => {
      if (conversationId) {
        const alreadyExists = prev.some(m => m.conversationId === conversationId)
        if (alreadyExists) return prev
      }

      // Clear waiting state when we receive a question
      if (messageType === 'question') {
        setIsWaitingForResponse(false)
        setCurrentActivity(null)
      }

      return [
        ...prev,
        {
          type: messageType,
          text,
          conversationId,
          options,
          timestamp,
          askedAt: messageType === 'question' ? timestamp : undefined,
          sentAt: messageType === 'user' ? timestamp : undefined
        }
      ]
    })
  }, [brainstormId]))

  // Subscribe to session ended events for error recovery only
  useSessionEnded(useCallback((data: { brainstormId?: string; exitCode?: number; status?: string }) => {
    if (data.brainstormId !== brainstormId) return

    // Clear activity indicator — session is no longer running
    setCurrentActivity(null)

    // Only show error for actual failures, not normal exits
    // Normal exit (code 0) happens when session asks a question and exits
    if (data.status === 'failed') {
      setIsWaitingForResponse(false)
      setMessages(prev => [...prev, {
        type: 'error',
        text: 'Session encountered an error. Please try again.'
      }])
    }
  }, [brainstormId]))

  // Clear activity when we receive a new question
  useEffect(() => {
    if (!isWaitingForResponse) {
      setCurrentActivity(null)
    }
  }, [isWaitingForResponse])

  // Load message history on mount
  useEffect(() => {
    let cancelled = false

    const loadHistory = async () => {
      try {
        const response = await api.getBrainstormMessages(projectId, brainstormId)
        if (cancelled) return

        // Map stored messages to display format
        // Note: Initial message is persisted by backend, no need to add it here
        const historyMessages: BrainstormMessage[] = response.messages.map(msg => ({
          type: msg.type,
          text: msg.text,
          conversationId: msg.conversationId,
          options: msg.options || undefined,
          askedAt: msg.type === 'question' ? msg.timestamp : undefined,
          sentAt: msg.type === 'user' ? msg.timestamp : undefined,
          timestamp: msg.type === 'notification' ? msg.timestamp : undefined
        }))

        setMessages(historyMessages)

      } catch (error) {
        console.error('Failed to load message history:', error)
        // If loading fails, still show initial message if present
        if (initialMessage && !cancelled) {
          setMessages([{
            type: 'user',
            text: initialMessage,
            sentAt: new Date().toISOString()
          }])
        }
      } finally {
        if (!cancelled) {
          setIsLoadingHistory(false)
        }
      }
    }

    loadHistory()

    return () => {
      cancelled = true
    }
  }, [projectId, brainstormId, initialMessage])

  // Scroll to bottom when messages change, but only if user was already at bottom
  useEffect(() => {
    if (isAtBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  // Track scroll position to determine if user is at bottom
  useEffect(() => {
    const scrollArea = scrollAreaRef.current
    if (!scrollArea) return

    // Radix ScrollArea uses a viewport element inside
    const viewport = scrollArea.querySelector('[data-radix-scroll-area-viewport]')
    if (!viewport) return

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = viewport
      // Consider "at bottom" if within 50px of the bottom
      const atBottom = scrollHeight - scrollTop - clientHeight < 50
      isAtBottomRef.current = atBottom
    }

    viewport.addEventListener('scroll', handleScroll)
    return () => viewport.removeEventListener('scroll', handleScroll)
  }, [])


  // Derive pending options from the last message
  const pendingOptions = useMemo(() => {
    if (!messages.length) return []
    const lastMessage = messages[messages.length - 1]
    if (lastMessage.type === 'question' && lastMessage.options) {
      return lastMessage.options
    }
    return []
  }, [messages])

  const handleSend = useCallback(async (text: string) => {
    if (!text.trim() || isSubmitting) return

    const messageText = text.trim()
    setInput('')
    setIsSubmitting(true)

    // Add user message immediately
    setMessages((prev) => [
      ...prev,
      {
        type: 'user',
        text: messageText,
        sentAt: new Date().toISOString()
      }
    ])

    try {
      await api.sendBrainstormInput(projectId, brainstormId, messageText)
      setIsWaitingForResponse(true)
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          type: 'error',
          text: error instanceof Error ? error.message : 'Failed to send message'
        }
      ])
    } finally {
      setIsSubmitting(false)
      textareaRef.current?.focus()
    }
  }, [projectId, brainstormId, isSubmitting])

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend(input)
    }
  }

  const handleOptionClick = (option: string) => {
    handleSend(option)
  }

  const handleDelete = useCallback(async () => {
    setIsDeleting(true)
    try {
      await api.deleteBrainstorm(projectId, brainstormId)
      setShowDeleteConfirm(false)
      onDelete?.()
    } catch (error) {
      console.error('Failed to delete brainstorm:', error)
    } finally {
      setIsDeleting(false)
    }
  }, [projectId, brainstormId, onDelete])

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          {onBack && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onBack}
              className="shrink-0 brainstorm-back-button"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <h3 className="text-text-secondary font-semibold text-[13px] truncate">
            {brainstormName}
          </h3>
        </div>
        <div className="flex items-center gap-2">
          {onDelete && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="p-1 rounded text-text-muted transition-colors hover:text-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Delete Session</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      {/* Messages area */}
      <ScrollArea ref={scrollAreaRef} className="flex-1 min-h-0 px-4">
        <div className="space-y-4 py-4">
          {isLoadingHistory && (
            <div className="text-center py-8 text-text-muted text-sm flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading conversation...
            </div>
          )}
          {!isLoadingHistory && messages.length === 0 && (
            <div className="text-center py-8 text-text-muted text-sm">
              Starting conversation...
            </div>
          )}

          {messages.map((message, index) => (
            <MessageBubble key={index} message={message} />
          ))}

          {(isWaitingForResponse || currentActivity) && <ThinkingIndicator activity={currentActivity} />}

          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Option buttons */}
      {pendingOptions.length > 0 && (
        <div className="px-4 pb-2 flex flex-wrap gap-2">
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
      <div className="p-3 border-t border-border">
        <div className="flex gap-2">
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
        <p className="text-xs text-text-muted mt-2">
          Press Enter to send, Shift+Enter for new line
        </p>
      </div>

      {/* Delete confirmation dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="bg-bg-secondary border-border" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle className="text-text-primary">Delete Brainstorm Session</DialogTitle>
            <DialogDescription className="text-text-secondary">
              Are you sure you want to delete "{brainstormName}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteConfirm(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

interface MessageBubbleProps {
  message: BrainstormMessage
}

function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.type === 'user'
  const isError = message.type === 'error'
  const isQuestion = message.type === 'question'
  const isNotification = message.type === 'notification'

  const renderedContent = useMemo(() => {
    if ((!isQuestion && !isNotification) || !message.text) return null
    try {
      return renderMarkdown(message.text)
    } catch {
      return null
    }
  }, [message.text, isQuestion])

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
          isNotification && 'bg-bg-tertiary/50 rounded-bl-sm',
          isError && 'bg-destructive/10 border border-destructive/20 text-destructive'
        )}
      >
        {(isQuestion || isNotification) && (
          <div className="flex items-center gap-2 mb-2 text-text-muted">
            <Bot className="h-3 w-3" />
            <span className="text-xs font-medium">Potato</span>
          </div>
        )}
        {isError && (
          <div className="flex items-center gap-2 mb-1">
            <AlertCircle className="h-4 w-4" />
            <span className="text-xs font-medium">Error</span>
          </div>
        )}
        {(isQuestion || isNotification) && renderedContent ? (
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
        {(message.askedAt || message.sentAt || message.timestamp) && (
          <p className="text-xs opacity-60 mt-1">
            {timeAgo(message.askedAt || message.sentAt || message.timestamp)}
          </p>
        )}
      </div>
    </div>
  )
}

function ThinkingIndicator({ activity }: { activity?: string | null }) {
  return (
    <div className="flex justify-start">
      <div className="thinking-shimmer bg-bg-tertiary rounded-lg rounded-bl-sm px-4 py-3 max-w-[85%]">
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
