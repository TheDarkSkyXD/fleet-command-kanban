import { useState, useCallback, useEffect, useRef } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { SettingsSection } from './SettingsSection'
import { ProjectIconPicker } from './ProjectIconPicker'
import { ProjectColorPicker } from './ProjectColorPicker'
import { useProjects, useTemplates, useUpdateProject, useDeleteProject } from '@/hooks/queries'
import { useTemplateStatus } from '@/hooks/useTemplateStatus'
import { ChangelogModal } from '@/components/ChangelogModal'
import { api } from '@/api/client'

interface ConfigurePageProps {
  projectId: string
}

export function ConfigurePage({ projectId }: ConfigurePageProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: projects } = useProjects()
  const { data: templates } = useTemplates()
  const updateProject = useUpdateProject()
  const deleteProject = useDeleteProject()

  const project = projects?.find(p => p.id === projectId)

  // Derive the default ticket prefix from the project name (same logic as backend)
  const defaultTicketPrefix = (project?.displayName || project?.id || 'TKT')
    .replace(/[^a-zA-Z0-9]/g, '')
    .substring(0, 3)
    .toUpperCase() || 'TKT'

  // Local state for form fields
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('package')
  const [color, setColor] = useState<string | undefined>(undefined)
  const [selectedTemplate, setSelectedTemplate] = useState<string>('')
  const [branchPrefix, setBranchPrefix] = useState('fleet')
  const [branchPrefixError, setBranchPrefixError] = useState<string | null>(null)
  const [ticketPrefix, setTicketPrefix] = useState('')
  const [ticketPrefixError, setTicketPrefixError] = useState<string | null>(null)
  const [agentName, setAgentName] = useState('')

  // Validate branch prefix (git-safe characters only)
  const isValidBranchPrefix = (prefix: string): boolean => {
    if (!prefix) return true
    return /^[a-zA-Z0-9/_-]+$/.test(prefix)
  }

  // Validate ticket prefix (letters only, 2-5 chars)
  const isValidTicketPrefix = (prefix: string): boolean => {
    if (!prefix) return true
    return /^[a-zA-Z]{2,5}$/.test(prefix)
  }

  // Dialog states
  const [showTemplateDialog, setShowTemplateDialog] = useState(false)
  const [pendingTemplate, setPendingTemplate] = useState<string>('')
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isChangingTemplate, setIsChangingTemplate] = useState(false)
  const [showChangelog, setShowChangelog] = useState(false)
  const { data: templateStatus } = useTemplateStatus(projectId)

  // Track whether we've done the initial sync for this project
  const initializedRef = useRef<string | null>(null)

  // Sync local state from project data — only on initial load or project change
  useEffect(() => {
    if (project && initializedRef.current !== project.id) {
      initializedRef.current = project.id
      setName(project.displayName || project.id)
      setIcon(project.icon || 'package')
      setColor(project.color)
      setSelectedTemplate(project.template?.name || '')
      setBranchPrefix(project.branchPrefix || 'fleet')
      setBranchPrefixError(null)
      setTicketPrefix(project.ticketPrefix || '')
      setTicketPrefixError(null)
      setAgentName(project.agentName || '')
    }
  }, [project])

  // Save name on blur
  const handleNameBlur = useCallback(() => {
    if (!project) return
    const newName = name.trim()
    if (newName && newName !== (project.displayName || project.id)) {
      api.updateProject(projectId, { displayName: newName }).then(() => {
        queryClient.invalidateQueries({ queryKey: ['projects'] })
      })
    }
  }, [name, project, projectId, queryClient])

  // Save name on Enter
  const handleNameKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur()
    }
  }, [])

  // Handle branch prefix change with validation
  const handleBranchPrefixChange = useCallback((value: string) => {
    setBranchPrefix(value)
    if (!isValidBranchPrefix(value)) {
      setBranchPrefixError('Branch prefix can only contain letters, numbers, hyphens, underscores, and forward slashes')
    } else {
      setBranchPrefixError(null)
    }
  }, [])

  // Save branch prefix on blur
  const handleBranchPrefixBlur = useCallback(() => {
    if (!project) return
    if (branchPrefixError) return // Don't save if invalid
    const newPrefix = branchPrefix.trim() || 'fleet'
    if (newPrefix !== (project.branchPrefix || 'fleet')) {
      api.updateProject(projectId, { branchPrefix: newPrefix }).then(() => {
        queryClient.invalidateQueries({ queryKey: ['projects'] })
      })
    }
  }, [branchPrefix, branchPrefixError, project, projectId, queryClient])

  // Save branch prefix on Enter
  const handleBranchPrefixKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur()
    }
  }, [])

  // Handle ticket prefix change with validation
  const handleTicketPrefixChange = useCallback((value: string) => {
    setTicketPrefix(value)
    if (!isValidTicketPrefix(value)) {
      setTicketPrefixError('Ticket prefix must be 2-5 letters only')
    } else {
      setTicketPrefixError(null)
    }
  }, [])

  // Save ticket prefix on blur
  const handleTicketPrefixBlur = useCallback(() => {
    if (!project) return
    if (ticketPrefixError) return
    const newPrefix = ticketPrefix.trim().toUpperCase()
    const currentPrefix = project.ticketPrefix || ''
    if (newPrefix !== currentPrefix) {
      api.updateProject(projectId, { ticketPrefix: newPrefix || undefined }).then(() => {
        queryClient.invalidateQueries({ queryKey: ['projects'] })
      })
    }
  }, [ticketPrefix, ticketPrefixError, project, projectId, queryClient])

  // Save ticket prefix on Enter
  const handleTicketPrefixKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur()
    }
  }, [])

  // Save agent name on blur
  const handleAgentNameBlur = useCallback(() => {
    if (!project) return
    const newName = agentName.trim()
    const currentName = project.agentName || ''
    if (newName !== currentName) {
      api.updateProject(projectId, { agentName: newName || undefined }).then(() => {
        queryClient.invalidateQueries({ queryKey: ['projects'] })
      })
    }
  }, [agentName, project, projectId, queryClient])

  // Save agent name on Enter
  const handleAgentNameKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur()
    }
  }, [])

  // Save icon immediately on click
  const handleIconChange = useCallback((newIcon: string) => {
    setIcon(newIcon)
    updateProject.mutate({ id: projectId, updates: { icon: newIcon } })
  }, [projectId, updateProject])

  // Save color immediately on click
  const handleColorChange = useCallback((newColor: string) => {
    setColor(newColor)
    updateProject.mutate({ id: projectId, updates: { color: newColor } })
  }, [projectId, updateProject])

  // Template change with confirmation
  const handleTemplateChange = useCallback((templateName: string) => {
    if (templateName !== selectedTemplate) {
      setPendingTemplate(templateName)
      setShowTemplateDialog(true)
    }
  }, [selectedTemplate])

  const confirmTemplateChange = useCallback(async () => {
    setIsChangingTemplate(true)
    try {
      await api.setProjectTemplate(projectId, pendingTemplate)
      setSelectedTemplate(pendingTemplate)
      // Invalidate queries to refresh project data
      await queryClient.invalidateQueries({ queryKey: ['projects'] })
      await queryClient.invalidateQueries({ queryKey: ['projectPhases', projectId] })
      setShowTemplateDialog(false)
    } catch (error) {
      console.error('Failed to change template:', error)
    } finally {
      setIsChangingTemplate(false)
    }
  }, [projectId, pendingTemplate, queryClient])

  // Delete with confirmation
  const confirmDelete = useCallback(async () => {
    setIsDeleting(true)
    try {
      await deleteProject.mutateAsync(projectId)
      navigate({ to: '/' })
    } catch (error) {
      console.error('Failed to delete project:', error)
      setIsDeleting(false)
    }
  }, [projectId, deleteProject, navigate])

  if (!project) {
    return (
      <div className="p-6">
        <p className="text-text-secondary">Project not found</p>
      </div>
    )
  }

  return (
    <div className="@container h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto p-6 pb-12">
        <div className="space-y-2">
        {/* Project Name */}
        <SettingsSection
          title="Project Name"
          description="The display name for this project in the sidebar and headers."
        >
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={handleNameBlur}
            onKeyDown={handleNameKeyDown}
            placeholder="Enter project name"
            className="max-w-md"
          />
        </SettingsSection>

        {/* Agent Name */}
        <SettingsSection
          title="Agent Name"
          description="The display name for the AI agent in brainstorm chats. Defaults to 'Potato' if empty."
        >
          <Input
            value={agentName}
            onChange={(e) => setAgentName(e.target.value)}
            onBlur={handleAgentNameBlur}
            onKeyDown={handleAgentNameKeyDown}
            placeholder="Potato"
            className="max-w-md"
          />
        </SettingsSection>

        {/* Ticket Prefix */}
        <SettingsSection
          title="Ticket Prefix"
          description="Custom prefix for ticket IDs. Leave empty to auto-generate from the project name."
        >
          <div className="space-y-2">
            <Input
              value={ticketPrefix}
              onChange={(e) => handleTicketPrefixChange(e.target.value)}
              onBlur={handleTicketPrefixBlur}
              onKeyDown={handleTicketPrefixKeyDown}
              placeholder={defaultTicketPrefix}
              className="max-w-md uppercase"
            />
            {ticketPrefixError ? (
              <p className="text-sm text-accent-red">{ticketPrefixError}</p>
            ) : (
              <p className="text-sm text-text-secondary">
                Tickets will be named: {(ticketPrefix || defaultTicketPrefix).toUpperCase()}-1, {(ticketPrefix || defaultTicketPrefix).toUpperCase()}-2, ...
              </p>
            )}
          </div>
        </SettingsSection>

        {/* Branch Prefix */}
        <SettingsSection
          title="Branch Prefix"
          description="Custom prefix for git branches created by tickets. The ticket ID will be appended after a slash."
        >
          <div className="space-y-2">
            <Input
              value={branchPrefix}
              onChange={(e) => handleBranchPrefixChange(e.target.value)}
              onBlur={handleBranchPrefixBlur}
              onKeyDown={handleBranchPrefixKeyDown}
              placeholder="fleet"
              className="max-w-md"
            />
            {branchPrefixError ? (
              <p className="text-sm text-accent-red">{branchPrefixError}</p>
            ) : (
              <p className="text-sm text-text-secondary">
                Branches will be named: {branchPrefix || 'fleet'}/{(ticketPrefix || defaultTicketPrefix).toUpperCase()}-XX
              </p>
            )}
          </div>
        </SettingsSection>

        {/* Template */}
        <SettingsSection
          title="Template"
          description="The workflow template used for this project. Changing the template will reset the project phases."
        >
          <Select value={selectedTemplate} onValueChange={handleTemplateChange}>
            <SelectTrigger className="max-w-md">
              <SelectValue placeholder="Select a template" />
            </SelectTrigger>
            <SelectContent>
              {templates?.map((template) => (
                <SelectItem key={template.name} value={template.name}>
                  {template.name}
                  {template.isDefault && ' (default)'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* Version display */}
          {templateStatus?.current ? (
            <p className="mt-2 text-sm text-text-secondary">
              v{templateStatus.current} ·{' '}
              <button
                onClick={() => setShowChangelog(true)}
                className="text-blue-400 hover:text-blue-300 hover:underline"
              >
                View Changelog
              </button>
            </p>
          ) : selectedTemplate ? null : (
            <p className="mt-2 text-sm text-text-secondary">
              No template selected
            </p>
          )}
        </SettingsSection>

        {/* Project Color */}
        <SettingsSection
          title="Project Color"
          description="Choose a color for the project icon and name in the sidebar."
        >
          <ProjectColorPicker
            value={color}
            onChange={handleColorChange}
            disabled={updateProject.isPending}
          />
        </SettingsSection>

        {/* Project Icon */}
        <SettingsSection
          title="Project Icon"
          description="Choose an icon to help identify this project."
        >
          <ProjectIconPicker
            value={icon}
            onChange={handleIconChange}
            disabled={updateProject.isPending}
            projectColor={color}
          />
        </SettingsSection>

        {/* Danger Zone */}
        <SettingsSection
          title="Danger Zone"
          description="Permanently delete this project. This action cannot be undone."
          danger
        >
          <Button
            variant="destructive"
            onClick={() => setShowDeleteDialog(true)}
          >
            Delete Project
          </Button>
        </SettingsSection>
        </div>
      </div>

      {/* Template Change Confirmation Dialog */}
      <Dialog open={showTemplateDialog} onOpenChange={setShowTemplateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Template?</DialogTitle>
            <DialogDescription>
              Changing the template to "{pendingTemplate}" will reset the project phases.
              Existing tickets will remain but may need to be moved to new phases.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowTemplateDialog(false)}
              disabled={isChangingTemplate}
            >
              Cancel
            </Button>
            <Button
              onClick={confirmTemplateChange}
              disabled={isChangingTemplate}
            >
              {isChangingTemplate ? 'Changing...' : 'Change Template'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-accent-red" />
              Delete Project?
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{project.displayName || project.id}"?
              This will remove the project from Fleet Command but will not delete
              any files from your filesystem. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting...' : 'Delete Project'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Changelog Modal */}
      {showChangelog && (
        <ChangelogModal
          projectId={projectId}
          onClose={() => setShowChangelog(false)}
        />
      )}
    </div>
  )
}
