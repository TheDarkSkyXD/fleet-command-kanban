import { useState, useEffect, useRef, useCallback, useMemo, type KeyboardEvent } from 'react'
import { Send, Loader2, AlertCircle, Bot, Brain } from 'lucide-react'
import { renderMarkdown } from '@/lib/markdown'
import { api } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn, timeAgo, formatToolActivity } from '@/lib/utils'
import { Linkify } from '@/components/ui/linkify'
import { useSessionOutput, useBrainstormMessage, useSessionEnded } from '@/hooks/useSSE'
import type { BrainstormMessage } from '@fleet-command/shared'

interface AssistantChatProps {
  projectId: string
  assistantId: string
  conversationId: string
  agentName?: string
  sessionStarted?: boolean
}

export function AssistantChat({
  projectId,
  assistantId,
  conversationId,
  agentName = 'Assistant',
  sessionStarted = false
}: AssistantChatProps) {
  const [messages, setMessages] = useState<BrainstormMessage[]>([])
  const [input, setInput] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isWaitingForResponse, setIsWaitingForResponse] = useState(sessionStarted)
  const [isLoadingHistory, setIsLoadingHistory] = useState(true)
  const [currentActivity, setCurrentActivity] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isAtBottomRef = useRef(true)
  const scrollAreaRef = useRef<HTMLDivElement>(null)

  // Subscribe to session output for streaming activity
  useSessionOutput(useCallback((data: { brainstormId?: string; event?: { type?: string; message?: { content?: Array<{ type?: string; name?: string; input?: Record<string, unknown>; text?: string }> } } }) => {
    if (data.brainstormId !== assistantId) return

    const event = data.event
    if (!event) return

    // Handle assistant message with tool use — show descriptive activity
    if (event.type === 'assistant' && event.message?.content) {
      for (const block of event.message.content) {
        if (block.type === 'tool_use' && block.name) {
          const activity = formatToolActivity(block.name, block.input as Record<string, unknown>)
          setCurrentActivity(activity)
        }
        // Don't clear activity on intermediate text blocks — keep showing
        // the last tool activity until the final response arrives via SSE
      }
    }
  }, [assistantId]))

  // Subscribe to brainstorm messages via SSE (assistant reuses brainstorm events)
  useBrainstormMessage(useCallback((data: { brainstormId?: string; message?: { type?: string; text?: string; timestamp?: string; conversationId?: string; options?: string[] } }) => {
    if (data.brainstormId !== assistantId) return

    const msg = data.message
    if (!msg || !msg.type || !msg.text) return

    const messageType = msg.type as 'notification' | 'user' | 'question'
    const text = msg.text
    const timestamp = msg.timestamp
    const conversationId = msg.conversationId
    const options = msg.options

    setMessages((prev) => {
      if (conversationId) {
        const alreadyExists = prev.some(m => m.conversationId === conversationId)
        if (alreadyExists) return prev
      }

      if (messageType === 'question' || messageType === 'notification') {
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
  }, [assistantId]))

  // Subscribe to session ended events
  useSessionEnded(useCallback((data: { brainstormId?: string; exitCode?: number; status?: string }) => {
    if (data.brainstormId !== assistantId) return

    setCurrentActivity(null)
    setIsWaitingForResponse(false)

    if (data.status === 'failed') {
      setMessages(prev => [...prev, {
        type: 'error',
        text: 'Session encountered an error. Please try again.'
      }])
    }

    // Safety net: reload messages from API when session ends.
    // This catches cases where the SSE brainstorm:message event was missed
    // (e.g., reconnection, timing issues) so the user always sees the reply.
    api.getAssistantMessages(projectId, conversationId).then((response) => {
      const freshMessages: BrainstormMessage[] = response.messages.map(msg => ({
        type: msg.type,
        text: msg.text,
        conversationId: msg.conversationId,
        options: msg.options || undefined,
        timestamp: msg.timestamp,
        askedAt: msg.type === 'question' ? msg.timestamp : undefined,
        sentAt: msg.type === 'user' ? msg.timestamp : undefined,
      }))
      setMessages(freshMessages)
    }).catch(() => {
      // Ignore - SSE messages are the primary path
    })
  }, [assistantId, projectId, conversationId]))

  // Reset state when conversationId changes (thread switch or project switch)
  useEffect(() => {
    setMessages([])
    setIsLoadingHistory(true)
    setIsWaitingForResponse(false)
    setCurrentActivity(null)
  }, [conversationId])

  // Load message history on mount and when assistantId changes
  useEffect(() => {
    let cancelled = false

    const loadHistory = async () => {
      try {
        const response = await api.getAssistantMessages(projectId, conversationId)
        if (cancelled) return

        const historyMessages: BrainstormMessage[] = response.messages.map(msg => ({
          type: msg.type,
          text: msg.text,
          conversationId: msg.conversationId,
          options: msg.options || undefined,
          timestamp: msg.timestamp,
          askedAt: msg.type === 'question' ? msg.timestamp : undefined,
          sentAt: msg.type === 'user' ? msg.timestamp : undefined,
        }))

        setMessages(historyMessages)
      } catch (error) {
        console.error('Failed to load assistant message history:', error)
      } finally {
        if (!cancelled) {
          setIsLoadingHistory(false)
        }
      }
    }

    loadHistory()
    return () => { cancelled = true }
  }, [projectId, conversationId])

  // Scroll to bottom when messages change
  useEffect(() => {
    if (isAtBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  // Track scroll position
  useEffect(() => {
    const scrollArea = scrollAreaRef.current
    if (!scrollArea) return

    const viewport = scrollArea.querySelector('[data-radix-scroll-area-viewport]')
    if (!viewport) return

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = viewport
      const atBottom = scrollHeight - scrollTop - clientHeight < 50
      isAtBottomRef.current = atBottom
    }

    viewport.addEventListener('scroll', handleScroll)
    return () => viewport.removeEventListener('scroll', handleScroll)
  }, [])

  const pendingOptions = useMemo(() => {
    if (!messages.length) return []
    const lastMessage = messages[messages.length - 1]
    if (lastMessage.type === 'question' && Array.isArray(lastMessage.options)) {
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
      await api.sendAssistantMessage(projectId, messageText, conversationId)
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
  }, [projectId, conversationId, isSubmitting])

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      handleSend(input)
    }
  }

  const handleOptionClick = (option: string) => {
    handleSend(option)
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Messages area */}
      <ScrollArea ref={scrollAreaRef} className="flex-1 min-h-0 px-4">
        <div className="space-y-4 py-4">
          {isLoadingHistory && (
            <div className="text-center py-8 text-text-muted text-sm flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading conversation...
            </div>
          )}
          {messages.map((message, index) => (
            <MessageBubble key={index} message={message} agentName={agentName} />
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
              className="text-xs whitespace-normal h-auto min-h-8 text-left shrink"
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
            placeholder="Ask about this project..."
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
          Press Ctrl+Enter to send, Shift+Enter for new line
        </p>
      </div>
    </div>
  )
}

interface MessageBubbleProps {
  message: BrainstormMessage
  agentName?: string
}

function MessageBubble({ message, agentName = 'Assistant' }: MessageBubbleProps) {
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
  }, [message.text, isQuestion, isNotification])

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
          (isQuestion || isNotification) && 'bg-bg-tertiary/50 rounded-bl-sm',
          isError && 'bg-destructive/10 border border-destructive/20 text-destructive'
        )}
      >
        {(isQuestion || isNotification) && (
          <div className="flex items-center gap-2 mb-2 text-white">
            <Bot className="h-4 w-4" />
            <span className="text-sm font-medium">{agentName}</span>
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
            className="prose prose-sm prose-invert max-w-none text-white break-words
              [&_p]:my-2 [&_ul]:my-2 [&_ol]:my-2 [&_li]:my-0
              [&_a]:text-accent [&_a]:no-underline hover:[&_a]:underline
              [&_code]:bg-bg-tertiary [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded
              [&_pre]:bg-bg-tertiary [&_pre]:p-3 [&_pre]:rounded [&_pre]:overflow-x-auto
              [&_h1]:text-lg [&_h1]:text-white [&_h1]:mt-4 [&_h1]:mb-2
              [&_h2]:text-base [&_h2]:text-white [&_h2]:mt-4 [&_h2]:mb-2
              [&_h3]:text-sm [&_h3]:text-white [&_h3]:mt-3 [&_h3]:mb-1
              [&_blockquote]:border-l-2 [&_blockquote]:border-accent [&_blockquote]:pl-4 [&_blockquote]:italic
              [&_table]:w-full [&_th]:text-left [&_th]:p-2 [&_th]:border-b [&_th]:border-border
              [&_td]:p-2 [&_td]:border-b [&_td]:border-border"
            dangerouslySetInnerHTML={{ __html: renderedContent }}
          />
        ) : (
          <p className="text-sm whitespace-pre-wrap break-words text-white">
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
        <div className="flex items-center gap-2 text-white">
          <Brain className="h-3 w-3 animate-pulse" />
          <span className="text-xs font-medium">
            {activity || 'Thinking'}
          </span>
        </div>
      </div>
    </div>
  )
}
