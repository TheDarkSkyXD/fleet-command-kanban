import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { useStartDevServer } from '@/hooks/queries'
import { api } from '@/api/client'
import type { DevServerConfig } from '@fleet-command/shared'

interface DevServerConfigDialogProps {
  projectId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  config?: DevServerConfig
}

export function DevServerConfigDialog({ projectId, open, onOpenChange, config }: DevServerConfigDialogProps) {
  const [customCommand, setCustomCommand] = useState('')
  const startDevServer = useStartDevServer()

  useEffect(() => {
    if (open && config) {
      setCustomCommand(config.customCommand || '')
    }
  }, [open, config])

  async function handleSave() {
    await api.updateDevServerConfig(projectId, customCommand || null)
    onOpenChange(false)
  }

  async function handleSaveAndStart() {
    await api.updateDevServerConfig(projectId, customCommand || null)
    startDevServer.mutate({ projectId, command: customCommand || undefined })
    onOpenChange(false)
  }

  async function handleClear() {
    setCustomCommand('')
    await api.updateDevServerConfig(projectId, null)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Dev Server Configuration</DialogTitle>
          <DialogDescription>
            Configure the development server command for this project.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {config?.projectType && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-text-muted">Detected:</span>
              <Badge variant="outline" className="text-xs">{config.projectType}</Badge>
            </div>
          )}

          {config?.detectedCommand && (
            <div className="space-y-1">
              <Label className="text-xs text-text-muted">Auto-detected command</Label>
              <code className="block text-xs bg-bg-secondary rounded px-2 py-1.5 text-text-secondary font-mono">
                {config.detectedCommand}
              </code>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="custom-command">Custom command (overrides auto-detection)</Label>
            <Input
              id="custom-command"
              value={customCommand}
              onChange={(e) => setCustomCommand(e.target.value)}
              placeholder={config?.detectedCommand || 'npm run dev'}
              className="font-mono text-sm"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          {customCommand && (
            <Button variant="ghost" size="sm" onClick={handleClear}>
              Clear
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleSave}>
            Save
          </Button>
          <Button size="sm" onClick={handleSaveAndStart}>
            Save & Start
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
