import { useState, useMemo, useCallback } from 'react'
import { RefreshCw, Loader2, AlertTriangle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useRestartTicket } from '@/hooks/queries'
import type { TicketHistoryEntry } from '@fleet-command/shared'

interface RestartPhaseModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  ticketId: string
  currentPhase: string
  history: TicketHistoryEntry[]
}

export function RestartPhaseModal({
  open,
  onOpenChange,
  projectId,
  ticketId,
  currentPhase,
  history,
}: RestartPhaseModalProps) {
  const [selectedPhase, setSelectedPhase] = useState<string>(currentPhase)
  const restartTicket = useRestartTicket()

  // Get unique phases from history (in order they were visited)
  const availablePhases = useMemo(() => {
    const seen = new Set<string>()
    const phases: string[] = []
    for (const entry of history) {
      if (!seen.has(entry.phase)) {
        seen.add(entry.phase)
        phases.push(entry.phase)
      }
    }
    return phases
  }, [history])

  // Reset selected phase when modal opens
  const handleOpenChange = useCallback((isOpen: boolean) => {
    if (isOpen) {
      setSelectedPhase(currentPhase)
    }
    onOpenChange(isOpen)
  }, [currentPhase, onOpenChange])

  const handleRestart = useCallback(() => {
    restartTicket.mutate(
      { projectId, ticketId, targetPhase: selectedPhase },
      {
        onSuccess: () => {
          onOpenChange(false)
        },
      }
    )
  }, [projectId, ticketId, selectedPhase, restartTicket, onOpenChange])

  const isRollback = selectedPhase !== currentPhase
  const currentPhaseIndex = availablePhases.indexOf(currentPhase)
  const selectedPhaseIndex = availablePhases.indexOf(selectedPhase)
  const phasesToDiscard = isRollback
    ? availablePhases.slice(selectedPhaseIndex + 1, currentPhaseIndex + 1)
    : []

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="bg-bg-secondary border-border">
        <DialogHeader>
          <DialogTitle className="text-text-primary flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-accent" />
            Restart Phase
          </DialogTitle>
          <DialogDescription className="text-text-secondary">
            Select a phase to restart from. All progress in that phase and any phases after it will be discarded.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          <div className="space-y-2">
            <label htmlFor="restart-phase-select" className="text-sm font-medium text-text-primary">
              Restart from phase
            </label>
            <Select value={selectedPhase} onValueChange={setSelectedPhase}>
              <SelectTrigger id="restart-phase-select" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availablePhases.map((phase) => (
                  <SelectItem key={phase} value={phase}>
                    {phase}
                    {phase === currentPhase && (
                      <span className="text-text-muted ml-2">(current)</span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isRollback && phasesToDiscard.length > 0 && (
            <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-3 text-sm">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-yellow-500">
                    Rolling back will discard work from:
                  </p>
                  <ul className="mt-1 text-text-secondary list-disc list-inside">
                    {phasesToDiscard.map((phase) => (
                      <li key={phase}>{phase}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          <div className="rounded-lg border border-border bg-bg-tertiary p-3 text-sm text-text-secondary">
            <p>This will:</p>
            <ul className="mt-1 list-disc list-inside space-y-1">
              <li>Stop any running sessions</li>
              <li>Delete tasks, artifacts, and feedback from affected phases</li>
              <li>Clear session history for affected phases</li>
              <li>Remove the worktree and rename the branch</li>
              <li>Re-run automation for the target phase</li>
            </ul>
            <p className="mt-2 text-text-muted text-xs">
              Your git commits are preserved under fleet-resets/.
            </p>
          </div>

          {restartTicket.isError && (
            <p className="text-sm text-accent-red">
              {restartTicket.error instanceof Error
                ? restartTicket.error.message
                : 'Failed to restart phase'}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={restartTicket.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleRestart}
            disabled={restartTicket.isPending}
            className="bg-accent hover:bg-accent/90"
          >
            {restartTicket.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            {isRollback ? 'Rollback & Restart' : 'Restart Phase'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
