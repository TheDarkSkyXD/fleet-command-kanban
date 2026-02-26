import { Link, useLocation } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Plus, FolderPlus } from "lucide-react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useProjects, useFolders, useUpdateProject } from "@/hooks/queries";
import { useAppStore } from "@/stores/appStore";
import { IconButton } from "@/components/ui/icon-button";
import { ProjectMenuItem } from "@/components/layout/ProjectMenuItem";
import { SidebarFolderGroup } from "@/components/layout/SidebarFolderGroup";
import { UngroupedDropZone } from "@/components/layout/UngroupedDropZone";
import { usePendingQuestions } from "@/hooks/usePendingQuestions";
import { toast } from "sonner";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type LogoVariant = "standard" | "premium";

function PotatoCannonLogo({
  collapsed = false,
  variant = "standard",
}: {
  collapsed?: boolean;
  variant?: LogoVariant;
}) {
  const variantClass = variant === "standard" ? "brand-logo--standard" : "";
  return (
    <div className="brand-logo__wrapper">
      <div
        className={`brand-logo ${collapsed ? "brand-logo--collapsed" : ""} ${variantClass}`}
      >
        {/* Animated potato projectile */}
        <div className="brand-logo__potato">
          <svg viewBox="0 0 32 32" className="brand-logo__potato-svg">
            {/* Potato body */}
            <ellipse
              cx="16"
              cy="16"
              rx="11"
              ry="9"
              className="brand-logo__potato-body"
            />
            {/* Potato spots */}
            <circle
              cx="12"
              cy="13"
              r="1.5"
              className="brand-logo__potato-spot"
            />
            <circle cx="19" cy="11" r="1" className="brand-logo__potato-spot" />
            <circle
              cx="14"
              cy="19"
              r="1.2"
              className="brand-logo__potato-spot"
            />
            <circle
              cx="21"
              cy="17"
              r="0.8"
              className="brand-logo__potato-spot"
            />
            {/* Motion lines */}
            <line
              x1="3"
              y1="14"
              x2="6"
              y2="14"
              className="brand-logo__motion-line"
            />
            <line
              x1="2"
              y1="17"
              x2="5"
              y2="17"
              className="brand-logo__motion-line"
            />
            <line
              x1="4"
              y1="20"
              x2="7"
              y2="20"
              className="brand-logo__motion-line"
            />
          </svg>
        </div>

        {/* Text treatment */}
        {!collapsed && (
          <div className="brand-logo__text">
            <span className="brand-logo__title">POTATO</span>
            <span className="brand-logo__subtitle">CANNON</span>
          </div>
        )}
      </div>

      {/* Edition label - outside brand-logo to avoid clipping */}
      {!collapsed && variant === "premium" && (
        <span className="brand-logo__edition">Yukon Gold Edition</span>
      )}
    </div>
  );
}

