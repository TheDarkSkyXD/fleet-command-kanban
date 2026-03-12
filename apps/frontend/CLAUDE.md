# Fleet Command Web UI

React-based web interface for the Fleet Command ticket management system.

## Tech Stack

| Category | Technology |
|----------|------------|
| Framework | React 19 with React Compiler |
| Build | Vite 6 |
| Styling | Tailwind CSS 4 |
| Routing | TanStack Router |
| State (server) | TanStack Query |
| State (client) | Zustand |
| UI Components | Radix UI primitives |
| Icons | Lucide React |
| Drag & Drop | dnd-kit |
| Desktop | Electron (optional) |

## Project Structure

```
src/
├── api/          # API client functions
├── components/
│   ├── ui/       # Base UI components (shadcn-style)
│   ├── layout/   # App layout (sidebar, tabs)
│   ├── board/    # Kanban board components
│   ├── brainstorm/
│   ├── configure/ # Configuration UI components
│   ├── ticket-detail/
│   ├── sessions/
│   ├── logs/
│   └── templates/
├── hooks/        # Custom React hooks
├── lib/          # Utilities (cn, etc.)
├── routes/       # TanStack Router file-based routes
└── stores/       # Zustand stores
```

## Development

```bash
npm run dev        # Start dev server (proxies to daemon on :3131)
npm run build      # Type-check and build for production
npm run typecheck  # TypeScript check only
npm run lint       # ESLint
```

## Conventions

### Responsive Design

**Use container queries instead of media queries for responsive components.**

```css
/* PREFERRED - Container queries */
.component {
  container-type: inline-size;
}

@container (max-width: 640px) {
  .component__child {
    /* mobile styles */
  }
}

/* AVOID - Media queries for component-level responsiveness */
@media (max-width: 640px) {
  .component__child {
    /* don't do this */
  }
}
```

Container queries allow components to respond to their container's size rather than the viewport, making them more reusable and predictable in different layout contexts.

### Styling

- Use Tailwind CSS utility classes as the primary styling approach
- Custom CSS goes in `src/index.css` using CSS variables defined in `@theme`
- Use BEM-style naming for custom CSS classes (e.g., `.brand-logo__title`)
- Theme colors are defined as CSS variables: `--color-bg-primary`, `--color-text-primary`, `--color-accent`, etc.

### Components

- UI primitives in `components/ui/` follow shadcn/ui patterns
- Use Radix UI for accessible, unstyled primitives
- Compose complex components from smaller UI primitives
- Use `cn()` utility from `@/lib/utils` for conditional class merging

### State Management

- **Server state**: TanStack Query for API data fetching and caching
- **Client state**: Zustand for UI state (current project, modals, etc.)
- Hooks in `src/hooks/queries.ts` wrap TanStack Query for API calls

### Routing

- File-based routing with TanStack Router
- Routes defined in `src/routes/`
- Use `Link` component from `@tanstack/react-router` for navigation

### Path Aliases

Use `@/` alias for imports from `src/`:

```typescript
import { Button } from '@/components/ui/button'
import { useProjects } from '@/hooks/queries'
```

## API Integration

The dev server proxies `/api/*` and `/events/*` to the Fleet Command daemon running on `localhost:3131`.

- REST API: `/api/*`
- Server-Sent Events: `/events/*`
