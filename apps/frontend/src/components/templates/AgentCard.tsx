import { useState } from 'react'
import { ChevronDown, ChevronRight, Trash2, Upload, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { api } from '@/api/client'
import type { TemplateAgent } from '@fleet-command/shared'

interface AgentCardProps {
  agent: TemplateAgent
  templateName: string
  onChange: (agent: TemplateAgent) => void
  onDelete: () => void
}

/**
 * Get badge styling for agent role
 */
function getRoleBadge(role: TemplateAgent['role']): { label: string; className: string } {
  switch (role) {
    case 'primary':
      return { label: 'Primary', className: 'bg-blue-500/20 text-blue-400 border-blue-500/30' }
    case 'adversarial':
      return { label: 'Adversarial', className: 'bg-orange-500/20 text-orange-400 border-orange-500/30' }
    case 'validation':
      return { label: 'Validation', className: 'bg-green-500/20 text-green-400 border-green-500/30' }
    default:
      return { label: role, className: '' }
  }
}

/**
 * Collapsible card for configuring an agent
 */
export function AgentCard({
  agent,
  templateName,
  onChange,
  onDelete
}: AgentCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [isLoadingPrompt, setIsLoadingPrompt] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const roleBadge = getRoleBadge(agent.role)

  const handleLoadFromFile = async () => {
    if (!agent.type) {
      setLoadError('Agent type/path is required to load prompt')
      return
    }

    setIsLoadingPrompt(true)
    setLoadError(null)

    try {
      const content = await api.getAgentPrompt(templateName, agent.type)
      onChange({ ...agent, prompt: content })
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load prompt')
    } finally {
      setIsLoadingPrompt(false)
    }
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Header */}
      <button
        type="button"
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
        <Badge variant="outline" className={cn('text-xs', roleBadge.className)}>
          {roleBadge.label}
        </Badge>
        <span className="flex-1 text-left text-sm truncate">
          {agent.type || 'Untitled Agent'}
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          className="shrink-0 text-muted-foreground hover:text-destructive"
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </button>

      {/* Expanded Content */}
      {expanded && (
        <div className="px-3 pb-3 pt-1 space-y-3 border-t">
          {/* Role */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Role</label>
            <Select
              value={agent.role}
              onValueChange={(value) => onChange({ ...agent, role: value as TemplateAgent['role'] })}
            >
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="primary">Primary</SelectItem>
                <SelectItem value="adversarial">Adversarial</SelectItem>
                <SelectItem value="validation">Validation</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Type/Path */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Type / Path</label>
            <Input
              value={agent.type}
              onChange={(e) => onChange({ ...agent, type: e.target.value })}
              placeholder="e.g., refinement/primary"
              className="h-8"
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Description</label>
            <Input
              value={agent.description ?? ''}
              onChange={(e) => onChange({ ...agent, description: e.target.value })}
              placeholder="What does this agent do?"
              className="h-8"
            />
          </div>

          {/* Context Artifacts */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Context Artifacts</label>
            <Input
              value={agent.context?.artifacts?.join(', ') ?? ''}
              onChange={(e) => onChange({
                ...agent,
                context: {
                  ...agent.context,
                  artifacts: e.target.value ? e.target.value.split(',').map(s => s.trim()) : undefined
                }
              })}
              placeholder="Comma-separated artifact names"
              className="h-8"
            />
          </div>

          {/* Prompt */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">Prompt</label>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={handleLoadFromFile}
                disabled={isLoadingPrompt}
              >
                {isLoadingPrompt ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Upload className="h-3 w-3" />
                )}
                Load from file
              </Button>
            </div>
            <Textarea
              value={agent.prompt ?? ''}
              onChange={(e) => onChange({ ...agent, prompt: e.target.value })}
              placeholder="Agent prompt content..."
              rows={6}
              className="text-sm font-mono"
            />
            {loadError && (
              <p className="text-xs text-destructive">{loadError}</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
