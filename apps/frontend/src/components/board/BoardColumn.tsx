import { useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { Archive, Plus, ToggleLeft, ToggleRight, Settings2, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/stores/appStore'
import { IconButton } from '@/components/ui/icon-button'
import { TicketCard } from './TicketCard'
import { SwimlaneBackside } from './SwimlaneBackside'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from '@/components/ui/tooltip'
import type { Ticket } from '@fleet-command/shared'

interface BoardColumnProps {
  phase: string
  tickets: Ticket[]
  projectId: string
  showAddTicket?: boolean
  isManualPhase?: boolean
  isDisabled?: boolean
  isMigrating?: boolean
  onToggleDisabled?: () => void
  swimlaneColor?: string
  onColorChange?: (color: string | null) => void
}

export function BoardColumn({
  phase,
  tickets,
  projectId,
  showAddTicket,
  isManualPhase,
  isDisabled,
  isMigrating,
  onToggleDisabled,
  swimlaneColor,
  onColorChange
}: BoardColumnProps) {
  const openAddTicketModal = useAppStore((s) => s.openAddTicketModal)
  const showArchivedTickets = useAppStore((s) => s.showArchivedTickets)
  const setShowArchivedTickets = useAppStore((s) => s.setShowArchivedTickets)
  const [isFlipped, setIsFlipped] = useState(false)

  // Disable droppable when flipped to prevent accidental drops
  const { setNodeRef, isOver } = useDroppable({
    id: phase,
    data: { phase },
    disabled: isFlipped
  })

  // Determine tooltip text
  const getTooltipText = () => {
    if (isMigrating) return 'Migration in progress...'
    if (isDisabled) return 'Enable checkpoint - items will stop here'
    return 'Skip checkpoint - items will pass through automatically'
  }

  const handleColorChange = (color: string | null) => {
    onColorChange?.(color)
  }

  // Background style with optional swimlane color
  const columnBackgroundStyle = swimlaneColor
    ? { backgroundColor: swimlaneColor }
    : undefined

  return (
    <div
      className={cn(
        'swimlane-flip-container flex-shrink-0 w-[280px] md:w-[320px] h-full group',
        isDisabled && 'opacity-50'
      )}
    >
      {/* Inner wrapper that rotates */}
      <div className={cn('swimlane-flip-inner h-full', isFlipped && 'flipped')}>
        {/* Front face - normal swimlane view */}
        <div
          className="swimlane-front bg-bg-secondary rounded-lg flex flex-col"
          style={columnBackgroundStyle}
        >
          {/* Column Header */}
          <div className="flex items-center justify-between p-3 border-b border-border">
            <h3 className="text-text-secondary font-semibold text-[13px]">{phase}</h3>
            <div className="flex items-center gap-2">
              <span className="text-text-muted text-xs bg-bg-tertiary px-2 py-0.5 rounded-[10px]">
                {tickets.length}
              </span>
              {phase === 'Done' && (
                <IconButton
                  tooltip={showArchivedTickets ? 'Hide archived' : 'View archived'}
                  onClick={() => setShowArchivedTickets(!showArchivedTickets)}
                  className={cn(
                    showArchivedTickets && 'bg-accent/20 text-accent'
                  )}
                >
                  <Archive className="h-4 w-4" />
                </IconButton>
              )}
              {isManualPhase && onToggleDisabled && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <IconButton
                      tooltip=""
                      onClick={onToggleDisabled}
                      disabled={isMigrating}
                      className={cn(isMigrating && 'cursor-not-allowed opacity-50')}
                    >
                      {isDisabled ? (
                        <ToggleLeft className="h-4 w-4 text-text-muted" />
                      ) : (
                        <ToggleRight className="h-4 w-4 text-accent" />
                      )}
                    </IconButton>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p className="text-xs">{getTooltipText()}</p>
                  </TooltipContent>
                </Tooltip>
              )}
              {showAddTicket && (
                <IconButton tooltip="Create new ticket" onClick={openAddTicketModal}>
                  <Plus className="h-4 w-4" />
                </IconButton>
              )}
            </div>
          </div>

          {/* Drop Zone / Tickets Container */}
          <div
            ref={setNodeRef}
            className={cn(
              'swimlane-tickets-fade flex-1 p-2 overflow-y-auto min-h-[100px] transition-colors',
              isOver && 'bg-accent/10',
              isFlipped && 'fading'
            )}
          >
            <div className="flex flex-col gap-2">
              {tickets.map((ticket) => (
                <TicketCard key={ticket.id} ticket={ticket} projectId={projectId} swimlaneColor={swimlaneColor} />
              ))}
              {tickets.length === 0 && (
                <div className="text-center text-text-muted text-xs py-8">
                  No tickets in this phase
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Back face - configuration panel */}
        <div
          className="swimlane-back bg-bg-secondary rounded-lg"
          style={columnBackgroundStyle}
        >
          <SwimlaneBackside
            projectId={projectId}
            phase={phase}
            currentColor={swimlaneColor}
            onColorChange={handleColorChange}
          />
        </div>
      </div>

      {/* Edit button - positioned outside flip-inner so it doesn't rotate */}
      <button
        onClick={() => setIsFlipped(!isFlipped)}
        className={cn(
          'absolute z-10',
          // Desktop: bottom-center, show on hover
          'bottom-3 left-1/2 -translate-x-1/2',
          'opacity-0 group-hover:opacity-100',
          // Mobile: bottom-right, always visible
          'max-md:left-auto max-md:right-3 max-md:translate-x-0',
          'max-md:opacity-100',
          // Button styles
          'flex items-center justify-center',
          'h-8 w-8 rounded-full',
          'bg-bg-tertiary hover:bg-bg-hover',
          'border border-border',
          'text-text-muted hover:text-text-primary',
          'transition-all duration-200',
          'focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-bg-primary'
        )}
      >
        {isFlipped ? (
          <RotateCcw className="h-4 w-4" />
        ) : (
          <Settings2 className="h-4 w-4" />
        )}
      </button>
    </div>
  )
}
