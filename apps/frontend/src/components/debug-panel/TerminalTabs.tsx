import { useState, useRef } from 'react'
import { Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Terminal } from './Terminal'
import { useTerminals, useCreateTerminal, useDeleteTerminal, useRenameTerminal } from '@/hooks/queries'
import { Input } from '@/components/ui/input'
import type { TerminalInfo } from '@fleet-command/shared'

interface TerminalTabsProps {
  projectId: string
}

export function TerminalTabs({ projectId }: TerminalTabsProps) {
  const { data: terminals } = useTerminals(projectId)
  const createTerminal = useCreateTerminal()
  const deleteTerminal = useDeleteTerminal()
  const renameTerminal = useRenameTerminal()
  const [activeTerminalId, setActiveTerminalId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-select first terminal
  const terminalList = terminals ?? []
  const selectedId = activeTerminalId && terminalList.some(t => t.id === activeTerminalId)
    ? activeTerminalId
    : terminalList[0]?.id ?? null

  function handleCreate() {
    createTerminal.mutate({ projectId }, {
      onSuccess: (newTerminal: TerminalInfo) => {
        setActiveTerminalId(newTerminal.id)
      }
    })
  }

  function handleDelete(terminalId: string) {
    deleteTerminal.mutate({ projectId, terminalId })
    if (selectedId === terminalId) {
      const remaining = terminalList.filter(t => t.id !== terminalId)
      setActiveTerminalId(remaining[0]?.id ?? null)
    }
  }

  function startRename(terminal: TerminalInfo) {
    setEditingId(terminal.id)
    setEditName(terminal.name)
    setTimeout(() => inputRef.current?.select(), 0)
  }

  function commitRename() {
    if (editingId && editName.trim()) {
      renameTerminal.mutate({ projectId, terminalId: editingId, name: editName.trim() })
    }
    setEditingId(null)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex items-center gap-0.5 px-2 h-8 shrink-0 bg-bg-primary border-b border-border overflow-x-auto">
        {terminalList.map((terminal) => (
          <div
            key={terminal.id}
            className={cn(
              'flex items-center gap-1 px-2 h-6 rounded text-xs cursor-pointer select-none shrink-0 group',
              selectedId === terminal.id
                ? 'bg-bg-tertiary text-text-primary'
                : 'text-text-muted hover:text-text-secondary hover:bg-bg-secondary'
            )}
            onClick={() => setActiveTerminalId(terminal.id)}
            onDoubleClick={() => startRename(terminal)}
          >
            {editingId === terminal.id ? (
              <Input
                ref={inputRef}
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename()
                  if (e.key === 'Escape') setEditingId(null)
                }}
                className="h-4 w-20 text-xs px-1 py-0"
                autoFocus
              />
            ) : (
              <span className="truncate max-w-[100px]">{terminal.name}</span>
            )}
            {terminalList.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleDelete(terminal.id)
                }}
                className="opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        ))}
        <button
          onClick={handleCreate}
          className="flex items-center justify-center h-6 w-6 rounded text-text-muted hover:text-text-secondary hover:bg-bg-secondary"
          title="New terminal"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Terminal content */}
      <div className="flex-1 min-h-0">
        {selectedId ? (
          <Terminal projectId={projectId} terminalId={selectedId} />
        ) : (
          <div className="flex items-center justify-center h-full text-text-muted text-sm">
            No terminal sessions
          </div>
        )}
      </div>
    </div>
  )
}
