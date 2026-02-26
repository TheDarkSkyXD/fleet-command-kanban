import { useState, useMemo, useCallback } from 'react'
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors
} from '@dnd-kit/core'
import { AlertTriangle, Loader2, Plus } from 'lucide-react'
import {
  useTickets,
  useProjectPhases,
  useTemplate,
  useUpdateTicket,
  useProjects,
  useToggleDisabledPhase,
  useUpdateProject
} from '@/hooks/queries'
import { TemplateUpgradeBanner } from '@/components/TemplateUpgradeBanner'
import { ArchivedSwimlane } from './ArchivedSwimlane'
import { BoardColumn } from './BoardColumn'
import { BrainstormColumn } from './BrainstormColumn'
import { TicketCard } from './TicketCard'
import { ViewToggle } from './ViewToggle'
import { TableView } from './TableView'
import { useAppStore } from '@/stores/appStore'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import type { Ticket, TemplatePhase } from '@potato-cannon/shared'

/**
 * Checks if a phase has automation configured (agents, ralphLoop, or ticketLoop)
 */
function phaseHasAutomation(phaseConfig: TemplatePhase | undefined): boolean {
  if (!phaseConfig) return false
  return !!(
    (phaseConfig.agents && phaseConfig.agents.length > 0) ||
    phaseConfig.ralphLoop ||
    phaseConfig.ticketLoop
  )
}

/**
 * Checks if a phase is a manual checkpoint (eligible for toggle).
 * A phase is manual if it has transitions.manual: true and no automation.
 */
function isManualCheckpoint(
  phaseConfig: TemplatePhase | undefined,
  phaseName: string,
  allPhases: string[]
): boolean {
  // First and last phases (Ideas, Done) cannot be disabled
  if (allPhases.length > 0) {
    if (phaseName === allPhases[0] || phaseName === allPhases[allPhases.length - 1]) {
      return false
    }
  }

  if (!phaseConfig) return false

  // Must have manual: true in transitions
  if (!phaseConfig.transitions?.manual) return false

  // Must NOT have automation
  return !phaseHasAutomation(phaseConfig)
}

interface BoardProps {
  projectId: string
}

