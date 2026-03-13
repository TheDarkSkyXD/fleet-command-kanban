import { useMemo } from 'react'
import { Loader2, Bot } from 'lucide-react'
import { usePhaseWorkers } from '@/hooks/queries'
import { WorkerTreeItem } from './WorkerTreeItem'
import type { WorkerNode } from '@fleet-command/shared'

interface WorkerTreeProps {
  projectId: string
  phase: string
  onAgentClick: (agentType: string, agentName: string, model?: string) => void
  filter?: (worker: WorkerNode) => boolean
  emptyMessage?: string
}

export function WorkerTree({ projectId, phase, onAgentClick, filter, emptyMessage }: WorkerTreeProps) {
  const { data, isLoading, error } = usePhaseWorkers(projectId, phase)

  const filteredWorkers = useMemo(() => {
    if (!data?.workers) return []
    if (!filter) return data.workers
    return data.workers.filter(filter)
  }, [data?.workers, filter])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-4 w-4 animate-spin text-text-muted" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-xs text-accent-red py-2">
        Failed to load workers
      </div>
    )
  }

  if (filteredWorkers.length === 0) {
    return (
      <div className="flex items-center gap-2 py-4 text-text-muted">
        <Bot className="h-4 w-4" />
        <span className="text-xs">{emptyMessage || 'No workers configured for this phase'}</span>
      </div>
    )
  }

  return (
    <div className="space-y-0.5">
      {filteredWorkers.map((worker, index) => (
        <WorkerTreeItem
          key={worker.id}
          node={worker}
          depth={0}
          isLastChild={index === filteredWorkers.length - 1}
          onAgentClick={onAgentClick}
        />
      ))}
    </div>
  )
}

/**
 * Hook to check if a phase has an answerBot worker configured.
 */
export function useHasAnswerBot(projectId: string, phase: string): boolean {
  const { data } = usePhaseWorkers(projectId, phase)

  return useMemo(() => {
    if (!data?.workers) return false
    return data.workers.some((w) => w.type === 'answerBot')
  }, [data?.workers])
}
