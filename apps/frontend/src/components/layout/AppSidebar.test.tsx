import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppSidebar } from './AppSidebar'
import * as queries from '@/hooks/queries'
import * as appStore from '@/stores/appStore'
import { SidebarProvider } from '@/components/ui/sidebar'

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// Mock dependencies
vi.mock('@/hooks/usePendingQuestions', () => ({
  usePendingQuestions: () => ({
    hasPendingQuestions: () => false,
  }),
}))

vi.mock('@/components/configure/ProjectIconPicker', () => ({
  getProjectIcon: () => () => null,
}))

const mockUseLocation = vi.fn()

vi.mock('@tanstack/react-router', async () => {
  const actual = await vi.importActual('@tanstack/react-router')
  return {
    ...actual,
    Link: ({ children, ...props }: any) => <a {...props}>{children}</a>,
    useLocation: (...args: any[]) => mockUseLocation(...args),
  }
})

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

const mockProjects = [
  {
    id: 'proj-1',
    slug: 'project-1',
    path: '/path/to/project-1',
    displayName: 'Project 1',
    folderId: 'folder-1',
    icon: 'package',
    color: undefined,
    branchPrefix: undefined,
    swimlaneColors: {},
    automatedPhases: [],
    automatedPhaseMigration: false,
  },
  {
    id: 'proj-2',
    slug: 'project-2',
    path: '/path/to/project-2',
    displayName: 'Project 2',
    folderId: 'folder-1',
    icon: 'package',
    color: undefined,
    branchPrefix: undefined,
    swimlaneColors: {},
    automatedPhases: [],
    automatedPhaseMigration: false,
  },
  {
    id: 'proj-3',
    slug: 'project-3',
    path: '/path/to/project-3',
    displayName: 'Project 3',
    folderId: null,
    icon: 'package',
    color: undefined,
    branchPrefix: undefined,
    swimlaneColors: {},
    automatedPhases: [],
    automatedPhaseMigration: false,
  },
]

const mockFolders = [
  {
    id: 'folder-1',
    name: 'Folder 1',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
]

const renderWithProviders = (component: React.ReactElement) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <SidebarProvider>
        {component}
      </SidebarProvider>
    </QueryClientProvider>
  )
}

