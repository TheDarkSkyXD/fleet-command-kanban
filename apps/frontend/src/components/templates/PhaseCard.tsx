import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Lock, Trash2, Bot } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { getAutomationType, type AutomationType } from './template.utils'
import type { TemplatePhase } from '@fleet-command/shared'

interface PhaseCardProps {
  phase: TemplatePhase
  isSelected: boolean
  isLocked: boolean
  onSelect: () => void
  onDelete: () => void
}

/**
 * Get badge variant and label for automation type
 */
function getAutomationBadge(type: AutomationType): {
  label: string
  className: string
} {
  switch (type) {
    case 'agents':
      return { label: 'Agents', className: 'bg-blue-500/20 text-blue-400 border-blue-500/30' }
    case 'ralph-loop':
      return { label: 'Ralph Loop', className: 'bg-orange-500/20 text-orange-400 border-orange-500/30' }
    case 'ticket-loop':
      return { label: 'Ticket Loop', className: 'bg-purple-500/20 text-purple-400 border-purple-500/30' }
    default:
      return { label: 'Manual', className: 'bg-muted text-muted-foreground' }
  }
}

/**
 * Count total agents in phase (including loop agents)
 */
function countAgents(phase: TemplatePhase): number {
  let count = phase.agents?.length ?? 0
  if (phase.ralphLoop) {
    count += phase.ralphLoop.agents?.length ?? 0
  }
  if (phase.ticketLoop) {
    count += phase.ticketLoop.agents?.length ?? 0
    if (phase.ticketLoop.ralphLoop) {
      count += phase.ticketLoop.ralphLoop.agents?.length ?? 0
    }
  }
  return count
}

/**
 * Draggable phase card for the template editor left column
 */
export function PhaseCard({
  phase,
  isSelected,
  isLocked,
  onSelect,
  onDelete
}: PhaseCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({
    id: phase.id,
    disabled: isLocked
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  }

  const automationType = getAutomationType(phase)
  const automationBadge = getAutomationBadge(automationType)
  const agentCount = countAgents(phase)

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors border-l-[3px]',
        'hover:border-primary/30',
        isSelected && 'border-primary bg-primary/5',
        isDragging && 'opacity-50',
        isLocked && 'bg-muted/50',
        automationType === 'manual' ? 'border-l-text-muted' : 'border-l-accent'
      )}
      onClick={onSelect}
    >
      {/* Drag Handle or Lock Icon */}
      {isLocked ? (
        <Lock className="h-4 w-4 text-muted-foreground shrink-0" />
      ) : (
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      )}

      {/* Phase Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">{phase.name}</span>
          <Badge variant="outline" className={cn('text-xs', automationBadge.className)}>
            {automationBadge.label}
          </Badge>
        </div>
        {agentCount > 0 && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
            <Bot className="h-3 w-3" />
            <span>{agentCount} agent{agentCount !== 1 ? 's' : ''}</span>
          </div>
        )}
      </div>

      {/* Delete Button */}
      {!isLocked && (
        <Button
          variant="ghost"
          size="icon-xs"
          className="shrink-0 text-muted-foreground hover:text-destructive"
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  )
}
