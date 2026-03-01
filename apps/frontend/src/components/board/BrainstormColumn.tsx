import { Lightbulb, Plus } from 'lucide-react'
import { useBrainstorms } from '@/hooks/queries'
import { useAppStore } from '@/stores/appStore'
import { IconButton } from '@/components/ui/icon-button'
import { BrainstormCard } from './BrainstormCard'

interface BrainstormColumnProps {
  projectId: string
}

export function BrainstormColumn({ projectId }: BrainstormColumnProps) {
  const { data: brainstorms } = useBrainstorms(projectId)
  const openNewBrainstormSheet = useAppStore((s) => s.openNewBrainstormSheet)

  return (
    <div className="flex-shrink-0 w-[280px] md:w-[320px] h-full bg-bg-secondary rounded-lg flex flex-col">
      {/* Column Header */}
      <div className="flex items-center justify-between p-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-accent-yellow" />
          <h3 className="text-text-secondary font-semibold text-[13px]">Brainstorm</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-text-muted text-xs bg-bg-tertiary px-2 py-0.5 rounded-[10px]">
            {brainstorms?.length ?? 0}
          </span>
          <IconButton tooltip="New brainstorm" onClick={() => openNewBrainstormSheet(projectId)}>
            <Plus className="h-4 w-4" />
          </IconButton>
        </div>
      </div>

      {/* Brainstorm Cards */}
      <div className="flex-1 p-2 overflow-y-auto min-h-[100px]">
        <div className="flex flex-col gap-0">
          {brainstorms?.map((brainstorm) => (
            <BrainstormCard
              key={brainstorm.id}
              brainstorm={brainstorm}
              projectId={projectId}
            />
          ))}
          {(!brainstorms || brainstorms.length === 0) && (
            <div className="text-center text-text-muted text-xs py-8">
              No brainstorms yet
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
