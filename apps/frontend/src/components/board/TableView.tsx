import { useState, useMemo, useCallback } from 'react'
import { Clock } from 'lucide-react'
import {
  useTickets,
  useProjectPhases,
  useProjects,
  useTemplate,
  useUpdateTicket
} from '@/hooks/queries'
import { useAppStore } from '@/stores/appStore'
import { cn, timeAgo, parseTicketNumber } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import type { TemplatePhase } from '@fleet-command/shared'

type SortColumn = 'id' | 'title' | 'phase' | 'updated'
type SortDirection = 'asc' | 'desc'

interface SortConfig {
  column: SortColumn | null
  direction: SortDirection
}

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

interface SortableHeaderProps {
  column: SortColumn
  label: string
  sortConfig: SortConfig
  onSort: (column: SortColumn) => void
  className?: string
}

function SortableHeader({ column, label, sortConfig, onSort, className }: SortableHeaderProps) {
  const isActive = sortConfig.column === column

  return (
    <th
      className={cn(
        'px-4 py-3 font-medium cursor-pointer select-none hover:bg-bg-secondary transition-colors',
        className
      )}
      onClick={() => onSort(column)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onSort(column)}
    >
      <span className="flex items-center gap-1">
        {label}
        {isActive && (
          <span className="text-accent">
            {sortConfig.direction === 'asc' ? '↑' : '↓'}
          </span>
        )}
      </span>
    </th>
  )
}

/**
 * Gets inline style for row background based on phase color.
 * Uses color-mix to blend phase color with bg-secondary for theme cohesion.
 * Returns a subtle neutral background for rows without swimlane colors.
 */
function getRowBackgroundStyle(
  phase: string,
  swimlaneColors: Record<string, string> | undefined
): React.CSSProperties | undefined {
  const color = swimlaneColors?.[phase]
  if (!color) {
    // Subtle neutral background for rows without swimlane colors
    return { backgroundColor: 'rgba(33, 38, 45, 0.3)' } // bg-tertiary (#21262d) at 30%
  }
  // Blend phase color with bg-secondary for theme cohesion
  return { backgroundColor: `color-mix(in srgb, ${color} 15%, #161b22)` }
}

interface TableViewProps {
  projectId: string
}

