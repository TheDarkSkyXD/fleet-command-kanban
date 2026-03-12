import { useState, useCallback } from 'react'
import { RefreshCw } from 'lucide-react'
import { IconButton } from '@/components/ui/icon-button'
import { RestartPhaseModal } from './RestartPhaseModal'
import type { TicketHistoryEntry } from '@fleet-command/shared'

interface RestartPhaseButtonProps {
  projectId: string
  ticketId: string
  currentPhase: string
  history: TicketHistoryEntry[]
  disabled?: boolean
}

export function RestartPhaseButton({
  projectId,
  ticketId,
  currentPhase,
  history,
  disabled = false,
}: RestartPhaseButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)

  const handleOpenModal = useCallback(() => {
    setIsModalOpen(true)
  }, [])

  const handleModalChange = useCallback((open: boolean) => {
    setIsModalOpen(open)
  }, [])

  // Don't show if no history (shouldn't happen, but safety check)
  if (!history || history.length === 0) {
    return null
  }

  return (
    <>
      <IconButton
        tooltip="Restart phase"
        onClick={handleOpenModal}
        disabled={disabled}
      >
        <RefreshCw className="h-4 w-4" />
      </IconButton>

      <RestartPhaseModal
        open={isModalOpen}
        onOpenChange={handleModalChange}
        projectId={projectId}
        ticketId={ticketId}
        currentPhase={currentPhase}
        history={history}
      />
    </>
  )
}
