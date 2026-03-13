import { Square, CheckSquare, Loader2, XCircle } from 'lucide-react'
import type { Task } from '@fleet-command/shared'

interface TaskListProps {
  tasks: Task[]
  onTaskClick?: (task: Task) => void
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'completed':
      return <CheckSquare className="h-4 w-4 text-accent shrink-0 mt-0.5" />
    case 'failed':
      return <XCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
    case 'in_progress':
      return <Loader2 className="h-4 w-4 text-accent shrink-0 mt-0.5 animate-spin" />
    default:
      return <Square className="h-4 w-4 text-text-muted shrink-0 mt-0.5" />
  }
}

function getTextStyle(status: string) {
  switch (status) {
    case 'completed':
      return 'text-text-secondary line-through'
    case 'failed':
      return 'text-destructive'
    default:
      return 'text-text-primary'
  }
}

export function TaskList({ tasks, onTaskClick }: TaskListProps) {
  return (
    <ul className="space-y-1">
      {tasks.map((task) => (
        <li
          key={task.id}
          className="flex items-start gap-2 cursor-pointer rounded px-1 py-0.5 hover:bg-bg-hover transition-colors"
          onClick={() => onTaskClick?.(task)}
          data-testid={`task-item-${task.id}`}
        >
          {getStatusIcon(task.status)}
          <span className={`text-sm truncate ${getTextStyle(task.status)}`}>
            {task.description}
          </span>
        </li>
      ))}
    </ul>
  )
}
