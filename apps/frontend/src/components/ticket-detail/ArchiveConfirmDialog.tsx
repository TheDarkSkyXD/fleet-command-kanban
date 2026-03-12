import { useState, useEffect } from 'react'
import { Archive, Loader2, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

const STORAGE_KEY = 'fleet-command-archive-warning-dismissed'

interface ArchiveConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  isPending: boolean
  ticketId: string
}

export function ArchiveConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  isPending,
  ticketId,
}: ArchiveConfirmDialogProps) {
  const [dontShowAgain, setDontShowAgain] = useState(false)

  // Reset checkbox when dialog opens
  useEffect(() => {
    if (open) {
      setDontShowAgain(false)
    }
  }, [open])

  const handleConfirm = () => {
    if (dontShowAgain) {
      localStorage.setItem(STORAGE_KEY, 'true')
    }
    onConfirm()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-bg-secondary border-border">
        <DialogHeader>
          <DialogTitle className="text-text-primary flex items-center gap-2">
            <Archive className="h-5 w-5 text-yellow-500" />
            Archive {ticketId}?
          </DialogTitle>
          <DialogDescription className="text-text-secondary">
            Archiving will remove this ticket from the board.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-3 text-sm text-text-secondary">
            Archiving a ticket will remove any worktrees for it and delete any local branches for it.
          </div>
        </div>

        <label className="flex items-center gap-2 cursor-pointer select-none">
          <button
            type="button"
            role="checkbox"
            aria-checked={dontShowAgain}
            onClick={() => setDontShowAgain(!dontShowAgain)}
            className={cn(
              'h-4 w-4 rounded border transition-colors flex items-center justify-center',
              dontShowAgain
                ? 'bg-accent border-accent text-white'
                : 'border-border bg-bg-secondary'
            )}
          >
            {dontShowAgain && <Check className="h-3 w-3" />}
          </button>
          <span className="text-sm text-text-muted">Do not show this warning again</span>
        </label>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isPending}
            className="bg-yellow-600 hover:bg-yellow-700 text-white"
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Archive className="h-4 w-4" />
            )}
            Archive
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Helper function to check if the archive warning should be shown
 * Returns true if the warning should be shown (not dismissed)
 */
export function shouldShowArchiveWarning(): boolean {
  return localStorage.getItem(STORAGE_KEY) !== 'true'
}
