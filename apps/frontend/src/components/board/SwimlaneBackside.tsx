import { useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Settings2, Bot } from 'lucide-react'
import { SwimlaneColorPicker } from './SwimlaneColorPicker'
import { WorkerTree, useHasAnswerBot } from './WorkerTree'
import { AgentPromptEditor } from './AgentPromptEditor'
import type { WorkerNode } from '@fleet-command/shared'

interface SwimlaneBacksideProps {
  projectId: string
  phase: string
  currentColor: string | undefined
  onColorChange: (color: string | null) => void
  disabled?: boolean
  wipLimit?: number
  onWipLimitChange?: (limit: number | null) => void
}

export function SwimlaneBackside({
  projectId,
  phase,
  currentColor,
  onColorChange,
  disabled,
  wipLimit,
  onWipLimitChange
}: SwimlaneBacksideProps) {
  // Agent editor state
  const [selectedAgent, setSelectedAgent] = useState<{
    agentType: string
    agentName: string
    model?: string
  } | null>(null)

  // WIP limit input state
  const [wipInputValue, setWipInputValue] = useState<string>(
    wipLimit != null ? String(wipLimit) : ''
  )

  const hasAnswerBot = useHasAnswerBot(projectId, phase)

  const handleAgentClick = useCallback((agentType: string, agentName: string, model?: string) => {
    setSelectedAgent({ agentType, agentName, model })
  }, [])

  const handleCloseEditor = useCallback(() => {
    setSelectedAgent(null)
  }, [])

  const handleWipBlur = useCallback(() => {
    const parsed = parseInt(wipInputValue, 10)
    if (wipInputValue === '' || isNaN(parsed) || parsed <= 0) {
      onWipLimitChange?.(null)
      setWipInputValue('')
    } else {
      onWipLimitChange?.(parsed)
      setWipInputValue(String(parsed))
    }
  }, [wipInputValue, onWipLimitChange])

  // Filter functions for worker tree sections
  const filterRegularWorkers = useCallback((worker: WorkerNode) => worker.type !== 'answerBot', [])
  const filterAnswerBot = useCallback((worker: WorkerNode) => worker.type === 'answerBot', [])

  return (
    <>
      <div className="h-full flex flex-col p-4">
        {/* Header */}
        <div className="flex items-center gap-2 pb-4 border-b border-border">
          <Settings2 className="h-4 w-4 text-text-muted" />
          <h3 className="text-text-secondary font-semibold text-[13px]">
            {phase} Settings
          </h3>
        </div>

        {/* Configuration options */}
        <div className="flex-1 overflow-y-auto py-4 space-y-6">
          {/* Color setting */}
          <div className="space-y-3">
            <label className="text-xs text-text-muted uppercase tracking-wider">
              Column Color
            </label>
            <SwimlaneColorPicker
              value={currentColor}
              onChange={onColorChange}
              disabled={disabled}
            />
          </div>

          {/* WIP limit setting */}
          <div className="space-y-3">
            <label className="text-xs text-text-muted uppercase tracking-wider">
              WIP Limit
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="1"
                className="wip-input w-20 px-2 py-1.5 text-sm rounded-md bg-bg-tertiary border border-border text-text-primary placeholder:text-text-muted"
                placeholder="None"
                value={wipInputValue}
                onChange={(e) => setWipInputValue(e.target.value)}
                onBlur={handleWipBlur}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    (e.target as HTMLInputElement).blur()
                  }
                }}
              />
              <span className="text-xs text-text-muted">max tickets</span>
            </div>
          </div>

          {/* Worker tree */}
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-xs text-text-muted uppercase tracking-wider">
              <Bot className="h-3 w-3" />
              Phase Workers
            </label>
            <div className="p-3 rounded-lg bg-bg-tertiary/50 border border-border">
              <WorkerTree
                projectId={projectId}
                phase={phase}
                onAgentClick={handleAgentClick}
                filter={filterRegularWorkers}
                emptyMessage="No workers configured for this phase"
              />
            </div>
          </div>

          {/* Answer Bot section */}
          {hasAnswerBot && (
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-xs text-text-muted uppercase tracking-wider">
                <Bot className="h-3 w-3" />
                Answer Bot
              </label>
              <div className="p-3 rounded-lg bg-bg-tertiary/50 border border-border">
                <WorkerTree
                  projectId={projectId}
                  phase={phase}
                  onAgentClick={handleAgentClick}
                  filter={filterAnswerBot}
                  emptyMessage="No answer bot configured"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Agent Prompt Editor Modal - Portaled to body to escape transform context */}
      {selectedAgent && createPortal(
        <AgentPromptEditor
          projectId={projectId}
          agentType={selectedAgent.agentType}
          agentName={selectedAgent.agentName}
          model={selectedAgent.model}
          open={true}
          onClose={handleCloseEditor}
        />,
        document.body
      )}
    </>
  )
}
