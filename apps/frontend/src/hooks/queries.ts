// src/hooks/queries.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { Ticket, Template, TemplatePhase } from '@fleet-command/shared'

// ============ Claude CLI ============

export function useClaudeStatus() {
  return useQuery({
    queryKey: ['claude-status'],
    queryFn: api.getClaudeStatus,
    staleTime: 60_000, // Check at most once per minute
    retry: 3, // Retry on failure (daemon might still be starting)
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10_000),
  })
}

// ============ Projects ============

export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: api.getProjects
  })
}

export function useAddProject() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ path, displayName }: { path: string; displayName?: string }) =>
      api.addProject(path, displayName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
    }
  })
}

export function useUpdateProject() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: { displayName?: string; icon?: string; color?: string; swimlaneColors?: Record<string, string>; wipLimits?: Record<string, number> | null; branchPrefix?: string; ticketPrefix?: string; folderId?: string | null } }) =>
      api.updateProject(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
    }
  })
}

export function useProjectBranch(projectId: string | null) {
  return useQuery({
    queryKey: ['project-branch', projectId],
    queryFn: () => api.getProjectBranch(projectId!),
    enabled: !!projectId,
    staleTime: 30_000,
  })
}

export function useToggleAutomatedPhase() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      projectId,
      phaseId,
      automated
    }: {
      projectId: string
      phaseId: string
      automated: boolean
    }) => api.toggleAutomatedPhase(projectId, phaseId, automated),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['tickets', projectId] })
    }
  })
}

export function useDeleteProject() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.deleteProject(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
    }
  })
}

// ============ Folders ============

export function useFolders() {
  return useQuery({
    queryKey: ['folders'],
    queryFn: api.getFolders
  })
}

export function useCreateFolder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => api.createFolder(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['folders'] })
    }
  })
}

export function useRenameFolder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      api.renameFolder(id, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['folders'] })
    }
  })
}

export function useDeleteFolder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.deleteFolder(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['folders'] })
    }
  })
}

// ============ Tickets ============

export function useTickets(projectId: string | null) {
  return useQuery({
    queryKey: ['tickets', projectId],
    queryFn: () => api.getTickets(projectId!),
    enabled: !!projectId
  })
}

export function useTicket(projectId: string | null, ticketId: string | null) {
  return useQuery({
    queryKey: ['ticket', projectId, ticketId],
    queryFn: () => api.getTicket(projectId!, ticketId!),
    enabled: !!projectId && !!ticketId
  })
}

export function useCreateTicket() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      projectId,
      title,
      description
    }: {
      projectId: string
      title: string
      description?: string
    }) => api.createTicket(projectId, title, description),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['tickets', projectId] })
    }
  })
}

export function useUpdateTicket() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      projectId,
      ticketId,
      updates
    }: {
      projectId: string
      ticketId: string
      updates: Partial<Ticket> & { force?: boolean }
    }) => api.updateTicket(projectId, ticketId, updates),
    onSuccess: (_, { projectId, ticketId }) => {
      queryClient.invalidateQueries({ queryKey: ['tickets', projectId] })
      queryClient.invalidateQueries({ queryKey: ['ticket', projectId, ticketId] })
    }
  })
}

export function useDeleteTicket() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ projectId, ticketId }: { projectId: string; ticketId: string }) =>
      api.deleteTicket(projectId, ticketId),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['tickets', projectId] })
    }
  })
}

export function useArchiveTicket() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ projectId, ticketId }: { projectId: string; ticketId: string }) =>
      api.archiveTicket(projectId, ticketId),
    onSuccess: (_, { projectId, ticketId }) => {
      queryClient.invalidateQueries({ queryKey: ['tickets', projectId] })
      queryClient.invalidateQueries({ queryKey: ['ticket', projectId, ticketId] })
      queryClient.invalidateQueries({ queryKey: ['archivedTickets', projectId] })
    }
  })
}

