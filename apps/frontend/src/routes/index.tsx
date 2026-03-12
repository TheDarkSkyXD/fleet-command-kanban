import { createFileRoute, redirect } from '@tanstack/react-router'
import { api } from '@/api/client'

export const Route = createFileRoute('/')({
  loader: async () => {
    // First, check localStorage for last viewed project
    const stored = localStorage.getItem('fleet-command-app')
    if (stored) {
      try {
        const { state } = JSON.parse(stored)
        if (state?.currentProjectSlug) {
          throw redirect({
            to: '/projects/$projectId/board',
            params: { projectId: state.currentProjectSlug }
          })
        }
      } catch (e) {
        // Re-throw redirects (they're not Error instances)
        if (!(e instanceof Error)) throw e
        // Ignore parse errors, continue to fetch projects
      }
    }

    // No stored project - fetch projects and redirect to first one
    const projects = await api.getProjects()
    if (projects && projects.length > 0) {
      throw redirect({
        to: '/projects/$projectId/board',
        params: { projectId: projects[0].slug }
      })
    }

    // No projects exist - root layout will show EmptyProjects
    return null
  },
  component: () => null
})
