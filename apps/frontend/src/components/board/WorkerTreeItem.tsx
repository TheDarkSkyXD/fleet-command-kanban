import { Bot, RotateCcw, ListChecks, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import type { WorkerNode } from '@fleet-command/shared'

interface WorkerTreeItemProps {
  node: WorkerNode
  depth: number
  isLastChild: boolean
  onAgentClick: (agentType: string, agentName: string, model?: string) => void
}

export function WorkerTreeItem({
  node,
  depth,
  isLastChild,
  onAgentClick
}: WorkerTreeItemProps) {
  const isAgent = node.type === 'agent'
  const isLoop = node.type === 'ralphLoop' || node.type === 'taskLoop'

  // Format display name from agentType or id
  const displayName = node.agentType
    ? node.agentType
        .split('-')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')
    : node.id
        .split('-')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')

  const handleClick = () => {
    if (isAgent && node.agentType) {
      onAgentClick(node.agentType, displayName, node.model)
    }
  }

  // Get icon based on type
  const Icon = isAgent ? Bot : node.type === 'taskLoop' ? ListChecks : RotateCcw

  return (
    <div className="relative">
      {/* Tree connector lines */}
      {depth > 0 && (
        <>
          {/* Vertical line from parent */}
          <div
            className="absolute border-l border-border"
            style={{
              left: `${(depth - 1) * 20 + 10}px`,
              top: 0,
              height: isLastChild ? '14px' : '100%'
            }}
          />
          {/* Horizontal line to node */}
          <div
            className="absolute border-t border-border"
            style={{
              left: `${(depth - 1) * 20 + 10}px`,
              top: '14px',
              width: '10px'
            }}
          />
        </>
      )}

      {/* Node content */}
      <div
        className={cn(
          'flex items-center gap-2 py-1.5 px-2 rounded-md',
          isAgent && 'cursor-pointer hover:bg-bg-hover transition-colors',
          !isAgent && 'text-text-muted'
        )}
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
        onClick={handleClick}
        role={isAgent ? 'button' : undefined}
        tabIndex={isAgent ? 0 : undefined}
        onKeyDown={
          isAgent
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  handleClick()
                }
              }
            : undefined
        }
      >
        <Icon className={cn('h-4 w-4 shrink-0', isAgent ? 'text-accent' : 'text-text-muted')} />

        <span className={cn('text-sm truncate', isAgent ? 'text-text-primary' : 'text-text-secondary')}>
          {displayName}
        </span>

        {/* Loop info */}
        {isLoop && node.maxAttempts && (
          <span className="text-xs text-text-muted">
            (max {node.maxAttempts})
          </span>
        )}

        {/* Model badge for agents */}
        {isAgent && node.model && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            {node.model}
          </Badge>
        )}

        {/* Customized badge */}
        {isAgent && node.hasOverride && (
          <Badge className="text-[10px] px-1.5 py-0 bg-accent/20 text-accent border-accent/30">
            Customized
          </Badge>
        )}

        {/* Chevron for clickable agents */}
        {isAgent && node.agentType && (
          <ChevronRight className="h-3 w-3 text-text-muted ml-auto shrink-0" />
        )}
      </div>

      {/* Nested workers */}
      {isLoop && node.workers && node.workers.length > 0 && (
        <div>
          {node.workers.map((child, index) => (
            <WorkerTreeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              isLastChild={index === node.workers!.length - 1}
              onAgentClick={onAgentClick}
            />
          ))}
        </div>
      )}
    </div>
  )
}
