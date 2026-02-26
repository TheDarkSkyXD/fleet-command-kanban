import { useDroppable } from '@dnd-kit/core'
import { cn } from '@/lib/utils'

interface UngroupedDropZoneProps {
  children: React.ReactNode
}

export function UngroupedDropZone({ children }: UngroupedDropZoneProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: 'ungrouped',
    data: { folderId: null },
  })

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'transition-colors rounded-md',
        isOver && 'ring-2 ring-accent/50 bg-accent/5'
      )}
    >
      {children}
    </div>
  )
}