export function AppSidebar() {
  const { data: projects, isLoading } = useProjects();
  const { data: folders } = useFolders();
  const location = useLocation();
  const openAddProjectModal = useAppStore((s) => s.openAddProjectModal);
  const openCreateFolderModal = useAppStore((s) => s.openCreateFolderModal);
  const processingTickets = useAppStore((s) => s.processingTickets);
  const collapsedFolders = useAppStore((s) => s.collapsedFolders);
  const expandFolder = useAppStore((s) => s.expandFolder);
  const { hasPendingQuestions } = usePendingQuestions();
  const updateProject = useUpdateProject();

  const [draggedProject, setDraggedProject] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5, // 5px activation constraint
      },
    })
  );

  // Check if a project has any processing tickets
  const hasActiveSessions = (projectId: string) => {
    const tickets = processingTickets.get(projectId);
    return tickets ? tickets.size > 0 : false;
  };

  // Extract project slug from URL
  const projectMatch = location.pathname.match(/^\/projects\/([^/]+)/);
  const currentProjectSlug = projectMatch
    ? decodeURIComponent(projectMatch[1])
    : null;

  // Find the current project
  const currentProject = projects?.find((p) => p.slug === currentProjectSlug);

  // Auto-expand folder if active project is in it
  useEffect(() => {
    if (currentProject && currentProject.folderId && collapsedFolders.includes(currentProject.folderId)) {
      expandFolder(currentProject.folderId);
    }
  }, [currentProject, collapsedFolders, expandFolder]);

  // Group projects by folder
  const groupedProjects: Record<string, typeof projects> = {};
  const ungroupedProjects: typeof projects = [];

  if (projects) {
    projects.forEach((project) => {
      if (project.folderId) {
        const folderId = project.folderId;
        if (!groupedProjects[folderId]) {
          groupedProjects[folderId] = [];
        }
        (groupedProjects[folderId] as typeof projects).push(project);
      } else {
        ungroupedProjects.push(project);
      }
    });
  }

  // Sort folders alphabetically
  const sortedFolders = (folders || []).sort((a, b) => a.name.localeCompare(b.name));

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const projectId = event.active.data?.current?.projectId;
    if (projectId) {
      setDraggedProject(projectId);
    }
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setDraggedProject(null);

    const { active, over } = event;
    if (!over || !projects) return;

    const projectId = active.id as string;
    const draggedProj = projects.find((p) => p.id === projectId);
    if (!draggedProj) return;

    // Extract target folder ID from the drop zone
    const targetFolderId = over.data?.current?.folderId || null;

    // Don't update if dropping in the same folder
    if (draggedProj.folderId === targetFolderId) return;

    // Call the API to move the project
    updateProject.mutate(
      {
        id: projectId,
        updates: { folderId: targetFolderId },
      },
      {
        onError: (error) => {
          const errorMessage = error instanceof Error ? error.message : 'Failed to move project';
          toast.error(errorMessage);
        },
      }
    );
  }, [projects, updateProject]);

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <Sidebar collapsible="icon">
        <SidebarHeader className="m-0 p-0 gap-0">
          {/* Expanded branding */}
          <Link
            to="/"
            className="group-data-[collapsible=icon]:hidden flex items-center cursor-pointer"
          >
            <PotatoCannonLogo />
          </Link>
          {/* Collapsed branding - just the potato */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                to="/"
                className="hidden group-data-[collapsible=icon]:flex justify-center items-center cursor-pointer"
              >
                <PotatoCannonLogo collapsed />
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right">Potato Cannon</TooltipContent>
          </Tooltip>
          <SidebarMenu className="group-data-[collapsible=icon]:items-center">
            {/* Dropdown menu - shows below logo when collapsed */}
            <SidebarMenuItem className="group-data-[collapsible=icon]:block hidden">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton tooltip="New">
                    <Plus className="h-4 w-4" />
                    <span>New</span>
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="right" align="start">
                  <DropdownMenuItem onClick={openAddProjectModal}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Project
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={openCreateFolderModal}>
                    <FolderPlus className="h-4 w-4 mr-2" />
                    Create Folder
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel className="justify-between">
              <span>Projects</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <IconButton tooltip="New">
                    <Plus className="h-4 w-4" />
                  </IconButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="right" align="end">
                  <DropdownMenuItem onClick={openAddProjectModal}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Project
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={openCreateFolderModal}>
                    <FolderPlus className="h-4 w-4 mr-2" />
                    Create Folder
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {isLoading ? (
                  <SidebarMenuItem>
                    <SidebarMenuButton disabled>
                      <span className="text-sidebar-foreground/50">
                        Loading...
                      </span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ) : (
                  <>
                    {/* Render folders with their projects */}
                    {sortedFolders.map((folder) => (
                      <SidebarFolderGroup
                        key={folder.id}
                        folder={folder}
                        projectCount={groupedProjects[folder.id]?.length || 0}
                        isCollapsed={collapsedFolders.includes(folder.id)}
                      >
                        <SidebarMenu>
                          {groupedProjects[folder.id]?.map((project) => (
                            <ProjectMenuItem
                              key={project.id}
                              project={project}
                              isActive={project.slug === currentProjectSlug}
                              hasActiveSessions={hasActiveSessions(project.id)}
                              hasPendingQuestions={hasPendingQuestions(project.id)}
                            />
                          ))}
                        </SidebarMenu>
                      </SidebarFolderGroup>
                    ))}

                    {/* Render ungrouped projects */}
                    <UngroupedDropZone>
                      <SidebarMenu>
                        {ungroupedProjects.map((project) => (
                          <ProjectMenuItem
                            key={project.id}
                            project={project}
                            isActive={project.slug === currentProjectSlug}
                            hasActiveSessions={hasActiveSessions(project.id)}
                            hasPendingQuestions={hasPendingQuestions(project.id)}
                          />
                        ))}
                      </SidebarMenu>
                    </UngroupedDropZone>
                  </>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>

      {/* Drag Overlay */}
      <DragOverlay>
        {draggedProject && (
          <div className="flex items-center gap-2 bg-sidebar rounded-md px-3 py-1.5 shadow-lg border">
            <span className="text-sm">{projects?.find((p) => p.id === draggedProject)?.displayName || draggedProject}</span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