export function useRestoreTicket() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ projectId, ticketId }: { projectId: string; ticketId: string }) =>
      api.restoreTicket(projectId, ticketId),
    onSuccess: (_, { projectId, ticketId }) => {
      queryClient.invalidateQueries({ queryKey: ['tickets', projectId] })
      queryClient.invalidateQueries({ queryKey: ['ticket', projectId, ticketId] })
      queryClient.invalidateQueries({ queryKey: ['archivedTickets', projectId] })
    }
  })
}

export function useRestartTicket() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      projectId,
      ticketId,
      targetPhase
    }: {
      projectId: string
      ticketId: string
      targetPhase: string
    }) => api.restartTicketToPhase(projectId, ticketId, targetPhase),
    onSuccess: (_, { projectId, ticketId }) => {
      queryClient.invalidateQueries({ queryKey: ['ticket', projectId, ticketId] })
      queryClient.invalidateQueries({ queryKey: ['tickets', projectId] })
      queryClient.invalidateQueries({ queryKey: ['sessions'] })
      queryClient.invalidateQueries({ queryKey: ['tasks', ticketId] })
      queryClient.invalidateQueries({ queryKey: ['ticket-messages', projectId, ticketId] })
    }
  })
}

export function useArchivedTickets(projectId: string | null) {
  return useQuery({
    queryKey: ['archivedTickets', projectId],
    queryFn: () => api.getArchivedTickets(projectId!),
    enabled: !!projectId
  })
}

// ============ Sessions ============

export function useSessions() {
  return useQuery({
    queryKey: ['sessions'],
    queryFn: api.getSessions
  })
}

export function useSessionLog(sessionId: string | null) {
  return useQuery({
    queryKey: ['sessionLog', sessionId],
    queryFn: () => api.getSessionLog(sessionId!),
    enabled: !!sessionId
  })
}

export function useStopSession() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (sessionId: string) => api.stopSession(sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] })
    }
  })
}

// ============ Phases ============

export function usePhases() {
  return useQuery({
    queryKey: ['phases'],
    queryFn: api.getPhases
  })
}

export function useProjectPhases(projectId: string | null) {
  return useQuery({
    queryKey: ['projectPhases', projectId],
    queryFn: () => api.getProjectPhases(projectId!),
    enabled: !!projectId
  })
}

// ============ Brainstorms ============

export function useBrainstorms(projectId: string | null) {
  return useQuery({
    queryKey: ['brainstorms', projectId],
    queryFn: () => api.getBrainstorms(projectId!),
    enabled: !!projectId
  })
}

export function useCreateBrainstorm() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ projectId, name, initialMessage }: { projectId: string; name?: string; initialMessage?: string }) =>
      api.createBrainstorm(projectId, { name, initialMessage }),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['brainstorms', projectId] })
    }
  })
}

export function useDeleteBrainstorm() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ projectId, brainstormId }: { projectId: string; brainstormId: string }) =>
      api.deleteBrainstorm(projectId, brainstormId),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['brainstorms', projectId] })
    }
  })
}

// ============ Templates ============

export function useTemplates() {
  return useQuery({
    queryKey: ['templates'],
    queryFn: api.getTemplates
  })
}

export function useTemplate(name: string | null) {
  return useQuery({
    queryKey: ['template', name],
    queryFn: () => api.getTemplate(name!),
    enabled: !!name
  })
}

export function useCreateTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      name,
      description,
      phases
    }: {
      name: string
      description: string
      phases?: TemplatePhase[]
    }) => api.createTemplate(name, description, phases),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
    }
  })
}

export function useUpdateTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ name, updates }: { name: string; updates: Partial<Template> }) =>
      api.updateTemplate(name, updates),
    onSuccess: (_, { name }) => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      queryClient.invalidateQueries({ queryKey: ['template', name] })
    }
  })
}

export function useDeleteTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => api.deleteTemplate(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
    }
  })
}

// ============ Ticket Artifacts ============

export function useTicketArtifacts(projectId: string | null, ticketId: string | null) {
  return useQuery({
    queryKey: ['artifacts', projectId, ticketId],
    queryFn: () => api.getTicketArtifacts(projectId!, ticketId!),
    enabled: !!projectId && !!ticketId
  })
}

