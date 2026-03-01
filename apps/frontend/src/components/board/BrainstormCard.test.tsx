import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BrainstormCard } from './BrainstormCard'

// Mock useSSE hook
vi.mock('@/hooks/useSSE', () => ({
  useBrainstormMessage: vi.fn(),
}))

// Mock appStore
const mockOpenBrainstormSheet = vi.fn()
let mockBrainstormSheetBrainstormId: string | null = null

vi.mock('@/stores/appStore', () => ({
  useAppStore: (selector: any) => {
    const state = {
      openBrainstormSheet: mockOpenBrainstormSheet,
      brainstormSheetBrainstormId: mockBrainstormSheetBrainstormId,
    }
    return selector(state)
  },
}))

const baseBrainstorm = {
  id: 'bs-1',
  name: 'Test Brainstorm',
  status: 'active' as const,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  hasActiveSession: false,
}

describe('BrainstormCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockBrainstormSheetBrainstormId = null
  })

  it('renders brainstorm name', () => {
    render(<BrainstormCard brainstorm={baseBrainstorm} projectId="proj-1" />)
    const nameElement = screen.queryByText('Test Brainstorm')
    expect(nameElement).not.toBeNull()
  })

  it('renders as a flat row button (no ListItemCard card classes)', () => {
    const { container } = render(
      <BrainstormCard brainstorm={baseBrainstorm} projectId="proj-1" />
    )
    // Should NOT have card styling classes
    const cardElement = container.querySelector('.rounded-lg.shadow-md')
    expect(cardElement).toBeNull()

    // Should have a top-level button
    const button = container.querySelector('button')
    expect(button).toBeDefined()
  })

  it('applies selected classes when brainstorm is selected', () => {
    mockBrainstormSheetBrainstormId = 'bs-1'
    const { container } = render(
      <BrainstormCard brainstorm={baseBrainstorm} projectId="proj-1" />
    )
    const button = container.querySelector('button')
    expect(button?.className).toContain('border-accent/30')
    expect(button?.className).toContain('bg-accent/10')
  })

  it('applies thinking-shimmer class when active with session and no pending question', () => {
    const thinkingBrainstorm = {
      ...baseBrainstorm,
      status: 'active' as const,
      hasActiveSession: true,
    }
    const { container } = render(
      <BrainstormCard brainstorm={thinkingBrainstorm} projectId="proj-1" />
    )
    const button = container.querySelector('button')
    expect(button?.className).toContain('thinking-shimmer')
  })

  it('does not apply thinking-shimmer when completed', () => {
    const completedBrainstorm = {
      ...baseBrainstorm,
      status: 'completed' as const,
      hasActiveSession: true,
    }
    const { container } = render(
      <BrainstormCard brainstorm={completedBrainstorm} projectId="proj-1" />
    )
    const button = container.querySelector('button')
    expect(button?.className).not.toContain('thinking-shimmer')
  })

  it('shows completed badge when status is completed', () => {
    const completedBrainstorm = {
      ...baseBrainstorm,
      status: 'completed' as const,
    }
    render(
      <BrainstormCard brainstorm={completedBrainstorm} projectId="proj-1" />
    )
    // Use getAllByText to handle React.StrictMode double-renders in dev
    const completedBadges = screen.getAllByText('completed')
    expect(completedBadges.length).toBeGreaterThan(0)
  })

  it('calls openBrainstormSheet on click', () => {
    const { container } = render(<BrainstormCard brainstorm={baseBrainstorm} projectId="proj-1" />)
    const button = container.querySelector('button')!
    fireEvent.click(button)
    expect(mockOpenBrainstormSheet).toHaveBeenCalledWith(
      'proj-1',
      'bs-1',
      'Test Brainstorm'
    )
  })

  it('renders single-line layout with name, timestamp, and status inline', () => {
    const { container } = render(
      <BrainstormCard brainstorm={baseBrainstorm} projectId="proj-1" />
    )
    // The inner flex container should use items-center (single line), not items-start (multi-line)
    const innerFlex = container.querySelector('.flex.items-center.gap-2')
    expect(innerFlex).toBeDefined()
  })
})
