import { useState, useCallback, useMemo, useEffect } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  DndContext,
  DragEndEvent,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove
} from '@dnd-kit/sortable'
import { ArrowLeft, Plus, Save, Trash2, Loader2 } from 'lucide-react'
import { useTemplate, useUpdateTemplate, useDeleteTemplate } from '@/hooks/queries'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { PhaseCard } from './PhaseCard'
import { PhaseEditor } from './PhaseEditor'
import type { Template, TemplatePhase } from '@fleet-command/shared'

interface TemplateEditorProps {
  name: string
}

/**
 * Two-column template editor with phase management
 */
export function TemplateEditor({ name }: TemplateEditorProps) {
  const navigate = useNavigate()
  const { data: template, isLoading, error } = useTemplate(name)
  const updateTemplate = useUpdateTemplate()
  const deleteTemplateMutation = useDeleteTemplate()

  // Local state for editing
  const [localTemplate, setLocalTemplate] = useState<Template | null>(null)
  const [selectedPhaseId, setSelectedPhaseId] = useState<string | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [mobileTab, setMobileTab] = useState<'phases' | 'editor'>('phases')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // Initialize local template when data loads
  useEffect(() => {
    if (template && !localTemplate) {
      setLocalTemplate(template)
      // Auto-select first non-locked phase if available
      const firstEditablePhase = template.phases.find(
        (p) => p.id !== 'ideas' && p.id !== 'done'
      )
      if (firstEditablePhase) {
        setSelectedPhaseId(firstEditablePhase.id)
      } else if (template.phases.length > 0) {
        setSelectedPhaseId(template.phases[0].id)
      }
    }
  }, [template, localTemplate])

  // Sensors for drag and drop
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  )

  const selectedPhase = useMemo(() => {
    return localTemplate?.phases.find((p) => p.id === selectedPhaseId) ?? null
  }, [localTemplate, selectedPhaseId])

  // Check if a phase is locked (Ideas or Done)
  const isPhaseLockedById = useCallback((phaseId: string) => {
    return phaseId === 'ideas' || phaseId === 'done'
  }, [])

  // Get phases in display order (Ideas first, Done last, others in between)
  const orderedPhases = useMemo(() => {
    if (!localTemplate) return []
    const phases = [...localTemplate.phases]
    const ideas = phases.find((p) => p.id === 'ideas')
    const done = phases.find((p) => p.id === 'done')
    const others = phases.filter((p) => p.id !== 'ideas' && p.id !== 'done')
    return [ideas, ...others, done].filter(Boolean) as TemplatePhase[]
  }, [localTemplate])

  // Sortable phase IDs (excluding locked phases)
  const sortablePhaseIds = useMemo(() => {
    return orderedPhases
      .filter((p) => !isPhaseLockedById(p.id))
      .map((p) => p.id)
  }, [orderedPhases, isPhaseLockedById])

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id || !localTemplate) return

    const activeId = active.id as string
    const overId = over.id as string

    // Only reorder non-locked phases
    if (isPhaseLockedById(activeId) || isPhaseLockedById(overId)) return

    setLocalTemplate((prev) => {
      if (!prev) return prev

      // Compute sortable phase IDs from current state to avoid stale closure
      const currentSortableIds = prev.phases
        .filter((p) => !isPhaseLockedById(p.id))
        .map((p) => p.id)

      // Get indices in the sortable array
      const oldIndex = currentSortableIds.indexOf(activeId)
      const newIndex = currentSortableIds.indexOf(overId)
      if (oldIndex === -1 || newIndex === -1) return prev

      const newSortableOrder = arrayMove(currentSortableIds, oldIndex, newIndex)

      // Reconstruct phases array with Ideas first, Done last
      const ideas = prev.phases.find((p) => p.id === 'ideas')
      const done = prev.phases.find((p) => p.id === 'done')
      const reorderedMiddle = newSortableOrder.map(
        (id) => prev.phases.find((p) => p.id === id)!
      )

      return {
        ...prev,
        phases: [ideas, ...reorderedMiddle, done].filter(Boolean) as TemplatePhase[]
      }
    })
    setHasUnsavedChanges(true)
  }, [localTemplate, isPhaseLockedById])

  const handlePhaseSelect = useCallback((phaseId: string) => {
    setSelectedPhaseId(phaseId)
    setMobileTab('editor')
  }, [])

  const handlePhaseChange = useCallback((updatedPhase: TemplatePhase) => {
    setLocalTemplate((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        phases: prev.phases.map((p) =>
          p.id === updatedPhase.id ? updatedPhase : p
        )
      }
    })
    setHasUnsavedChanges(true)
  }, [])

  const handlePhaseDelete = useCallback((phaseId: string) => {
    setLocalTemplate((prev) => {
      if (!prev) return prev
      const newPhases = prev.phases.filter((p) => p.id !== phaseId)
      return { ...prev, phases: newPhases }
    })
    if (selectedPhaseId === phaseId) {
      setSelectedPhaseId(null)
    }
    setHasUnsavedChanges(true)
  }, [selectedPhaseId])

  const handleAddPhase = useCallback(() => {
    setLocalTemplate((prev) => {
      if (!prev) return prev

      // Generate unique ID
      const baseId = 'new-phase'
      let id = baseId
      let counter = 1
      while (prev.phases.some((p) => p.id === id)) {
        id = `${baseId}-${counter++}`
      }

      const newPhase: TemplatePhase = {
        id,
        name: 'New Phase',
        description: ''
      }

      // Insert before Done
      const doneIndex = prev.phases.findIndex((p) => p.id === 'done')
      const newPhases = [...prev.phases]
      if (doneIndex !== -1) {
        newPhases.splice(doneIndex, 0, newPhase)
      } else {
        newPhases.push(newPhase)
      }

      return { ...prev, phases: newPhases }
    })
    setHasUnsavedChanges(true)
  }, [])

  const handleSave = useCallback(async () => {
    if (!localTemplate) return

    setSaveError(null)
    try {
      await updateTemplate.mutateAsync({
        name: localTemplate.name,
        updates: {
          description: localTemplate.description,
          phases: localTemplate.phases
        }
      })
      setHasUnsavedChanges(false)
    } catch (err) {
      console.error('Failed to save template:', err)
      setSaveError(err instanceof Error ? err.message : 'Failed to save template')
    }
  }, [localTemplate, updateTemplate])

  const handleDelete = useCallback(async () => {
    setDeleteError(null)
    try {
      await deleteTemplateMutation.mutateAsync(name)
      navigate({ to: '/templates' })
    } catch (err) {
      console.error('Failed to delete template:', err)
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete template')
    }
  }, [name, deleteTemplateMutation, navigate])

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !localTemplate) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center text-destructive">
          <p>Failed to load template</p>
          <p className="text-sm text-muted-foreground mt-1">{error?.message}</p>
          <Button asChild variant="outline" className="mt-4">
            <Link to="/templates">Back to Templates</Link>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/templates">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-foreground">{localTemplate.name}</h1>
            <Badge variant="outline">v{localTemplate.version}</Badge>
            {hasUnsavedChanges && (
              <Badge variant="secondary" className="text-xs">Unsaved</Badge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDeleteDialogOpen(true)}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
            <span className="hidden sm:inline">Delete</span>
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={updateTemplate.isPending || !hasUnsavedChanges}
          >
            {updateTemplate.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            <span className="hidden sm:inline">Save</span>
          </Button>
        </div>
      </div>

      {/* Error Display */}
      {saveError && (
        <div className="px-4 py-2 bg-destructive/10 border-b border-destructive/20">
          <p className="text-sm text-destructive">{saveError}</p>
        </div>
      )}

      {/* Mobile Tabs */}
      <div className="md:hidden border-b shrink-0">
        <Tabs value={mobileTab} onValueChange={(v) => setMobileTab(v as 'phases' | 'editor')}>
          <TabsList className="w-full">
            <TabsTrigger value="phases" className="flex-1">Phases</TabsTrigger>
            <TabsTrigger value="editor" className="flex-1" disabled={!selectedPhase}>
              Editor
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Column - Phases List (Desktop: always visible, Mobile: only in phases tab) */}
        <div className={`w-full md:w-80 md:border-r flex flex-col shrink-0 ${mobileTab !== 'phases' ? 'hidden md:flex' : ''}`}>
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-2">
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={sortablePhaseIds}
                  strategy={verticalListSortingStrategy}
                >
                  {orderedPhases.map((phase) => (
                    <PhaseCard
                      key={phase.id}
                      phase={phase}
                      isSelected={phase.id === selectedPhaseId}
                      isLocked={isPhaseLockedById(phase.id)}
                      onSelect={() => handlePhaseSelect(phase.id)}
                      onDelete={() => handlePhaseDelete(phase.id)}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            </div>
          </ScrollArea>

          {/* Add Phase Button */}
          <div className="p-4 border-t shrink-0">
            <Button
              variant="outline"
              className="w-full"
              onClick={handleAddPhase}
            >
              <Plus className="h-4 w-4" />
              Add Phase
            </Button>
          </div>
        </div>

        {/* Right Column - Phase Editor (Desktop: always visible, Mobile: only in editor tab) */}
        <div className={`flex-1 overflow-hidden ${mobileTab !== 'editor' ? 'hidden md:block' : ''}`}>
          <ScrollArea className="h-full">
            <div className="p-4">
              {selectedPhase ? (
                <PhaseEditor
                  phase={selectedPhase}
                  templateName={localTemplate.name}
                  isLocked={isPhaseLockedById(selectedPhase.id)}
                  onChange={handlePhaseChange}
                />
              ) : (
                <div className="flex items-center justify-center h-64 text-muted-foreground">
                  Select a phase to edit
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Template</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{localTemplate.name}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {deleteError && (
            <div className="px-4 py-2 bg-destructive/10 rounded-md">
              <p className="text-sm text-destructive">{deleteError}</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteTemplateMutation.isPending}
            >
              {deleteTemplateMutation.isPending && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
