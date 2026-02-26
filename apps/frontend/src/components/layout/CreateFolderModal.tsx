import { useState, useCallback, type KeyboardEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { useAppStore } from '@/stores/appStore'
import { api } from '@/api/client'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'

export function CreateFolderModal() {
  const queryClient = useQueryClient()
  const isOpen = useAppStore((s) => s.createFolderModalOpen)
  const closeModal = useAppStore((s) => s.closeCreateFolderModal)

  const [name, setName] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleClose = useCallback(() => {
    setName('')
    setError(null)
    closeModal()
  }, [closeModal])

  const handleSubmit = useCallback(async () => {
    const trimmed = name.trim()
    if (!trimmed) return

    if (trimmed.length > 100) {
      setError('Folder name must be 100 characters or less')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      await api.createFolder(trimmed)
      await queryClient.invalidateQueries({ queryKey: ['folders'] })
      handleClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create folder')
    } finally {
      setIsSubmitting(false)
    }
  }, [name, queryClient, handleClose])

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && name.trim() && !isSubmitting) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="bg-bg-secondary border-border sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-text-primary">Create Folder</DialogTitle>
          <DialogDescription className="text-text-secondary">
            Create a folder to organize your projects.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <label htmlFor="folder-name" className="text-sm text-text-secondary">
              Folder Name
            </label>
            <input
              id="folder-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g. Client Projects"
              disabled={isSubmitting}
              autoFocus
              className="w-full bg-bg-tertiary border border-border rounded-md px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>

          {error && (
            <p className="text-sm text-accent-red">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!name.trim() || isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                Creating...
              </>
            ) : (
              'Create Folder'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
