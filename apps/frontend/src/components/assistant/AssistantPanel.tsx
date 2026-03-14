import { useState, useEffect, useCallback, useRef } from 'react'
import { useLocation } from '@tanstack/react-router'
import { X, Bot, MessageSquarePlus, History } from 'lucide-react'
import { api } from '@/api/client'
import { useAppStore } from '@/stores/appStore'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { AssistantChat } from './AssistantChat'
import { ConversationHistory } from './ConversationHistory'

export function AssistantPanel() {
  const assistantPanelOpen = useAppStore((s) => s.assistantPanelOpen)
  const assistantPanelProjectId = useAppStore((s) => s.assistantPanelProjectId)
  const closeAssistantPanel = useAppStore((s) => s.closeAssistantPanel)
  const currentProjectId = useAppStore((s) => s.currentProjectId)

  const [assistantId, setBrainstormId] = useState<string | null>(null)
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const fetchedProjectRef = useRef<string | null>(null)

  // Only show panel on board view and when viewing the same project
  const location = useLocation()
  const isOnBoardView = !!location.pathname.match(/^\/projects\/[^/]+\/board/)
  const isCorrectProject = currentProjectId === assistantPanelProjectId

  const isOpen = assistantPanelOpen && isOnBoardView && isCorrectProject

  // Fetch or create assistant when panel opens
  useEffect(() => {
    if (!isOpen || !assistantPanelProjectId) {
      return
    }

    // Skip if we already fetched for this project
    if (fetchedProjectRef.current === assistantPanelProjectId && assistantId) {
      return
    }

    let cancelled = false
    setIsLoading(true)

    api.getAssistant(assistantPanelProjectId)
      .then((assistant) => {
        if (cancelled) return
        setBrainstormId(assistant.id)
        setActiveConversationId(assistant.conversationId || null)
        fetchedProjectRef.current = assistantPanelProjectId
        setIsLoading(false)
      })
      .catch((err) => {
        console.error('Failed to get/create assistant:', err)
        if (!cancelled) setIsLoading(false)
      })

    return () => { cancelled = true }
  }, [isOpen, assistantPanelProjectId, assistantId])

  // Reset state when project changes
  useEffect(() => {
    setBrainstormId(null)
    setActiveConversationId(null)
    setShowHistory(false)
    fetchedProjectRef.current = null
  }, [assistantPanelProjectId])

  const handleNewThread = useCallback(async () => {
    if (!assistantPanelProjectId) return

    try {
      const result = await api.createAssistantThread(assistantPanelProjectId)
      setActiveConversationId(result.conversationId)
      setShowHistory(false)
    } catch (err) {
      console.error('Failed to create new thread:', err)
    }
  }, [assistantPanelProjectId])

  const handleSelectThread = useCallback((conversationId: string) => {
    setActiveConversationId(conversationId)
    setShowHistory(false)
  }, [])

  const handleThreadDeleted = useCallback((deletedId: string, newActiveId: string | null) => {
    if (activeConversationId === deletedId && newActiveId) {
      setActiveConversationId(newActiveId)
    }
  }, [activeConversationId])

  // Handle escape key to close panel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return

      const openDialog = document.querySelector('[data-slot="dialog-content"][data-state="open"]')
      if (openDialog) return

      const activeElement = document.activeElement
      if (
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement
      ) {
        activeElement.blur()
        return
      }

      if (showHistory) {
        setShowHistory(false)
        return
      }

      closeAssistantPanel()
    }

    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown)
      return () => window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, closeAssistantPanel, showHistory])

  return (
    <div
      className="assistant-panel"
      data-open={isOpen}
    >
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between p-4 pb-0">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Bot className="h-4 w-4 text-accent shrink-0" />
            <h2 className="text-text-primary text-lg font-semibold truncate">
              Project Assistant
            </h2>
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-accent/15 text-accent shrink-0">
              Sonnet 4.6
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-white hover:text-text-primary shrink-0"
                  onClick={() => setShowHistory(!showHistory)}
                >
                  <History className="h-4 w-4" />
                  <span className="sr-only">Chat history</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Chat History</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-white hover:text-text-primary shrink-0"
                  onClick={handleNewThread}
                >
                  <MessageSquarePlus className="h-4 w-4" />
                  <span className="sr-only">New conversation</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">New conversation</TooltipContent>
            </Tooltip>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-text-muted hover:text-text-primary shrink-0"
              onClick={closeAssistantPanel}
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col min-h-0 mt-4">
          {isLoading ? (
            <div className="flex-1 flex items-center justify-center text-text-muted text-sm">
              Loading assistant...
            </div>
          ) : showHistory && assistantPanelProjectId ? (
            <ConversationHistory
              projectId={assistantPanelProjectId}
              activeConversationId={activeConversationId}
              onSelect={handleSelectThread}
              onNewThread={handleNewThread}
              onDeleted={handleThreadDeleted}
            />
          ) : assistantId && assistantPanelProjectId && activeConversationId ? (
            <AssistantChat
              projectId={assistantPanelProjectId}
              assistantId={assistantId}
              conversationId={activeConversationId}
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}