export function Board({ projectId }: BoardProps) {
  // Queries
  const { data: projects } = useProjects()
  const { data: tickets, isLoading: ticketsLoading, error: ticketsError } = useTickets(projectId)
  const { data: phases } = useProjectPhases(projectId)

  // Get current project to access template name
  const currentProject = useMemo(
    () => projects?.find((p) => p.id === projectId),
    [projects, projectId]
  )

  const { data: templateConfig } = useTemplate(currentProject?.template?.name ?? null)

  // Mutations
  const updateTicket = useUpdateTicket()
  const toggleDisabledPhase = useToggleDisabledPhase()
  const updateProject = useUpdateProject()

  // View mode from store
  const boardViewMode = useAppStore((s) => s.boardViewMode)
  const openAddTicketModal = useAppStore((s) => s.openAddTicketModal)
  const showArchivedTickets = useAppStore((s) => s.showArchivedTickets)

  const handleToggleDisabled = useCallback(
    (phaseName: string) => {
      if (!currentProject) return

      const isCurrentlyDisabled = currentProject.disabledPhases?.includes(phaseName) ?? false

      toggleDisabledPhase.mutate({
        projectId,
        phaseId: phaseName,
        disabled: !isCurrentlyDisabled
      })
    },
    [projectId, currentProject, toggleDisabledPhase]
  )

  const handleSwimlaneColorChange = useCallback(
    (phaseName: string, color: string | null) => {
      if (!currentProject) return

      const currentColors = currentProject.swimlaneColors || {}
      let newColors: Record<string, string>

      if (color === null) {
        // Remove the color for this phase
        const { [phaseName]: _, ...rest } = currentColors
        newColors = rest
      } else {
        // Set the color for this phase
        newColors = { ...currentColors, [phaseName]: color }
      }

      updateProject.mutate({
        id: projectId,
        updates: { swimlaneColors: newColors }
      })
    },
    [projectId, currentProject, updateProject]
  )

  // Sensors for drag and drop - require 5px movement before activating drag
  // This allows clicks to work normally on ticket cards
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5
      }
    })
  )

  // Local state
  const [activeTicket, setActiveTicket] = useState<Ticket | null>(null)
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean
    ticketId: string
    targetPhase: string
    phaseName: string
  } | null>(null)

  // Group tickets by phase
  const ticketsByPhase = useMemo(() => {
    const grouped: Record<string, Ticket[]> = {}
    if (phases) {
      phases.forEach((phase) => {
        grouped[phase] = []
      })
    }
    if (tickets) {
      tickets.forEach((ticket) => {
        if (grouped[ticket.phase]) {
          grouped[ticket.phase].push(ticket)
        } else if (phases && !phases.includes(ticket.phase)) {
          // Ticket in unknown phase - add to first phase
          if (phases[0]) {
            grouped[phases[0]].push(ticket)
          }
        }
      })
    }
    return grouped
  }, [tickets, phases])

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const ticket = event.active.data.current?.ticket as Ticket | undefined
    if (ticket) {
      setActiveTicket(ticket)
    }
  }, [])

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveTicket(null)

      const { active, over } = event
      if (!over || !projectId) return

      const ticketId = active.id as string
      const ticket = active.data.current?.ticket as Ticket | undefined
      const targetPhase = over.id as string

      if (!ticket || ticket.phase === targetPhase) return

      // Check if target phase has automation
      const phaseConfig = templateConfig?.phases.find((p) => p.name === targetPhase)
      const hasAutomation = phaseHasAutomation(phaseConfig)

      if (hasAutomation) {
        // Show confirmation dialog
        setConfirmDialog({
          open: true,
          ticketId,
          targetPhase,
          phaseName: targetPhase
        })
      } else {
        // No automation, move directly
        updateTicket.mutate({
          projectId: projectId,
          ticketId,
          updates: { phase: targetPhase }
        })
      }
    },
    [projectId, templateConfig, updateTicket]
  )

  const handleConfirmMove = useCallback(() => {
    if (!confirmDialog || !projectId) return

    updateTicket.mutate({
      projectId: projectId,
      ticketId: confirmDialog.ticketId,
      updates: { phase: confirmDialog.targetPhase }
    })

    setConfirmDialog(null)
  }, [confirmDialog, projectId, updateTicket])

  const handleCancelMove = useCallback(() => {
    setConfirmDialog(null)
  }, [])

  // Loading state
  if (ticketsLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-text-muted" />
      </div>
    )
  }

  // Error state
  if (ticketsError) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center text-accent-red">
          <AlertTriangle className="h-8 w-8 mx-auto mb-2" />
          <p>Failed to load tickets</p>
          <p className="text-sm text-text-muted mt-1">{ticketsError.message}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden h-full">
      {/* Board Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <Button
          variant="outline"
          size="sm"
          onClick={openAddTicketModal}
          className="gap-1.5"
        >
          <Plus className="h-4 w-4" />
          Add Ticket
        </Button>
        <ViewToggle />
      </div>

      {/* Template Upgrade Banner */}
      <TemplateUpgradeBanner projectId={projectId} />

      {/* Divider */}
      <div className="border-b border-border" />

      {/* Board Content - Conditional Rendering */}
      {boardViewMode === 'table' ? (
        <div className="h-full flex">
          {/* Desktop only: fixed brainstorm column */}
          <div className="hidden sm:block shrink-0 h-full overflow-y-auto border-r border-border p-4 pr-2">
            <BrainstormColumn projectId={projectId} />
          </div>
          <TableView projectId={projectId} />
        </div>
      ) : (
        <div className="flex-1 min-h-0 h-full">
          <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <div className="h-full overflow-x-auto overflow-y-hidden p-4">
              <div className="flex gap-4 h-full">
                {/* Brainstorm column: scrolls on mobile, sticky on desktop */}
                <div className="shrink-0 sm:sticky sm:left-4 sm:z-10 sm:bg-bg-primary">
                  <BrainstormColumn projectId={projectId} />
                </div>

                {phases?.map((phase) => {
                  const phaseConfig = templateConfig?.phases.find((p) => p.name === phase)
                  const isManual = isManualCheckpoint(phaseConfig, phase, phases)
                  const isDisabled = currentProject?.disabledPhases?.includes(phase) ?? false
                  const isMigrating = currentProject?.disabledPhaseMigration ?? false

                  return (
                    <BoardColumn
                      key={phase}
                      phase={phase}
                      tickets={ticketsByPhase[phase] || []}
                      projectId={projectId}
                      showAddTicket={false}
                      isManualPhase={isManual}
                      isDisabled={isDisabled}
                      isMigrating={isMigrating}
                      onToggleDisabled={isManual ? () => handleToggleDisabled(phase) : undefined}
                      swimlaneColor={currentProject?.swimlaneColors?.[phase]}
                      onColorChange={(color) => handleSwimlaneColorChange(phase, color)}
                    />
                  )
                })}

                {/* Archived swimlane - appears after Done when toggled */}
                {showArchivedTickets && projectId && (
                  <ArchivedSwimlane projectId={projectId} />
                )}
              </div>
            </div>

            {/* Drag Overlay */}
            <DragOverlay>
              {activeTicket && (
                <div className="opacity-80">
                  <TicketCard ticket={activeTicket} projectId={projectId} />
                </div>
              )}
            </DragOverlay>
          </DndContext>
        </div>
      )}

      {/* Automation Confirmation Dialog */}
      <Dialog
        open={confirmDialog?.open ?? false}
        onOpenChange={(open) => !open && handleCancelMove()}
      >
        <DialogContent className="bg-bg-secondary border-border">
          <DialogHeader>
            <DialogTitle className="text-text-primary">Start Automation?</DialogTitle>
            <DialogDescription className="text-text-secondary">
              Moving to <span className="font-medium text-accent">{confirmDialog?.phaseName}</span>{' '}
              will start Claude automation. Continue?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={handleCancelMove}>
              Cancel
            </Button>
            <Button onClick={handleConfirmMove}>Continue</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
