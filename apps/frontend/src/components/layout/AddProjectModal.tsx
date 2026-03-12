import { useState, useCallback, useEffect, type KeyboardEvent } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { Loader2, FolderOpen } from 'lucide-react'
import { useAppStore } from '@/stores/appStore'
import { useTemplates } from '@/hooks/queries'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { FolderBrowser } from './FolderBrowser'

// Check if running in Electron
const isElectron = !!(window as { electronAPI?: unknown }).electronAPI

// Electron API types
declare global {
  interface Window {
    electronAPI?: {
      invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
    }
    showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>
  }
}

export function AddProjectModal() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const isOpen = useAppStore((s) => s.addProjectModalOpen)
  const closeModal = useAppStore((s) => s.closeAddProjectModal)

  const [path, setPath] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [browserOpen, setBrowserOpen] = useState(false)

  const { data: templates, isLoading: templatesLoading } = useTemplates()

  // Pre-select default template when templates load
  useEffect(() => {
    if (templates && templates.length > 0 && !selectedTemplate) {
      const defaultTemplate = templates.find(t => t.isDefault) || templates[0]
      setSelectedTemplate(defaultTemplate.name)
    }
  }, [templates, selectedTemplate])

  const resetForm = useCallback(() => {
    setPath('')
    setDisplayName('')
    setSelectedTemplate(null)
    setError(null)
  }, [])

  const handleClose = useCallback(() => {
    resetForm()
    closeModal()
  }, [closeModal, resetForm])

  const handleBrowse = useCallback(async () => {
    try {
      if (isElectron) {
        // Use Electron's native dialog - returns full path
        const result = await window.electronAPI?.invoke('select-folder')
        if (result && typeof result === 'string') {
          setPath(result)
          if (!displayName) {
            const folderName = result.replace(/[\\/]+$/, '').split(/[\\/]/).pop()
            if (folderName) setDisplayName(folderName)
          }
        }
      } else {
        setBrowserOpen(true)
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error('Failed to open folder picker:', err)
      }
    }
  }, [displayName])

  const handleFolderSelected = useCallback((selectedPath: string) => {
    setPath(selectedPath)
    if (!displayName) {
      const folderName = selectedPath.replace(/[\\/]+$/, '').split(/[\\/]/).pop()
      if (folderName) setDisplayName(folderName)
    }
  }, [displayName])

  const handleSubmit = useCallback(async () => {
    if (!path.trim()) return

    setIsSubmitting(true)
    setError(null)

    try {
      const project = await api.addProject(
        path.trim(),
        displayName.trim() || undefined,
        selectedTemplate || undefined
      )
      await queryClient.invalidateQueries({ queryKey: ['projects'] })
      // Navigate to the new project's board view (URL is the source of truth)
      // The root layout will sync this to the store for persistence
      navigate({ to: '/projects/$projectId/board', params: { projectId: project.slug } })
      handleClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add project')
    } finally {
      setIsSubmitting(false)
    }
  }, [path, displayName, selectedTemplate, queryClient, navigate, handleClose])

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && path.trim() && !isSubmitting) {
      e.preventDefault()
      handleSubmit()
    }
  }

  // When folder browser is open, hide the main modal to avoid nested dialog conflicts
  const showMainModal = isOpen && !browserOpen

  return (
    <>
      <Dialog open={showMainModal} onOpenChange={(open) => !open && handleClose()}>
        <DialogContent className="bg-bg-secondary border-border sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-text-primary">Add Project</DialogTitle>
            <DialogDescription className="text-text-secondary">
              Add an existing project directory to Fleet Command.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 overflow-hidden">
            <div className="space-y-2">
              <label htmlFor="project-path" className="text-sm text-text-secondary">
                Project Path
              </label>
              {isElectron ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleBrowse}
                  disabled={isSubmitting}
                  className="w-full justify-start bg-bg-tertiary border-border h-auto py-3 px-4 hover:bg-bg-hover overflow-hidden min-w-0"
                >
                  <FolderOpen className="h-5 w-5 mr-3 text-text-muted shrink-0" />
                  {path ? (
                    <span className="font-mono text-sm text-text-primary truncate">{path}</span>
                  ) : (
                    <span className="text-text-muted">Choose a folder...</span>
                  )}
                </Button>
              ) : (
                <div className="flex gap-2">
                  <input
                    id="project-path"
                    type="text"
                    value={path}
                    onChange={(e) => setPath(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="/path/to/your/project"
                    disabled={isSubmitting}
                    autoFocus
                    className="flex-1 min-w-0 bg-bg-tertiary border border-border rounded-md px-3 py-2 text-sm font-mono text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleBrowse}
                    disabled={isSubmitting}
                    title="Browse for folder"
                  >
                    <FolderOpen className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label htmlFor="project-name" className="text-sm text-text-secondary">
                Display Name <span className="text-text-muted">(optional)</span>
              </label>
              <input
                id="project-name"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="My Project"
                disabled={isSubmitting}
                className="w-full bg-bg-tertiary border border-border rounded-md px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm text-text-secondary">
                Workflow Template
              </label>
              <Select
                value={selectedTemplate || ''}
                onValueChange={setSelectedTemplate}
                disabled={isSubmitting || templatesLoading}
              >
                <SelectTrigger className="w-full bg-bg-tertiary border-border">
                  <SelectValue placeholder={templatesLoading ? 'Loading templates...' : 'Select a template'} />
                </SelectTrigger>
                <SelectContent className="bg-bg-secondary border-border">
                  {templates?.map((template) => (
                    <SelectItem key={template.name} value={template.name}>
                      {template.name}{template.isDefault ? ' (default)' : ''}
                    </SelectItem>
                  ))}
                  {templates?.length === 0 && (
                    <SelectItem value="" disabled>
                      No templates available
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            {error && (
              <p className="text-sm text-accent-red">{error}</p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={!path.trim() || isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  Adding...
                </>
              ) : (
                'Add Project'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <FolderBrowser
        open={browserOpen}
        onClose={() => setBrowserOpen(false)}
        onSelect={handleFolderSelected}
      />
    </>
  )
}
