import { useState, useEffect, useMemo } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { Check, Copy, FileText, Loader2, X } from 'lucide-react'
import { api } from '@/api/client'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ArtifactChat } from './ArtifactChat'
import type { Artifact } from '@potato-cannon/shared'

interface ArtifactViewerFullProps {
  projectId: string
  ticketId: string
  artifact: Artifact | null
  onClose: () => void
}

export function ArtifactViewerFull({
  projectId,
  ticketId,
  artifact,
  onClose
}: ArtifactViewerFullProps) {
  const [content, setContent] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'document' | 'chat'>('document')
  const [copied, setCopied] = useState(false)

  // Clean up copy timeout on unmount
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])

  const handleCopy = () => {
    navigator.clipboard.writeText(content)
      .then(() => {
        setCopied(true)
        toast.success('Copied to clipboard!')
      })
      .catch(() => {
        toast.error('Failed to copy to clipboard')
      })
  }

  // Fetch artifact content when artifact changes
  useEffect(() => {
    if (!artifact) {
      setContent('')
      setError(null)
      return
    }

    setIsLoading(true)
    setError(null)
    setContent('')

    api
      .getTicketArtifact(projectId, ticketId, artifact.filename)
      .then((text) => {
        setContent(text)
      })
      .catch((err) => {
        console.error('Failed to fetch artifact:', err)
        setError(err instanceof Error ? err.message : 'Failed to fetch artifact')
      })
      .finally(() => {
        setIsLoading(false)
      })
  }, [projectId, ticketId, artifact])

  // Render markdown content
  const renderedContent = useMemo(() => {
    if (!content) return ''
    const html = marked(content) as string
    return DOMPurify.sanitize(html)
  }, [content])

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    if (artifact) {
      window.addEventListener('keydown', handleKeyDown)
      return () => window.removeEventListener('keydown', handleKeyDown)
    }
  }, [artifact, onClose])

  if (!artifact) return null

  return (
    <div
      className="fullscreen-modal fixed inset-0 z-50 bg-black/80"
    >
      <div className="bg-bg-secondary w-full h-full flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-text-muted" />
            <h2 className="text-lg font-semibold text-text-primary">
              {artifact.filename}
            </h2>
            {artifact.type && (
              <Badge variant="outline" className="ml-2">
                {artifact.type}
              </Badge>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="text-text-muted hover:text-text-primary"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Mobile Tabs - visible only below md breakpoint */}
        <div className="md:hidden border-b border-border shrink-0">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'document' | 'chat')}>
            <TabsList className="w-full">
              <TabsTrigger value="document" className="flex-1">Document</TabsTrigger>
              <TabsTrigger value="chat" className="flex-1">Chat</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Content area - split pane */}
        <div className="flex-1 flex min-h-0">
          {/* Left pane - Artifact content */}
          <div className={cn(
            "flex-1 md:w-[60%] border-r border-border flex flex-col min-w-0",
            activeTab !== 'document' && 'hidden md:flex'
          )}>
            <div className="px-4 py-2 border-b border-border bg-bg-tertiary">
              <span className="text-xs font-medium text-text-muted uppercase tracking-wide">
                Document
              </span>
              {artifact.description && (
                <p className="text-xs text-text-muted mt-1">{artifact.description}</p>
              )}
            </div>
            <div className="relative group/content flex-1 min-h-0 flex flex-col">
              <ScrollArea className="flex-1 min-h-0">
                <div className="p-4 relative">
                  {content && !isLoading && !error && (
                    <button
                      onClick={handleCopy}
                      aria-label="Copy to clipboard"
                      className="absolute top-6 right-4 z-10 p-1.5 rounded-md
                        bg-bg-tertiary/80 backdrop-blur-sm border border-border
                        text-text-muted hover:text-text-primary
                        opacity-0 group-hover/content:opacity-100
                        transition-opacity cursor-pointer"
                    >
                      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </button>
                  )}
                  {isLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-5 w-5 animate-spin text-text-muted" />
                    </div>
                  ) : error ? (
                    <div className="text-sm text-accent-red py-4">{error}</div>
                  ) : content ? (
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
                      dangerouslySetInnerHTML={{ __html: renderedContent }}
                    />
                  ) : (
                    <p className="text-sm text-text-muted italic py-4">No content</p>
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>

          {/* Right pane - Chat */}
          <div className={cn(
            "w-full md:w-[40%] flex flex-col min-h-0",
            activeTab !== 'chat' && 'hidden md:flex'
          )}>
            <ArtifactChat
              projectId={projectId}
              ticketId={ticketId}
              artifactFilename={artifact.filename}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
