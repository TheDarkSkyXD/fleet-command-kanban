import { useQuery } from '@tanstack/react-query'
import { Square, CheckSquare } from 'lucide-react'
import { api } from '@/api/client'
import type { Task } from '@fleet-command/shared'

interface TaskListProps {
  projectId: string
  ticketId: string
  currentPhase: string
}

export function TaskList({ projectId, ticketId, currentPhase }: TaskListProps) {
  // Fetch tasks using react-query
  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ['tasks', projectId, ticketId, currentPhase],
    queryFn: () => api.getTicketTasks(projectId, ticketId, currentPhase),
  })

  if (tasks.length === 0) {
    return null
  }

  return (
    <div className="px-4 pb-4">
      <div className="rounded-lg border border-border bg-bg-secondary p-3 max-h-[200px] overflow-y-auto shadow-sm">
        <div className="text-xs font-medium text-text-secondary mb-2">Tasks</div>
        <ul className="space-y-1">
          {tasks.map((task) => (
            <li key={task.id} className="flex items-start gap-2">
              {task.status === 'completed' ? (
                <CheckSquare className="h-4 w-4 text-accent shrink-0 mt-0.5" />
              ) : (
                <Square className="h-4 w-4 text-text-muted shrink-0 mt-0.5" />
              )}
              <span className={`text-sm ${task.status === 'completed' ? 'text-text-secondary line-through' : 'text-text-primary'}`}>
                {task.description}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
