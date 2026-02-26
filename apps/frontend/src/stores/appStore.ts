import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AppState {
  /**
   * Current project ID - ONLY used for redirect/persistence purposes.
   *
   * The URL is the source of truth for the current project. This value is synced
   * from the URL by the root layout (__root.tsx) and persisted to localStorage
   * so the app can redirect to the last-used project when the user returns.
   *
   * Components should NOT read this value directly. Instead, use URL params or
   * the useCurrentProject hook from the root layout.
   *
   * setCurrentProjectId is called ONLY by __root.tsx to sync from URL changes.
   * Components should navigate to project URLs instead of calling this directly.
   */
  currentProjectId: string | null
  setCurrentProjectId: (id: string | null) => void

  // Board view preference
  boardViewMode: 'board' | 'table'
  setBoardViewMode: (mode: 'board' | 'table') => void

  /**
   * Set of ticket IDs currently being processed, keyed by project ID.
   * Updated by SSE processing:sync and session:ended events.
   */
  processingTickets: Map<string, Set<string>>
  setProcessingTickets: (projectId: string, ticketIds: string[]) => void
  removeProcessingTicket: (projectId: string, ticketId: string) => void
  isTicketProcessing: (projectId: string, ticketId: string) => boolean

  /**
   * Set of ticket IDs currently being archived, keyed by project ID.
   * Used to disable ticket cards during archive operations.
   */
  archivingTickets: Map<string, Set<string>>
  addArchivingTicket: (projectId: string, ticketId: string) => void
  removeArchivingTicket: (projectId: string, ticketId: string) => void
  isTicketArchiving: (projectId: string, ticketId: string) => boolean

  // UI State
  ticketSheetOpen: boolean
  ticketSheetTicketId: string | null
  ticketSheetProjectId: string | null
  openTicketSheet: (projectId: string, ticketId: string) => void
  closeTicketSheet: () => void

  addProjectModalOpen: boolean
  openAddProjectModal: () => void
  closeAddProjectModal: () => void

  addTicketModalOpen: boolean
  openAddTicketModal: () => void
  closeAddTicketModal: () => void

  createFolderModalOpen: boolean
  openCreateFolderModal: () => void
  closeCreateFolderModal: () => void

  // Folder collapse state (persisted)
  collapsedFolders: string[]
  toggleFolderCollapsed: (folderId: string) => void
  expandFolder: (folderId: string) => void

  // Archived tickets visibility
  showArchivedTickets: boolean
  setShowArchivedTickets: (show: boolean) => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Current project
      currentProjectId: null,
      setCurrentProjectId: (id) => set({ currentProjectId: id }),

      // Board view preference
      boardViewMode: 'board',
      setBoardViewMode: (mode) => set({ boardViewMode: mode }),

      // Processing tickets - updated by SSE processing:sync and session:ended
      processingTickets: new Map(),
      setProcessingTickets: (projectId, ticketIds) =>
        set((state) => {
          const newMap = new Map(state.processingTickets)
          newMap.set(projectId, new Set(ticketIds))
          return { processingTickets: newMap }
        }),
      removeProcessingTicket: (projectId, ticketId) =>
        set((state) => {
          const newMap = new Map(state.processingTickets)
          const projectSet = newMap.get(projectId)
          if (projectSet) {
            projectSet.delete(ticketId)
          }
          return { processingTickets: newMap }
        }),
      isTicketProcessing: (projectId, ticketId) => {
        const projectSet = get().processingTickets.get(projectId)
        return projectSet?.has(ticketId) ?? false
      },

      // Archiving tickets - tracks tickets currently being archived
      archivingTickets: new Map(),
      addArchivingTicket: (projectId, ticketId) =>
        set((state) => {
          const newMap = new Map(state.archivingTickets)
          const projectSet = newMap.get(projectId) ?? new Set()
          projectSet.add(ticketId)
          newMap.set(projectId, projectSet)
          return { archivingTickets: newMap }
        }),
      removeArchivingTicket: (projectId, ticketId) =>
        set((state) => {
          const newMap = new Map(state.archivingTickets)
          const projectSet = newMap.get(projectId)
          if (projectSet) {
            projectSet.delete(ticketId)
          }
          return { archivingTickets: newMap }
        }),
      isTicketArchiving: (projectId, ticketId) => {
        const projectSet = get().archivingTickets.get(projectId)
        return projectSet?.has(ticketId) ?? false
      },

      // Ticket sheet
      ticketSheetOpen: false,
      ticketSheetTicketId: null,
      ticketSheetProjectId: null,
      openTicketSheet: (projectId, ticketId) => set({ ticketSheetOpen: true, ticketSheetProjectId: projectId, ticketSheetTicketId: ticketId }),
      closeTicketSheet: () => set({ ticketSheetOpen: false, ticketSheetProjectId: null, ticketSheetTicketId: null }),

      // Add project modal
      addProjectModalOpen: false,
      openAddProjectModal: () => set({ addProjectModalOpen: true }),
      closeAddProjectModal: () => set({ addProjectModalOpen: false }),

      // Add ticket modal
      addTicketModalOpen: false,
      openAddTicketModal: () => set({ addTicketModalOpen: true }),
      closeAddTicketModal: () => set({ addTicketModalOpen: false }),

      // Create folder modal
      createFolderModalOpen: false,
      openCreateFolderModal: () => set({ createFolderModalOpen: true }),
      closeCreateFolderModal: () => set({ createFolderModalOpen: false }),

      // Folder collapse state
      collapsedFolders: [],
      toggleFolderCollapsed: (folderId) =>
        set((state) => ({
          collapsedFolders: state.collapsedFolders.includes(folderId)
            ? state.collapsedFolders.filter((id) => id !== folderId)
            : [...state.collapsedFolders, folderId]
        })),
      expandFolder: (folderId) =>
        set((state) => ({
          collapsedFolders: state.collapsedFolders.filter((id) => id !== folderId)
        })),

      // Archived tickets visibility
      showArchivedTickets: false,
      setShowArchivedTickets: (show) => set({ showArchivedTickets: show })
    }),
    {
      name: 'potato-cannon-app',
      partialize: (state) => ({
        currentProjectId: state.currentProjectId,
        boardViewMode: state.boardViewMode,
        showArchivedTickets: state.showArchivedTickets,
        collapsedFolders: state.collapsedFolders
      })
    }
  )
)