export function useUpdateArtifact(projectId: string | null, ticketId: string | null) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ filename, content }: { filename: string; content: string }) =>
      api.updateTicketArtifact(projectId!, ticketId!, filename, content),
    onSuccess: () => {
      // Invalidate the artifact list so version counts refresh
      queryClient.invalidateQueries({ queryKey: ['artifacts', projectId, ticketId] })
    },
  })
}

// ============ Ticket Conversations ============

export function useTicketConversations(projectId: string | null, ticketId: string | null) {
  return useQuery({
    queryKey: ['conversations', projectId, ticketId],
    queryFn: () => api.getTicketConversations(projectId!, ticketId!),
    enabled: !!projectId && !!ticketId
  })
}

// ============ Project Template Status ============

export function useProjectTemplateStatus(projectId: string | null) {
  return useQuery({
    queryKey: ['templateStatus', projectId],
    queryFn: () => api.getProjectTemplateStatus(projectId!),
    enabled: !!projectId
  })
}

// ============ Phase Workers ============

export function usePhaseWorkers(projectId: string | null, phase: string | null) {
  return useQuery({
    queryKey: ['phaseWorkers', projectId, phase],
    queryFn: () => api.getPhaseWorkers(projectId!, phase!),
    enabled: !!projectId && !!phase
  })
}

// ============ Agent Overrides ============

export function useSaveAgentOverride() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      projectId,
      agentType,
      content
    }: {
      projectId: string
      agentType: string
      content: string
    }) => api.saveAgentOverride(projectId, agentType, content),
    onSuccess: (_, { projectId }) => {
      // Invalidate all phase workers queries for this project to refresh hasOverride
      queryClient.invalidateQueries({ queryKey: ['phaseWorkers', projectId] })
    }
  })
}

export function useDeleteAgentOverride() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      projectId,
      agentType
    }: {
      projectId: string
      agentType: string
    }) => api.deleteAgentOverride(projectId, agentType),
    onSuccess: (_, { projectId }) => {
      // Invalidate all phase workers queries for this project to refresh hasOverride
      queryClient.invalidateQueries({ queryKey: ['phaseWorkers', projectId] })
    }
  })
}

// ─── Dev Server ─────────────────────────────────────────────

export function useDevServerStatus(projectId: string | null) {
  return useQuery({
    queryKey: ['devServerStatus', projectId],
    queryFn: () => api.getDevServerStatus(projectId!),
    enabled: !!projectId,
    refetchInterval: 5000
  })
}

export function useDevServerConfig(projectId: string | null) {
  return useQuery({
    queryKey: ['devServerConfig', projectId],
    queryFn: () => api.getDevServerConfig(projectId!),
    enabled: !!projectId
  })
}

export function useStartDevServer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ projectId, command }: { projectId: string; command?: string }) =>
      api.startDevServer(projectId, command),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['devServerStatus', projectId] })
    }
  })
}

export function useStopDevServer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (projectId: string) => api.stopDevServer(projectId),
    onSuccess: (_, projectId) => {
      queryClient.invalidateQueries({ queryKey: ['devServerStatus', projectId] })
    }
  })
}

// ─── Terminals ──────────────────────────────────────────────

export function useTerminals(projectId: string | null) {
  return useQuery({
    queryKey: ['terminals', projectId],
    queryFn: () => api.listTerminals(projectId!),
    enabled: !!projectId
  })
}

export function useCreateTerminal() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ projectId, name }: { projectId: string; name?: string }) =>
      api.createTerminal(projectId, name),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['terminals', projectId] })
    }
  })
}

export function useRenameTerminal() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ projectId, terminalId, name }: { projectId: string; terminalId: string; name: string }) =>
      api.renameTerminal(projectId, terminalId, name),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['terminals', projectId] })
    }
  })
}

export function useDeleteTerminal() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ projectId, terminalId }: { projectId: string; terminalId: string }) =>
      api.deleteTerminal(projectId, terminalId),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['terminals', projectId] })
    }
  })
}
