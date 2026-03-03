import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AddTicketModal } from './AddTicketModal'

// Mock external dependencies
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
  }),
}))

vi.mock('@/stores/appStore', () => ({
  useAppStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      currentProjectId: 'test-project',
      addTicketModalOpen: true,
      closeAddTicketModal: vi.fn(),
    }),
}))

vi.mock('@/api/client', () => ({
  api: {
    createTicket: vi.fn(),
  },
}))

// Mock window.matchMedia (needed for Radix UI Dialog)
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
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

describe('AddTicketModal', () => {
  it('renders the title input with autoComplete="off"', () => {
    render(<AddTicketModal />)

    const titleInput = screen.getByPlaceholderText('Ticket title') as HTMLInputElement
    expect(titleInput.getAttribute('autocomplete')).toBe('off')
  })
})
