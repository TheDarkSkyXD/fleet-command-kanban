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
import { AlertTriangle, GitBranch, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  useTickets,
  useProjectPhases,
  useTemplate,
  useUpdateTicket,
  useProjects,
  useToggleAutomatedPhase,
  useUpdateProject,
  useProjectBranch
} from '@/hooks/queries'
import { TemplateUpgradeBanner } from '@/components/TemplateUpgradeBanner'
import { ArchivedSwimlane } from './ArchivedSwimlane'
import { BoardColumn } from './BoardColumn'
import { BrainstormColumn } from './BrainstormColumn'
import { TicketCard } from './TicketCard'
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
import type { Ticket, TemplatePhase } from '@fleet-command/shared'

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
 * Checks if a phase has an answerBot worker configured.
 */
function phaseHasAnswerBot(phaseConfig: TemplatePhase | undefined): boolean {
  if (!phaseConfig) return false
  // Check workers array for answerBot type
  if (phaseConfig.workers) {
    return phaseConfig.workers.some((w: { type: string }) => w.type === 'answerBot')
  }
  return false
}

/**
 * Checks if a phase can be automated.
 * A phase can be automated if it's either:
 * - A manual checkpoint (transitions.manual with no automation), OR
 * - Has an answerBot worker
 * First and last phases cannot be automated.
 */
/**
 * Checks if a phase is skippable (marked in template, separate from automation).
 * Skippable phases bypass their workers entirely when toggled.
 * First and last phases cannot be skipped.
 */
function isPhaseSkippable(
  phaseConfig: TemplatePhase | undefined,
  phaseName: string,
  allPhases: string[]
): boolean {
  if (allPhases.length > 0) {
    if (phaseName === allPhases[0] || phaseName === allPhases[allPhases.length - 1]) {
      return false
    }
  }
  return !!phaseConfig?.skippable
}

