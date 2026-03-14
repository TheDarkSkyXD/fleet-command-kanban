import { useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { Archive, Plus, Bot, SkipForward, Settings2, RotateCcw } from 'lucide-react'
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
  canAutomate?: boolean
  isSkippable?: boolean
  isAutomated?: boolean
  isMigrating?: boolean
  onToggleAutomated?: () => void
  onToggleSkipped?: () => void
  swimlaneColor?: string
  onColorChange?: (color: string | null) => void
  phaseDescription?: string
  wipLimit?: number
  onWipLimitChange?: (limit: number | null) => void
}

export function BoardColumn({
  phase,
  tickets,
  projectId,
  showAddTicket,
  canAutomate,
  isSkippable,
  isAutomated,
  isMigrating,
  onToggleAutomated,
  onToggleSkipped,
  swimlaneColor,
  onColorChange,
  phaseDescription,
  wipLimit,
  onWipLimitChange
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

  // For skippable phases, the "automated" state means "skipped"
  const isSkipped = isSkippable && isAutomated

  // Determine tooltip text
  const getAutomateTooltipText = () => {
    if (isMigrating) return 'Migration in progress...'
    if (isAutomated) return phaseDescription ?? 'Automated'
    return phaseDescription ?? 'Enable automation'
  }

  const handleColorChange = (color: string | null) => {
    onColorChange?.(color)
  }

  // Background style with optional swimlane color
  const columnBackgroundStyle = swimlaneColor
    ? { backgroundColor: swimlaneColor }
    : undefined

  // WIP limit badge display
  const renderTicketCount = () => {
    if (wipLimit) {
      const isOver = tickets.length > wipLimit
      const isAtLimit = tickets.length === wipLimit
      return (
        <span className={cn(
          'text-xs px-2 py-0.5 rounded-[10px]',
          isOver && 'bg-accent-red/20 text-accent-red',
          isAtLimit && 'bg-accent-yellow/20 text-accent-yellow',
          !isOver && !isAtLimit && 'bg-bg-tertiary text-white'
        )}>
          {tickets.length}/{wipLimit}
        </span>
      )
    }
    return (
      <span className="text-white text-xs bg-bg-tertiary px-2 py-0.5 rounded-[10px]">
        {tickets.length}
      </span>
    )
  }

  return (
    <div
      className={cn(
        'swimlane-flip-container flex-shrink-0 w-[280px] md:w-[320px] h-full group'
      )}
    >
      {/* Inner wrapper that rotates */}
      <div className={cn('swimlane-flip-inner h-full', isFlipped && 'flipped')}>
        {/* Front face - normal swimlane view */}
        <div
          className={cn(
            'swimlane-front bg-bg-secondary rounded-lg flex flex-col',
            isAutomated && !isSkipped && 'opacity-60',
            isSkipped && 'opacity-50'
          )}
          style={columnBackgroundStyle}
        >
          {/* Currently Automated Banner (non-skippable phases) */}
          {isAutomated && !isSkippable && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-accent/10 border-b border-accent/20 rounded-t-lg">
              <Bot className="h-3 w-3 text-accent" />
              <span className="text-xs text-accent font-medium">Currently Automated</span>
            </div>
          )}

          {/* Phase Skipped Banner */}
          {isSkipped && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-accent-yellow/10 border-b border-accent-yellow/20 rounded-t-lg">
              <SkipForward className="h-3 w-3 text-accent-yellow" />
              <span className="text-xs text-accent-yellow font-medium">Phase Skipped</span>
            </div>
          )}

          {/* Column Header */}
          <div className="flex items-center justify-between p-3 border-b border-border">
            <div className="flex items-center gap-2">
              {canAutomate && onToggleAutomated && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <IconButton
                      tooltip=""
                      onClick={onToggleAutomated}
                      disabled={isMigrating}
                      className={cn(isMigrating && 'cursor-not-allowed opacity-50')}
                    >
                      <Bot className={cn(
                        'h-4 w-4',
                        isAutomated ? 'text-accent' : 'text-text-muted'
                      )} />
                    </IconButton>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p className="text-xs">{getAutomateTooltipText()}</p>
                  </TooltipContent>
                </Tooltip>
              )}
              <h3 className="text-text-secondary font-semibold text-[13px]">{phase}</h3>
            </div>
            <div className="flex items-center gap-2">
              {renderTicketCount()}
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
              {showAddTicket && (
                <IconButton tooltip="Create new ticket" onClick={openAddTicketModal}>
                  <Plus className="h-4 w-4" />
                </IconButton>
              )}
              {/* Skip toggle - far right, for both skippable and automatable phases */}
              {((isSkippable && onToggleSkipped) || (canAutomate && onToggleAutomated)) && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={isSkippable ? onToggleSkipped : onToggleAutomated}
                      disabled={isMigrating}
                      className={cn(
                        'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary',
                        isAutomated ? 'bg-accent-yellow' : 'bg-bg-tertiary',
                        isMigrating && 'cursor-not-allowed opacity-50'
                      )}
                    >
                      <span
                        className={cn(
                          'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm ring-0 transition-transform',
                          isAutomated ? 'translate-x-4' : 'translate-x-0'
                        )}
                      />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p className="text-xs">
                      {isSkippable
                        ? (isSkipped ? 'Phase skipped — tickets pass through' : 'Skip this phase')
                        : (isAutomated ? 'Automated — tickets pass through' : 'Skip this phase')
                      }
                    </p>
                  </TooltipContent>
                </Tooltip>
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
            wipLimit={wipLimit}
            onWipLimitChange={onWipLimitChange}
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
