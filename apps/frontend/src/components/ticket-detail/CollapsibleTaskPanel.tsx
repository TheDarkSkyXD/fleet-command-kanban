import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronUp, Square, CheckSquare, Loader2, XCircle } from 'lucide-react'
import { api } from '@/api/client'
import { TaskList } from './TaskList'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { renderMarkdown } from '@/lib/markdown'
import type { Task } from '@fleet-command/shared'

interface CollapsibleTaskPanelProps {
  projectId: string
  ticketId: string
  currentPhase: string
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'completed':
      return <CheckSquare className="h-4 w-4 text-accent shrink-0" />
    case 'failed':
      return <XCircle className="h-4 w-4 text-destructive shrink-0" />
    case 'in_progress':
      return <Loader2 className="h-4 w-4 text-accent shrink-0 animate-spin" />
    default:
      return <Square className="h-4 w-4 text-text-muted shrink-0" />
  }
}

export function CollapsibleTaskPanel({ projectId, ticketId, currentPhase }: CollapsibleTaskPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)

  const { data: tasks = [], isLoading } = useQuery<Task[]>({
    queryKey: ['tasks', projectId, ticketId, currentPhase],
    queryFn: () => api.getTicketTasks(projectId, ticketId, currentPhase),
  })

  // Don't render anything while loading or if no tasks
  if (isLoading || tasks.length === 0) {
    return null
  }

  const completed = tasks.filter((t) => t.status === 'completed').length
  const total = tasks.length

  // Collapsed summary: failed > in_progress > count
  const failedTask = tasks.find((t) => t.status === 'failed')
  const inProgressTask = tasks.find((t) => t.status === 'in_progress')

  let collapsedSummary: React.ReactNode
  if (failedTask) {
    collapsedSummary = (
      <span data-testid="collapsed-summary" className="truncate text-destructive">
        {failedTask.description}
      </span>
    )
  } else if (inProgressTask) {
    collapsedSummary = (
      <span data-testid="collapsed-summary" className="truncate text-text-secondary">
        {inProgressTask.description}
      </span>
    )
  } else {
    collapsedSummary = (
      <span data-testid="collapsed-summary" className="text-text-muted">
        {completed}/{total}
      </span>
    )
  }

  return (
    <>
      <div className="border-t border-border shrink-0">
        {/* Header — always visible */}
        <button
          onClick={() => setIsExpanded((prev) => !prev)}
          className="flex items-center gap-2 w-full px-4 py-2 text-xs font-medium text-text-secondary hover:bg-bg-hover transition-colors"
          aria-label="Tasks"
          data-testid="task-panel-header"
        >
          {isExpanded ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <ChevronUp className="h-3.5 w-3.5 shrink-0" />
          )}
          <span>Tasks</span>
          {isExpanded ? (
            <span className="text-text-muted ml-auto">{completed}/{total}</span>
          ) : (
            <span className="ml-auto">{collapsedSummary}</span>
          )}
        </button>

        {/* Content — animated */}
        <div
          data-testid="task-panel-content"
          className="overflow-hidden transition-[max-height] duration-200 ease-in-out"
          style={{ maxHeight: isExpanded ? '200px' : '0px' }}
        >
          <div className="overflow-y-auto max-h-[200px] px-3 pb-3">
            <TaskList tasks={tasks} onTaskClick={setSelectedTask} />
          </div>
        </div>
      </div>

      {/* Task Detail Dialog */}
      <Dialog open={!!selectedTask} onOpenChange={() => setSelectedTask(null)}>
        <DialogContent className="bg-bg-secondary border-border max-w-lg" aria-describedby="task-dialog-description">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedTask && getStatusIcon(selectedTask.status)}
              Task #{selectedTask?.displayNumber}
            </DialogTitle>
          </DialogHeader>
          {selectedTask && (
            <div id="task-dialog-description" className="space-y-3">
              <p className="text-sm text-text-primary">{selectedTask.description}</p>
              {selectedTask.body && (
                <div
                  className="text-sm text-text-secondary prose prose-sm prose-invert"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(selectedTask.body) }}
                />
              )}
              <div className="flex items-center gap-2 text-xs text-text-muted">
                <Badge variant="outline">{selectedTask.status}</Badge>
                <span>Attempt {selectedTask.attemptCount}</span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