function canAutomate(
  phaseConfig: TemplatePhase | undefined,
  phaseName: string,
  allPhases: string[]
): boolean {
  // First and last phases cannot be automated
  if (allPhases.length > 0) {
    if (phaseName === allPhases[0] || phaseName === allPhases[allPhases.length - 1]) {
      return false
    }
  }

  if (!phaseConfig) return false

  // Manual checkpoint: has transitions.manual and no automation
  const isManualCheckpoint = !!(phaseConfig.transitions?.manual) && !phaseHasAutomation(phaseConfig)

  // Has an answerBot worker
  const hasAnswerBot = phaseHasAnswerBot(phaseConfig)

  return isManualCheckpoint || hasAnswerBot
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
  const toggleAutomatedPhase = useToggleAutomatedPhase()
  const updateProject = useUpdateProject()

  const { data: branchData } = useProjectBranch(projectId)
  const showArchivedTickets = useAppStore((s) => s.showArchivedTickets)

  const handleToggleAutomated = useCallback(
    (phaseName: string) => {
      if (!currentProject) return

      const isCurrentlyAutomated = currentProject.automatedPhases?.includes(phaseName) ?? false

      toggleAutomatedPhase.mutate({
        projectId,
        phaseId: phaseName,
        automated: !isCurrentlyAutomated
      })
    },
    [projectId, currentProject, toggleAutomatedPhase]
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

  const handleWipLimitChange = useCallback(
    (phaseName: string, limit: number | null) => {
      if (!currentProject) return

      const currentLimits = currentProject.wipLimits || {}
      let newLimits: Record<string, number>

      if (limit === null) {
        // Remove the limit for this phase
        const { [phaseName]: _, ...rest } = currentLimits
        newLimits = rest
      } else {
        // Set the limit for this phase
        newLimits = { ...currentLimits, [phaseName]: limit }
      }

      updateProject.mutate({
        id: projectId,
        updates: { wipLimits: Object.keys(newLimits).length > 0 ? newLimits : null }
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
    requiresWorktree?: boolean
  } | null>(null)
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null)
  const [wipOverrideDialog, setWipOverrideDialog] = useState<{
    open: boolean
    ticketId: string
    targetPhase: string
    phaseName: string
    currentCount: number
    wipLimit: number
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

      // Check WIP limit before moving
      const wipLimit = currentProject?.wipLimits?.[targetPhase]
      const currentCount = ticketsByPhase[targetPhase]?.length ?? 0

      if (wipLimit && currentCount >= wipLimit) {
        // Show WIP override dialog
        setWipOverrideDialog({
          open: true,
          ticketId,
          targetPhase,
          phaseName: targetPhase,
          currentCount,
          wipLimit
        })
        return
      }

      // Check if target phase has automation
      const phaseConfig = templateConfig?.phases.find((p) => p.name === targetPhase)
      const hasAutomation = phaseHasAutomation(phaseConfig)

      if (hasAutomation) {
        const needsWorktree = !!phaseConfig?.requiresWorktree
        setSelectedBranch(branchData?.currentBranch ?? null)
        // Show confirmation dialog
        setConfirmDialog({
          open: true,
          ticketId,
          targetPhase,
          phaseName: targetPhase,
          requiresWorktree: needsWorktree
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
    [projectId, templateConfig, updateTicket, currentProject, ticketsByPhase]
  )

  const handleConfirmMove = useCallback(() => {
    if (!confirmDialog || !projectId) return

    const updates: Record<string, unknown> = { phase: confirmDialog.targetPhase }
    if (confirmDialog.requiresWorktree && selectedBranch) {
      updates.baseBranch = selectedBranch
    }

    updateTicket.mutate({
      projectId: projectId,
      ticketId: confirmDialog.ticketId,
      updates
    })

    setConfirmDialog(null)
    setSelectedBranch(null)
  }, [confirmDialog, projectId, updateTicket, selectedBranch])

  const handleCancelMove = useCallback(() => {
    setConfirmDialog(null)
  }, [])

  const handleWipOverrideConfirm = useCallback(() => {
    if (!wipOverrideDialog || !projectId) return

    // Check if target phase has automation
    const phaseConfig = templateConfig?.phases.find((p) => p.name === wipOverrideDialog.targetPhase)
    const hasAutomation = phaseHasAutomation(phaseConfig)

    if (hasAutomation) {
      const needsWorktree = !!phaseConfig?.requiresWorktree
      setSelectedBranch(branchData?.currentBranch ?? null)
      // Show automation confirmation dialog after WIP override
      setConfirmDialog({
        open: true,
        ticketId: wipOverrideDialog.ticketId,
        targetPhase: wipOverrideDialog.targetPhase,
        phaseName: wipOverrideDialog.phaseName,
        requiresWorktree: needsWorktree
      })
    } else {
      updateTicket.mutate({
        projectId: projectId,
        ticketId: wipOverrideDialog.ticketId,
        updates: { phase: wipOverrideDialog.targetPhase, force: true }
      })
    }

    toast.info(`WIP limit overridden for ${wipOverrideDialog.phaseName}`)
    setWipOverrideDialog(null)
  }, [wipOverrideDialog, projectId, updateTicket, templateConfig])

  const handleWipOverrideCancel = useCallback(() => {
    setWipOverrideDialog(null)
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
      {/* Template Upgrade Banner */}
      <TemplateUpgradeBanner projectId={projectId} />

      {/* Board Content */}
      <div className="flex-1 min-h-0 h-full">
          <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <div className="h-full overflow-x-auto overflow-y-hidden p-4">
              <div className="flex gap-4 h-full after:content-[''] after:shrink-0 after:w-1">
                {/* Brainstorm column */}
                <div className="shrink-0">
                  <BrainstormColumn projectId={projectId} />
                </div>

                {phases?.map((phase) => {
                  const phaseConfig = templateConfig?.phases.find((p) => p.name === phase)
                  const canAutomatePhase = canAutomate(phaseConfig, phase, phases)
                  const skippable = isPhaseSkippable(phaseConfig, phase, phases)
                  const isAutomated = currentProject?.automatedPhases?.includes(phase) ?? false
                  const isMigrating = currentProject?.automatedPhaseMigration ?? false
                  const wipLimit = currentProject?.wipLimits?.[phase]

                  return (
                    <BoardColumn
                      key={phase}
                      phase={phase}
                      tickets={ticketsByPhase[phase] || []}
                      projectId={projectId}
                      showAddTicket={phase === phases?.[0]}
                      canAutomate={canAutomatePhase}
                      isSkippable={skippable}
                      isAutomated={isAutomated}
                      isMigrating={isMigrating}
                      onToggleAutomated={canAutomatePhase ? () => handleToggleAutomated(phase) : undefined}
                      onToggleSkipped={skippable ? () => handleToggleAutomated(phase) : undefined}
                      swimlaneColor={currentProject?.swimlaneColors?.[phase]}
                      onColorChange={(color) => handleSwimlaneColorChange(phase, color)}
                      phaseDescription={phaseConfig?.description}
                      wipLimit={wipLimit}
                      onWipLimitChange={(limit) => handleWipLimitChange(phase, limit)}
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

          {/* Branch selection for worktree phases */}
          {confirmDialog?.requiresWorktree && branchData?.branches && branchData.branches.length > 0 && (
            <div className="space-y-2">
              <label className="flex items-center gap-1.5 text-sm font-medium text-text-secondary">
                <GitBranch className="h-4 w-4" />
                Base Branch
              </label>
              <select
                value={selectedBranch ?? ''}
                onChange={(e) => setSelectedBranch(e.target.value)}
                className="w-full rounded-md border border-border bg-bg-tertiary px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
              >
                {branchData.branches.map((branch) => (
                  <option key={branch} value={branch}>{branch}</option>
                ))}
              </select>
              <p className="text-xs text-text-muted">
                The worktree branch will be created from this base branch.
              </p>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={handleCancelMove}>
              Cancel
            </Button>
            <Button onClick={handleConfirmMove}>Continue</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* WIP Limit Override Dialog */}
      <Dialog
        open={wipOverrideDialog?.open ?? false}
        onOpenChange={(open) => !open && handleWipOverrideCancel()}
      >
        <DialogContent className="bg-bg-secondary border-border">
          <DialogHeader>
            <DialogTitle className="text-text-primary">WIP Limit Reached</DialogTitle>
            <DialogDescription className="text-text-secondary">
              <span className="font-medium text-accent">{wipOverrideDialog?.phaseName}</span>{' '}
              already has {wipOverrideDialog?.currentCount} of {wipOverrideDialog?.wipLimit} tickets.
              Moving another ticket will exceed the WIP limit. Continue anyway?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={handleWipOverrideCancel}>
              Cancel
            </Button>
            <Button onClick={handleWipOverrideConfirm}>Override Limit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
