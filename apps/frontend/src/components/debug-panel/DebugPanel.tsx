import { useEffect, useRef, useState, useCallback } from 'react'
import { TerminalSquare, Server, Bot, ChevronDown, ChevronUp, GripHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { AgentLogTab } from './AgentLogTab'
import { DevServerTab } from './DevServerTab'
import { TerminalTabs } from './TerminalTabs'

type DebugTab = 'agent' | 'devserver' | 'terminal'

interface DebugPanelProps {
  projectId: string | null
}

const MIN_HEIGHT = 150
const MAX_HEIGHT = 600
const DEFAULT_HEIGHT = 280
const STORAGE_KEY = 'fleet-command-debug-panel'

function loadState(): { open: boolean; height: number; tab: DebugTab } {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      return {
        open: parsed.open ?? false,
        height: Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, parsed.height ?? DEFAULT_HEIGHT)),
        tab: parsed.tab ?? 'terminal'
      }
    }
  } catch { /* ignore */ }
  return { open: false, height: DEFAULT_HEIGHT, tab: 'terminal' }
}

function saveState(state: { open: boolean; height: number; tab: DebugTab }) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export function DebugPanel({ projectId }: DebugPanelProps) {
  const [state, setState] = useState(loadState)
  const { open, height, tab } = state
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null)

  const setOpen = useCallback((v: boolean) => {
    setState(prev => {
      const next = { ...prev, open: v }
      saveState(next)
      return next
    })
  }, [])

  const setHeight = useCallback((v: number) => {
    setState(prev => {
      const next = { ...prev, height: Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, v)) }
      saveState(next)
      return next
    })
  }, [])

  const setTab = useCallback((v: DebugTab) => {
    setState(prev => {
      const next = { ...prev, tab: v, open: true }
      saveState(next)
      return next
    })
  }, [])

  // Keyboard shortcut: backtick toggles panel
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      // Don't trigger when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === '`' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault()
        setOpen(!open)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, setOpen])

  // Drag resize
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragRef.current = { startY: e.clientY, startHeight: height }

    function onMove(ev: MouseEvent) {
      if (!dragRef.current) return
      const delta = dragRef.current.startY - ev.clientY
      setHeight(dragRef.current.startHeight + delta)
    }

    function onUp() {
      dragRef.current = null
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [height, setHeight])

  const tabs: { id: DebugTab; label: string; icon: typeof Bot }[] = [
    { id: 'agent', label: 'Agent', icon: Bot },
    { id: 'devserver', label: 'Dev Server', icon: Server },
    { id: 'terminal', label: 'Terminal', icon: TerminalSquare },
  ]

  return (
    <div
      className={cn(
        'shrink-0 border-t border-border bg-bg-primary transition-[height] duration-200',
        !open && 'h-8'
      )}
      style={open ? { height: `${height}px` } : undefined}
    >
      {/* Header / tab bar */}
      <div className="flex items-center h-8 border-b border-border bg-bg-secondary px-2 gap-1">
        {/* Drag handle (only when open) */}
        {open && (
          <div
            className="cursor-ns-resize px-1 text-text-muted hover:text-text-secondary"
            onMouseDown={handleDragStart}
            title="Drag to resize"
          >
            <GripHorizontal className="h-3.5 w-3.5" />
          </div>
        )}

        {/* Tabs */}
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => {
              if (tab === id && open) {
                setOpen(false)
              } else {
                setTab(id)
              }
            }}
            className={cn(
              'flex items-center gap-1.5 px-2 h-6 rounded text-xs transition-colors',
              tab === id && open
                ? 'bg-bg-tertiary text-text-primary'
                : 'text-text-muted hover:text-text-secondary hover:bg-bg-hover'
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}

        <div className="flex-1" />

        {/* Toggle button */}
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1 px-1.5 h-5 rounded text-xs text-text-muted hover:text-text-secondary hover:bg-bg-hover"
          title={open ? 'Collapse panel' : 'Expand panel'}
        >
          {open ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
        </button>

        {/* Keyboard hint */}
        <Badge variant="outline" className="text-[9px] px-1 py-0 text-text-muted border-border hidden sm:flex">
          `
        </Badge>
      </div>

      {/* Panel content */}
      {open && (
        <div className="h-[calc(100%-32px)] overflow-hidden">
          {tab === 'agent' && <AgentLogTab projectId={projectId} />}
          {tab === 'devserver' && projectId && <DevServerTab projectId={projectId} />}
          {tab === 'terminal' && projectId && <TerminalTabs projectId={projectId} />}
          {!projectId && tab !== 'agent' && (
            <div className="flex items-center justify-center h-full text-text-muted text-sm">
              Select a project to use this feature
            </div>
          )}
        </div>
      )}
    </div>
  )
}
