import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { TicketCard } from './TicketCard'

// Mock dnd-kit
vi.mock('@dnd-kit/core', () => ({
  useDraggable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    isDragging: false,
  }),
}))

vi.mock('@dnd-kit/utilities', () => ({
  CSS: { Translate: { toString: () => '' } },
}))

// Mock queries
vi.mock('@/hooks/queries', () => ({
  useArchiveTicket: () => ({ mutate: vi.fn(), isPending: false }),
}))

// Mock appStore
const mockIsTicketProcessing = vi.fn().mockReturnValue(false)
const mockIsTicketPending = vi.fn().mockReturnValue(false)
const mockIsTicketArchiving = vi.fn().mockReturnValue(false)
const mockGetTicketActivity = vi.fn().mockReturnValue(undefined)
const mockOpenTicketSheet = vi.fn()

vi.mock('@/stores/appStore', () => ({
  useAppStore: (selector: (s: Record<string, unknown>) => unknown) => {
    const state = {
      openTicketSheet: mockOpenTicketSheet,
      isTicketProcessing: mockIsTicketProcessing,
      isTicketPending: mockIsTicketPending,
      isTicketArchiving: mockIsTicketArchiving,
      getTicketActivity: mockGetTicketActivity,
    }
    return selector(state)
  },
}))

// Mock ArchiveConfirmDialog
vi.mock('@/components/ticket-detail/ArchiveConfirmDialog', () => ({
  ArchiveConfirmDialog: () => null,
  shouldShowArchiveWarning: () => false,
}))

const baseTicket = {
  id: 'POT-1',
  title: 'Test Ticket',
  description: 'A test ticket',
  phase: 'Build',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  archived: false,
  images: [],
}

describe('TicketCard - Pending Badge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('should not show pending badge when ticket is not pending', () => {
    mockIsTicketPending.mockReturnValue(false)

    render(<TicketCard ticket={baseTicket as any} projectId="proj-1" />)

    expect(screen.queryByText('?')).toBeNull()
  })

  it('should show amber ? badge when ticket is pending', () => {
    mockIsTicketPending.mockReturnValue(true)

    render(<TicketCard ticket={baseTicket as any} projectId="proj-1" />)

    const badge = screen.getByText('?')
    expect(badge).toBeTruthy()
    expect(badge.className).toContain('text-amber-400')
  })

  it('should apply pulsating glow animation to pending badge', () => {
    mockIsTicketPending.mockReturnValue(true)

    render(<TicketCard ticket={baseTicket as any} projectId="proj-1" />)

    const badge = screen.getByText('?')
    expect(badge.className).toContain('animate-pending-glow')
  })
})

describe('TicketCard - Processing Activity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetTicketActivity.mockReturnValue(undefined)
  })

  afterEach(() => {
    cleanup()
  })

  it('should show "Processing..." when processing with no activity text', () => {
    mockIsTicketProcessing.mockReturnValue(true)
    mockGetTicketActivity.mockReturnValue(undefined)

    render(<TicketCard ticket={baseTicket as any} projectId="proj-1" />)

    expect(screen.getByText('Processing...')).toBeTruthy()
  })

  it('should show activity text when processing with activity', () => {
    mockIsTicketProcessing.mockReturnValue(true)
    mockGetTicketActivity.mockReturnValue('Reading documentation')

    render(<TicketCard ticket={baseTicket as any} projectId="proj-1" />)

    expect(screen.getByText('Reading documentation')).toBeTruthy()
    expect(screen.queryByText('Processing...')).toBeNull()
  })

  it('should show pulsing dot when processing', () => {
    mockIsTicketProcessing.mockReturnValue(true)

    const { container } = render(<TicketCard ticket={baseTicket as any} projectId="proj-1" />)

    const dot = container.querySelector('.animate-pulse')
    expect(dot).toBeTruthy()
  })

  it('should not show processing indicator when not processing', () => {
    mockIsTicketProcessing.mockReturnValue(false)

    render(<TicketCard ticket={baseTicket as any} projectId="proj-1" />)

    expect(screen.queryByText('Processing...')).toBeNull()
  })
})
