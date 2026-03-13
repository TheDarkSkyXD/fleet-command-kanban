import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createHashHistory } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import { useSSE } from '@/hooks/useSSE'
import { Toaster } from './components/ui/toaster'
import { UpdateNotification } from './components/update-notification/UpdateNotification'
import './index.css'

// Create hash history for Electron compatibility
const hashHistory = createHashHistory()

// Create router instance
const router = createRouter({
  routeTree,
  history: hashHistory
})

// Type registration for router
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

// Create query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5000,
      refetchOnWindowFocus: false
    }
  }
})

// App wrapper that initializes SSE
function App() {
  useSSE()
  return (
    <>
      <RouterProvider router={router} />
      <Toaster />
      <UpdateNotification />
    </>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>
)