export function TableView({ projectId }: TableViewProps) {
  const openTicketSheet = useAppStore((s) => s.openTicketSheet)
  const isTicketProcessingFn = useAppStore((s) => s.isTicketProcessing)
  const isTicketPendingFn = useAppStore((s) => s.isTicketPending)

  // Queries
  const { data: projects } = useProjects()
  const { data: tickets } = useTickets(projectId)
  const { data: phases } = useProjectPhases(projectId)

  // Get current project to access template name
  const currentProject = useMemo(
    () => projects?.find((p) => p.id === projectId),
    [projects, projectId]
  )

  const { data: templateConfig } = useTemplate(currentProject?.template?.name ?? null)

  // Mutations
  const updateTicket = useUpdateTicket()

  // Confirmation dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean
    ticketId: string
    targetPhase: string
    phaseName: string
  } | null>(null)

  // Sort configuration state
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    column: null,
    direction: 'asc'
  })
  // Sort tickets based on sortConfig
  const sortedTickets = useMemo(() => {
    if (!tickets) return []

    const sorted = [...tickets]

    if (sortConfig.column === null) {
      // Default: phase workflow order
      return sorted.sort((a, b) => {
        const aIndex = phases?.indexOf(a.phase) ?? 0
        const bIndex = phases?.indexOf(b.phase) ?? 0
        return aIndex - bIndex
      })
    }

    // Column-specific sorting
    sorted.sort((a, b) => {
      let comparison = 0
      switch (sortConfig.column) {
        case 'id':
          comparison = parseTicketNumber(a.id) - parseTicketNumber(b.id)
          break
        case 'title':
          comparison = a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
          break
        case 'phase':
          const aIndex = phases?.indexOf(a.phase) ?? 0
          const bIndex = phases?.indexOf(b.phase) ?? 0
          comparison = aIndex - bIndex
          break
        case 'updated':
          comparison = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()
          break
      }
      return sortConfig.direction === 'desc' ? -comparison : comparison
    })

    return sorted
  }, [tickets, phases, sortConfig])

  const handlePhaseChange = useCallback(
    (ticketId: string, newPhase: string) => {
      // Check if target phase has automation
      const phaseConfig = templateConfig?.phases.find((p) => p.name === newPhase)
      const hasAutomation = phaseHasAutomation(phaseConfig)

      if (hasAutomation) {
        // Show confirmation dialog
        setConfirmDialog({
          open: true,
          ticketId,
          targetPhase: newPhase,
          phaseName: newPhase
        })
      } else {
        // No automation, move directly
        updateTicket.mutate({
          projectId,
          ticketId,
          updates: { phase: newPhase }
        })
      }
    },
    [projectId, templateConfig, updateTicket]
  )

  const handleConfirmMove = useCallback(() => {
    if (!confirmDialog) return

    updateTicket.mutate({
      projectId,
      ticketId: confirmDialog.ticketId,
      updates: { phase: confirmDialog.targetPhase }
    })

    setConfirmDialog(null)
  }, [confirmDialog, projectId, updateTicket])

  const handleCancelMove = useCallback(() => {
    setConfirmDialog(null)
  }, [])

  const handleSort = useCallback((column: SortColumn) => {
    setSortConfig(prev => {
      if (prev.column !== column) {
        // New column: start with ascending
        return { column, direction: 'asc' }
      }
      if (prev.direction === 'asc') {
        // Same column, was ascending: switch to descending
        return { column, direction: 'desc' }
      }
      // Same column, was descending: reset to default (phase order)
      return { column: null, direction: 'asc' }
    })
  }, [])
  const handleRowClick = useCallback(
    (ticketId: string) => {
      openTicketSheet(projectId, ticketId)
    },
    [projectId, openTicketSheet]
  )

  if (!tickets || tickets.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-muted">
        No tickets yet
      </div>
    )
  }

  return (
    <>
      <div className="flex-1 overflow-auto">
        <table className="w-full">
          <thead className="sticky top-0 bg-bg-primary border-b border-border">
            <tr className="text-left text-xs text-text-muted uppercase tracking-wider">
              <SortableHeader
                column="id"
                label="ID"
                sortConfig={sortConfig}
                onSort={handleSort}
                className="w-28"
              />
              <SortableHeader
                column="title"
                label="Title"
                sortConfig={sortConfig}
                onSort={handleSort}
              />
              <SortableHeader
                column="phase"
                label="Phase"
                sortConfig={sortConfig}
                onSort={handleSort}
                className="w-40"
              />
              <SortableHeader
                column="updated"
                label="Updated"
                sortConfig={sortConfig}
                onSort={handleSort}
                className="w-28 text-right"
              />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sortedTickets.map((ticket) => {
              const isProcessing = isTicketProcessingFn(projectId, ticket.id)
              const isPending = isTicketPendingFn(projectId, ticket.id)

              return (
                <tr
                  key={ticket.id}
                  onClick={() => handleRowClick(ticket.id)}
                  className={cn(
                    'hover:bg-bg-hover cursor-pointer transition-colors',
                    isProcessing && 'bg-accent/5'
                  )}
                  style={getRowBackgroundStyle(ticket.phase, currentProject?.swimlaneColors)}
                >
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs text-text-muted">
                      {ticket.id}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-text-primary truncate max-w-md">
                        {ticket.title}
                      </span>
                      {isProcessing && (
                        <span className="inline-block w-2 h-2 bg-accent rounded-full animate-pulse flex-shrink-0" />
                      )}
                      {isPending && (
                        <span className="flex items-center justify-center w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 text-xs font-bold flex-shrink-0">
                          ?
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <Select
                      value={ticket.phase}
                      onValueChange={(value) => handlePhaseChange(ticket.id, value)}
                    >
                      <SelectTrigger size="sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {phases?.map((phase) => (
                          <SelectItem key={phase} value={phase}>
                            {phase}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="flex items-center justify-end gap-1 text-xs text-text-muted">
                      <Clock className="h-3 w-3" />
                      {timeAgo(ticket.updatedAt)}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
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
          <DialogFooter>
            <Button variant="outline" onClick={handleCancelMove}>
              Cancel
            </Button>
            <Button onClick={handleConfirmMove}>Continue</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
