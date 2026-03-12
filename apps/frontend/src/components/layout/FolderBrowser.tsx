import { useState, useCallback, useEffect } from 'react'
import { Folder, FolderOpen, ChevronRight, ArrowUp, Loader2, HardDrive } from 'lucide-react'
import { api } from '@/api/client'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'

interface DirEntry {
  name: string
  path: string
  isDirectory: boolean
}

interface FolderBrowserProps {
  open: boolean
  onClose: () => void
  onSelect: (path: string) => void
}

export function FolderBrowser({ open, onClose, onSelect }: FolderBrowserProps) {
  const [currentPath, setCurrentPath] = useState('')
  const [parentPath, setParentPath] = useState<string | null>(null)
  const [entries, setEntries] = useState<DirEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pathInput, setPathInput] = useState('')

  const browse = useCallback(async (dirPath?: string) => {
    setLoading(true)
    setError(null)
    try {
      const result = await api.browseFilesystem(dirPath)
      setCurrentPath(result.path)
      setParentPath(result.parent)
      setEntries(result.entries)
      setPathInput(result.path)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to browse directory')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) {
      browse()
    }
  }, [open, browse])

  const handleSelect = () => {
    if (currentPath) {
      onSelect(currentPath)
      onClose()
    }
  }

  const handleNavigate = (dirPath: string) => {
    browse(dirPath)
  }

  const handleGoUp = () => {
    if (parentPath) {
      browse(parentPath)
    } else {
      browse()
    }
  }

  const handlePathSubmit = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && pathInput.trim()) {
      browse(pathInput.trim())
    }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="bg-bg-secondary border-border sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-text-primary">Browse for Folder</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* Path input */}
          <div className="flex gap-2">
            <input
              type="text"
              value={pathInput}
              onChange={(e) => setPathInput(e.target.value)}
              onKeyDown={handlePathSubmit}
              placeholder="Type a path and press Enter"
              className="flex-1 min-w-0 bg-bg-tertiary border border-border rounded-md px-3 py-1.5 text-sm font-mono text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
            />
            {(currentPath || parentPath) && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleGoUp}
                title="Go up"
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
            )}
          </div>

          {error && (
            <p className="text-sm text-accent-red">{error}</p>
          )}

          {/* Directory listing */}
          <div className="border border-border rounded-md bg-bg-tertiary overflow-hidden">
            <div className="max-h-72 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-8 text-text-muted">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  Loading...
                </div>
              ) : entries.length === 0 ? (
                <div className="py-8 text-center text-text-muted text-sm">
                  No subdirectories found
                </div>
              ) : (
                entries.map((entry) => (
                  <button
                    key={entry.path}
                    onClick={() => handleNavigate(entry.path)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-bg-hover transition-colors border-b border-border last:border-b-0"
                  >
                    {!currentPath ? (
                      <HardDrive className="h-4 w-4 text-text-muted shrink-0" />
                    ) : (
                      <Folder className="h-4 w-4 text-text-muted shrink-0" />
                    )}
                    <span className="text-text-primary truncate">{entry.name}</span>
                    <ChevronRight className="h-3 w-3 text-text-muted ml-auto shrink-0" />
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Current selection */}
          {currentPath && (
            <div className="flex items-center gap-2 px-3 py-2 bg-bg-tertiary border border-accent/30 rounded-md min-w-0 overflow-hidden">
              <FolderOpen className="h-4 w-4 text-accent shrink-0" />
              <span className="text-sm font-mono text-text-primary truncate">{currentPath}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSelect} disabled={!currentPath}>
            Select Folder
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
