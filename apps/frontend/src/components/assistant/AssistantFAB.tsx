import { useEffect, useCallback } from 'react'
import { Bot, X } from 'lucide-react'
import { useAppStore } from '@/stores/appStore'
import { cn } from '@/lib/utils'

interface AssistantFABProps {
  projectId: string
}

export function AssistantFAB({ projectId }: AssistantFABProps) {
  const assistantPanelOpen = useAppStore((s) => s.assistantPanelOpen)
  const openAssistantPanel = useAppStore((s) => s.openAssistantPanel)
  const closeAssistantPanel = useAppStore((s) => s.closeAssistantPanel)

  const handleToggle = useCallback(() => {
    if (assistantPanelOpen) {
      closeAssistantPanel()
    } else {
      openAssistantPanel(projectId)
    }
  }, [assistantPanelOpen, openAssistantPanel, closeAssistantPanel, projectId])

  // Global keyboard shortcut: 'A' to toggle assistant
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't trigger if typing in an input, textarea, or contenteditable
      const target = e.target as HTMLElement
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target.isContentEditable
      ) {
        return
      }

      // Don't trigger if any modifier keys are pressed
      if (e.ctrlKey || e.metaKey || e.altKey) return

      // Don't trigger if a dialog is open
      const openDialog = document.querySelector('[data-slot="dialog-content"][data-state="open"]')
      if (openDialog) return

      if (e.key === 'a' || e.key === 'A') {
        e.preventDefault()
        handleToggle()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleToggle])

  return (
    <button
      onClick={handleToggle}
      className={cn(
        'assistant-fab',
        assistantPanelOpen && 'assistant-fab--open'
      )}
      aria-label={assistantPanelOpen ? 'Close project assistant' : 'Open project assistant'}
    >
      {assistantPanelOpen ? (
        <X className="h-5 w-5" />
      ) : (
        <Bot className="h-5 w-5" />
      )}
    </button>
  )
}