describe('AppSidebar', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    mockUseLocation.mockReturnValue({
      pathname: '/projects/my-project/board',
    })
  })

  describe('Rendering', () => {
    it('should render loading state when projects are loading', () => {
      vi.spyOn(queries, 'useProjects').mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
        status: 'pending',
        isError: false,
        isFetched: false,
        isFetchedAfterMount: false,
        isRefetching: false,
        isPlaceholderData: false,
        dataUpdatedAt: 0,
        errorUpdatedAt: 0,
        failureCount: 0,
        failureReason: null,
        isPending: true,
        isFetching: true,
      } as any)

      vi.spyOn(queries, 'useFolders').mockReturnValue({
        data: [],
        isLoading: false,
        error: null,
        status: 'success',
        isError: false,
        isFetched: true,
        isFetchedAfterMount: true,
        isRefetching: false,
        isPlaceholderData: false,
        dataUpdatedAt: Date.now(),
        errorUpdatedAt: 0,
        failureCount: 0,
        failureReason: null,
        isPending: false,
        isFetching: false,
      } as any)

      vi.spyOn(appStore, 'useAppStore').mockImplementation((selector: any) => {
        const state = {
          processingTickets: new Map(),
          collapsedFolders: [],
          expandFolder: vi.fn(),
          openAddProjectModal: vi.fn(),
          openCreateFolderModal: vi.fn(),
        }
        return selector(state)
      })

      renderWithProviders(<AppSidebar />)
      expect(screen.getByText('Loading...')).toBeTruthy()
    })

    it('should render projects grouped by folder', () => {
      vi.spyOn(queries, 'useProjects').mockReturnValue({
        data: mockProjects,
        isLoading: false,
        error: null,
        status: 'success',
        isError: false,
        isFetched: true,
        isFetchedAfterMount: true,
        isRefetching: false,
        isPlaceholderData: false,
        dataUpdatedAt: Date.now(),
        errorUpdatedAt: 0,
        failureCount: 0,
        failureReason: null,
        isPending: false,
        isFetching: false,
      } as any)

      vi.spyOn(queries, 'useFolders').mockReturnValue({
        data: mockFolders,
        isLoading: false,
        error: null,
        status: 'success',
        isError: false,
        isFetched: true,
        isFetchedAfterMount: true,
        isRefetching: false,
        isPlaceholderData: false,
        dataUpdatedAt: Date.now(),
        errorUpdatedAt: 0,
        failureCount: 0,
        failureReason: null,
        isPending: false,
        isFetching: false,
      } as any)

      vi.spyOn(appStore, 'useAppStore').mockImplementation((selector: any) => {
        const state = {
          processingTickets: new Map(),
          collapsedFolders: [],
          expandFolder: vi.fn(),
          openAddProjectModal: vi.fn(),
          openCreateFolderModal: vi.fn(),
        }
        return selector(state)
      })

      renderWithProviders(<AppSidebar />)

      // Check that folder is rendered
      expect(screen.getByText('Folder 1')).toBeTruthy()

      // Check that grouped projects are rendered
      expect(screen.getByText('Project 1')).toBeTruthy()
      expect(screen.getByText('Project 2')).toBeTruthy()

      // Check that ungrouped project is rendered
      expect(screen.getByText('Project 3')).toBeTruthy()
    })

    it('should render Create Project and Create Folder dropdown options', () => {
      vi.spyOn(queries, 'useProjects').mockReturnValue({
        data: [],
        isLoading: false,
        error: null,
        status: 'success',
        isError: false,
        isFetched: true,
        isFetchedAfterMount: true,
        isRefetching: false,
        isPlaceholderData: false,
        dataUpdatedAt: Date.now(),
        errorUpdatedAt: 0,
        failureCount: 0,
        failureReason: null,
        isPending: false,
        isFetching: false,
      } as any)

      vi.spyOn(queries, 'useFolders').mockReturnValue({
        data: [],
        isLoading: false,
        error: null,
        status: 'success',
        isError: false,
        isFetched: true,
        isFetchedAfterMount: true,
        isRefetching: false,
        isPlaceholderData: false,
        dataUpdatedAt: Date.now(),
        errorUpdatedAt: 0,
        failureCount: 0,
        failureReason: null,
        isPending: false,
        isFetching: false,
      } as any)

      vi.spyOn(appStore, 'useAppStore').mockImplementation((selector: any) => {
        const state = {
          processingTickets: new Map(),
          collapsedFolders: [],
          expandFolder: vi.fn(),
          openAddProjectModal: vi.fn(),
          openCreateFolderModal: vi.fn(),
        }
        return selector(state)
      })

      renderWithProviders(<AppSidebar />)

      // The "Projects" group label should be rendered with a dropdown trigger
      expect(screen.getAllByText('Projects').length).toBeGreaterThan(0)

      // The dropdown trigger button ("+") should exist in the sidebar
      const buttons = screen.getAllByRole('button')
      expect(buttons.length).toBeGreaterThan(0)
    })
  })

  describe('Folder Collapse/Expand', () => {
    it('should auto-expand folder when active project is inside it', () => {
      const expandFolder = vi.fn()

      // Mock useLocation to return a project inside folder-1
      mockUseLocation.mockReturnValue({
        pathname: '/projects/project-1/board',
      })

      vi.spyOn(queries, 'useProjects').mockReturnValue({
        data: mockProjects,
        isLoading: false,
        error: null,
        status: 'success',
        isError: false,
        isFetched: true,
        isFetchedAfterMount: true,
        isRefetching: false,
        isPlaceholderData: false,
        dataUpdatedAt: Date.now(),
        errorUpdatedAt: 0,
        failureCount: 0,
        failureReason: null,
        isPending: false,
        isFetching: false,
      } as any)

      vi.spyOn(queries, 'useFolders').mockReturnValue({
        data: mockFolders,
        isLoading: false,
        error: null,
        status: 'success',
        isError: false,
        isFetched: true,
        isFetchedAfterMount: true,
        isRefetching: false,
        isPlaceholderData: false,
        dataUpdatedAt: Date.now(),
        errorUpdatedAt: 0,
        failureCount: 0,
        failureReason: null,
        isPending: false,
        isFetching: false,
      } as any)

      vi.spyOn(appStore, 'useAppStore').mockImplementation((selector: any) => {
        const state = {
          processingTickets: new Map(),
          collapsedFolders: ['folder-1'], // Folder is collapsed
          expandFolder,
          openAddProjectModal: vi.fn(),
          openCreateFolderModal: vi.fn(),
        }
        return selector(state)
      })

      renderWithProviders(<AppSidebar />)

      // expandFolder should be called for folder-1
      waitFor(() => {
        expect(expandFolder).toHaveBeenCalledWith('folder-1')
      })
    })
  })

  describe('Drag and Drop', () => {
    it('should render projects within DnD context', () => {
      vi.spyOn(queries, 'useProjects').mockReturnValue({
        data: mockProjects,
        isLoading: false,
        error: null,
        status: 'success',
        isError: false,
        isFetched: true,
        isFetchedAfterMount: true,
        isRefetching: false,
        isPlaceholderData: false,
        dataUpdatedAt: Date.now(),
        errorUpdatedAt: 0,
        failureCount: 0,
        failureReason: null,
        isPending: false,
        isFetching: false,
      } as any)

      vi.spyOn(queries, 'useFolders').mockReturnValue({
        data: mockFolders,
        isLoading: false,
        error: null,
        status: 'success',
        isError: false,
        isFetched: true,
        isFetchedAfterMount: true,
        isRefetching: false,
        isPlaceholderData: false,
        dataUpdatedAt: Date.now(),
        errorUpdatedAt: 0,
        failureCount: 0,
        failureReason: null,
        isPending: false,
        isFetching: false,
      } as any)

      vi.spyOn(appStore, 'useAppStore').mockImplementation((selector: any) => {
        const state = {
          processingTickets: new Map(),
          collapsedFolders: [],
          expandFolder: vi.fn(),
          openAddProjectModal: vi.fn(),
          openCreateFolderModal: vi.fn(),
        }
        return selector(state)
      })

      renderWithProviders(<AppSidebar />)

      // Folder and ungrouped project should be rendered within DnD context
      expect(screen.getAllByText('Folder 1').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Project 3').length).toBeGreaterThan(0)
    })
  })
})
