import { createRootRoute, Outlet, useLocation } from '@tanstack/react-router'
import { useEffect } from 'react'
import { AppSidebar } from '@/components/layout/AppSidebar'
import { ViewTabs } from '@/components/layout/ViewTabs'
import { MobileBottomBar } from '@/components/layout/MobileBottomBar'
import { EmptyProjects } from '@/components/layout/EmptyProjects'
import { TicketDetailPanel } from '@/components/ticket-detail'
import { AddTicketModal } from '@/components/board/AddTicketModal'
import { AddProjectModal } from '@/components/layout/AddProjectModal'
import { CreateFolderModal } from '@/components/layout/CreateFolderModal'
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar'
import { useProjects } from '@/hooks/queries'
import { useAppStore } from '@/stores/appStore'
import { getProjectIcon } from '@/components/configure/ProjectIconPicker'

const SUBPAGE_LABELS: Record<string, string> = {
  board: 'Board',
  brainstorm: 'Brainstorm',
  configure: 'Configure',
}

/**
 * Hook to extract the current project slug and subpage from the URL path.
 * Returns the projectSlug and subpage if we're on a project route (/projects/:projectSlug/:subpage),
 * or null values if we're not on a project route.
 */
function useCurrentProject() {
  const location = useLocation()

  // Check if we're on a project route: /projects/:projectSlug/:subpage
  const projectMatch = location.pathname.match(/^\/projects\/([^/]+)(?:\/([^/]+))?/)
  const projectSlug = projectMatch ? decodeURIComponent(projectMatch[1]) : null
  const subpageSlug = projectMatch?.[2] || null
  const subpage = subpageSlug ? SUBPAGE_LABELS[subpageSlug] || null : null

  return { projectSlug, subpage }
}

export const Route = createRootRoute({
  component: RootLayout
})

// Detect Electron via user agent (most reliable method)
const isElectron = typeof navigator !== 'undefined' &&
  navigator.userAgent.toLowerCase().includes('electron')

// Add electron-app class immediately if in Electron
if (isElectron && typeof document !== 'undefined') {
  document.documentElement.classList.add('electron-app')
}

function RootLayout() {
  const { data: projects, isLoading } = useProjects()
  const { projectSlug, subpage } = useCurrentProject()
  const setCurrentProjectId = useAppStore((s) => s.setCurrentProjectId)
  const ticketSheetOpen = useAppStore((s) => s.ticketSheetOpen)

  // Look up project by slug from URL
  const currentProject = projects?.find((p) => p.slug === projectSlug)

  // Sync project ID to Zustand store for persistence/redirect
  useEffect(() => {
    if (currentProject) {
      setCurrentProjectId(currentProject.id)
    }
  }, [currentProject, setCurrentProjectId])
  const hasProjects = projects && projects.length > 0

  return (
    <>
      {/* Title bar for Electron window dragging - outside SidebarProvider for correct positioning */}
      {isElectron && <div className="electron-title-bar" />}
      <SidebarProvider>
        {hasProjects && <AppSidebar />}
      <SidebarInset className="flex flex-col h-svh overflow-hidden relative">
        {/* Header - only show when we have projects */}
        {hasProjects && (
          <header className="flex items-center gap-4 px-4 h-12 border-b border-border bg-bg-secondary shrink-0 electron-drag-region">
            <SidebarTrigger className="-ml-1" />
            {/* Mobile: show project name and subpage in header */}
            {currentProject && (() => {
              const ProjectIcon = getProjectIcon(currentProject.icon || 'package')
              const projectName = currentProject.displayName || currentProject.id
              const colorStyle = currentProject.color ? { color: currentProject.color } : undefined
              return (
                <div className="sm:hidden flex items-center gap-1.5 min-w-0 flex-1">
                  <ProjectIcon className="h-4 w-4 shrink-0 text-text-secondary" style={colorStyle} />
                  <span className="text-sm font-medium text-text-primary truncate leading-none" style={colorStyle}>{projectName}</span>
                  {subpage && (
                    <>
                      <span className="text-xs text-text-muted leading-none">›</span>
                      <span className="text-[10px] font-normal text-text-muted uppercase leading-none">{subpage}</span>
                    </>
                  )}
                </div>
              )
            })()}
            <ViewTabs />
          </header>
        )}
        <div className="board-container flex-1 flex overflow-hidden min-h-0" data-detail-open={ticketSheetOpen}>
          <main className="flex-1 min-w-0 overflow-hidden relative bg-bg-primary pb-14 sm:pb-0">
            {!isLoading && !hasProjects ? (
              <EmptyProjects />
            ) : (
              <div className="flex flex-col h-full">
                {currentProject && (() => {
                  const ProjectIcon = getProjectIcon(currentProject.icon || 'package')
                  const projectName = currentProject.displayName || currentProject.id
                  const colorStyle = currentProject.color ? { color: currentProject.color } : undefined
                  return (
                    <div className="hidden sm:block px-6 pt-4">
                      <h1 className="flex items-center gap-2 text-lg font-semibold text-text-primary">
                        <ProjectIcon className="h-5 w-5" style={colorStyle} />
                        <span className="flex items-baseline gap-2">
                          <span style={colorStyle}>{projectName}</span>
                          {subpage && (
                            <>
                              <span className="text-sm text-text-muted">›</span>
                              <span className="text-xs font-normal text-text-muted uppercase">{subpage}</span>
                            </>
                          )}
                        </span>
                      </h1>
                      <p className="text-xs text-text-muted truncate">
                        {currentProject.path}
                      </p>
                    </div>
                  )
                })()}
                <div className="flex-1 overflow-hidden">
                  <Outlet />
                </div>
              </div>
            )}
          </main>
          <TicketDetailPanel />
        </div>
        {hasProjects && <MobileBottomBar />}
      </SidebarInset>
      <AddTicketModal />
      <AddProjectModal />
      <CreateFolderModal />
    </SidebarProvider>
    </>
  )
}
