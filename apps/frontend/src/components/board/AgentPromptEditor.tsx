import { useState, useEffect, useMemo, useCallback } from 'react'
import { Bot, Loader2, X, Copy, RotateCcw, AlertTriangle } from 'lucide-react'
import { renderMarkdown } from '@/lib/markdown'
import { toast } from 'sonner'
import { api } from '@/api/client'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useSaveAgentOverride, useDeleteAgentOverride } from '@/hooks/queries'

interface AgentPromptEditorProps {
  projectId: string
  agentType: string
  agentName: string
  model?: string
  open: boolean
  onClose: () => void
}

export function AgentPromptEditor({
  projectId,
  agentType,
  agentName,
  model,
  open,
  onClose
}: AgentPromptEditorProps) {
  // Content state
  const [defaultContent, setDefaultContent] = useState<string>('')
  const [overrideContent, setOverrideContent] = useState<string>('')
  const [originalOverride, setOriginalOverride] = useState<string | null>(null)

  // Loading states
  const [isLoadingDefault, setIsLoadingDefault] = useState(false)
  const [isLoadingOverride, setIsLoadingOverride] = useState(false)

  // UI state
  const [activeTab, setActiveTab] = useState<'default' | 'override'>('override')
  const [showResetDialog, setShowResetDialog] = useState(false)
  const [showCloseDialog, setShowCloseDialog] = useState(false)

  // Mutations
  const saveOverride = useSaveAgentOverride()
  const deleteOverride = useDeleteAgentOverride()

  // Derived state
  const hasUnsavedChanges = overrideContent !== (originalOverride ?? '')
  const isCustomized = originalOverride !== null

  // Fetch content when opened
  useEffect(() => {
    if (!open) return

    // Reset state
    setDefaultContent('')
    setOverrideContent('')
    setOriginalOverride(null)

    // Fetch default prompt
    setIsLoadingDefault(true)
    api
      .getAgentDefault(projectId, agentType)
      .then((res) => setDefaultContent(res.content))
      .catch((err) => {
        console.error('Failed to fetch default prompt:', err)
        toast.error('Failed to load default prompt')
      })
      .finally(() => setIsLoadingDefault(false))

    // Fetch override (may 404 if none exists)
    setIsLoadingOverride(true)
    api
      .getAgentOverride(projectId, agentType)
      .then((res) => {
        setOverrideContent(res.content)
        setOriginalOverride(res.content)
      })
      .catch(() => {
        // No override exists - that's fine
        setOverrideContent('')
        setOriginalOverride(null)
      })
      .finally(() => setIsLoadingOverride(false))
  }, [open, projectId, agentType])

  // Render markdown for default prompt
  const renderedDefault = useMemo(() => {
    if (!defaultContent) return ''
    return renderMarkdown(defaultContent)
  }, [defaultContent])

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose()
      }
    }

    if (open) {
      window.addEventListener('keydown', handleKeyDown)
      return () => window.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, hasUnsavedChanges])

  // Close handler with unsaved changes check
  const handleClose = useCallback(() => {
    if (hasUnsavedChanges) {
      setShowCloseDialog(true)
    } else {
      onClose()
    }
  }, [hasUnsavedChanges, onClose])

  // Copy default to override
  const handleCopyFromDefault = useCallback(() => {
    setOverrideContent(defaultContent)
    toast.success('Copied default prompt to override')
  }, [defaultContent])

  // Save override
  const handleSave = useCallback(async () => {
    try {
      await saveOverride.mutateAsync({
        projectId,
        agentType,
        content: overrideContent
      })
      setOriginalOverride(overrideContent)
      toast.success('Override saved')
    } catch (err) {
      console.error('Failed to save override:', err)
      toast.error('Failed to save override')
    }
  }, [projectId, agentType, overrideContent, saveOverride])

  // Reset to default (delete override)
  const handleReset = useCallback(async () => {
    try {
      await deleteOverride.mutateAsync({ projectId, agentType })
      setOverrideContent('')
      setOriginalOverride(null)
      setShowResetDialog(false)
      toast.success('Reset to default')
    } catch (err) {
      console.error('Failed to reset override:', err)
      toast.error('Failed to reset override')
    }
  }, [projectId, agentType, deleteOverride])

  if (!open) return null

  const isLoading = isLoadingDefault || isLoadingOverride
  const isSaving = saveOverride.isPending
  const isResetting = deleteOverride.isPending

  return (
    <>
      <div className="fullscreen-modal fixed inset-0 z-50 bg-black/80">
        <div className="bg-bg-secondary w-full h-full flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-accent" />
              <h2 className="text-lg font-semibold text-text-primary">
                {agentName}
              </h2>
              {model && (
                <Badge variant="outline" className="ml-2">
                  {model}
                </Badge>
              )}
              {isCustomized && (
                <Badge className="ml-2 bg-accent/20 text-accent border-accent/30">
                  Customized
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyFromDefault}
                disabled={isLoading || isSaving}
              >
                <Copy className="h-4 w-4 mr-1" />
                Copy Default
              </Button>
              {isCustomized && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowResetDialog(true)}
                  disabled={isLoading || isSaving || isResetting}
                >
                  <RotateCcw className="h-4 w-4 mr-1" />
                  Reset
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={handleClose}
                className="text-text-muted hover:text-text-primary"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
          </div>

          {/* Mobile Tabs */}
          <div className="md:hidden border-b border-border shrink-0">
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'default' | 'override')}>
              <TabsList className="w-full">
                <TabsTrigger value="default" className="flex-1">Default</TabsTrigger>
                <TabsTrigger value="override" className="flex-1">
                  Override
                  {hasUnsavedChanges && <span className="ml-1 text-accent">*</span>}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* Content area - split pane */}
          <div className="flex-1 flex min-h-0">
            {/* Left pane - Default prompt (read-only) */}
            <div className={cn(
              "flex-1 md:w-1/2 border-r border-border flex flex-col min-w-0",
              activeTab !== 'default' && 'hidden md:flex'
            )}>
              <div className="px-4 py-2 border-b border-border bg-bg-tertiary">
                <span className="text-xs font-medium text-text-muted uppercase tracking-wide">
                  Default Prompt
                </span>
              </div>
              <ScrollArea className="flex-1 min-h-0">
                <div className="p-4">
                  {isLoadingDefault ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-5 w-5 animate-spin text-text-muted" />
                    </div>
                  ) : defaultContent ? (
                    <div
                      className="prose prose-sm prose-invert max-w-none text-text-secondary
                        [&_p]:my-2 [&_ul]:my-2 [&_ol]:my-2 [&_li]:my-0
                        [&_a]:text-accent [&_a]:no-underline hover:[&_a]:underline
                        [&_code]:bg-bg-tertiary [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded
                        [&_pre]:bg-bg-tertiary [&_pre]:p-3 [&_pre]:rounded [&_pre]:overflow-x-auto
                        [&_h1]:text-lg [&_h1]:text-text-primary [&_h1]:mt-4 [&_h1]:mb-2
                        [&_h2]:text-base [&_h2]:text-text-primary [&_h2]:mt-4 [&_h2]:mb-2
                        [&_h3]:text-sm [&_h3]:text-text-primary [&_h3]:mt-3 [&_h3]:mb-1
                        [&_blockquote]:border-l-2 [&_blockquote]:border-accent [&_blockquote]:pl-4 [&_blockquote]:italic
                        [&_table]:w-full [&_th]:text-left [&_th]:p-2 [&_th]:border-b [&_th]:border-border
                        [&_td]:p-2 [&_td]:border-b [&_td]:border-border"
                      dangerouslySetInnerHTML={{ __html: renderedDefault }}
                    />
                  ) : (
                    <p className="text-sm text-text-muted italic py-4">No default prompt found</p>
                  )}
                </div>
              </ScrollArea>
            </div>

            {/* Right pane - Override editor */}
            <div className={cn(
              "flex-1 md:w-1/2 flex flex-col min-h-0",
              activeTab !== 'override' && 'hidden md:flex'
            )}>
              <div className="px-4 py-2 border-b border-border bg-bg-tertiary">
                <span className="text-xs font-medium text-text-muted uppercase tracking-wide">
                  Override
                  {hasUnsavedChanges && <span className="ml-1 text-accent">*</span>}
                </span>
              </div>
              <div className="flex-1 min-h-0 flex flex-col">
                {isLoadingOverride ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-text-muted" />
                  </div>
                ) : (
                  <textarea
                    value={overrideContent}
                    onChange={(e) => setOverrideContent(e.target.value)}
                    placeholder="Enter your custom prompt override here..."
                    className="flex-1 w-full p-4 bg-transparent text-text-primary text-sm font-mono resize-none focus:outline-none"
                    disabled={isSaving}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between p-4 border-t border-border shrink-0">
            <div className="text-sm text-text-muted">
              {hasUnsavedChanges && (
                <span className="flex items-center gap-1 text-accent">
                  <AlertTriangle className="h-4 w-4" />
                  You have unsaved changes
                </span>
              )}
            </div>
            <Button
              onClick={handleSave}
              disabled={!hasUnsavedChanges || isSaving}
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save'
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Reset Confirmation Dialog */}
      <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-accent-red" />
              Reset to Default?
            </DialogTitle>
            <DialogDescription>
              This will delete your custom override for "{agentName}" and revert to the default prompt.
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowResetDialog(false)}
              disabled={isResetting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReset}
              disabled={isResetting}
            >
              {isResetting ? 'Resetting...' : 'Reset to Default'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Close with Unsaved Changes Dialog */}
      <Dialog open={showCloseDialog} onOpenChange={setShowCloseDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-accent" />
              Unsaved Changes
            </DialogTitle>
            <DialogDescription>
              You have unsaved changes. Are you sure you want to close without saving?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCloseDialog(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setShowCloseDialog(false)
                onClose()
              }}
            >
              Discard Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
