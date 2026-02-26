import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ArtifactViewerFull } from './ArtifactViewerFull'

// Mock the API client
vi.mock('@/api/client', () => ({
  api: {
    getTicketArtifact: vi.fn(),
  },
}))

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

// Mock ArtifactChat component
vi.mock('./ArtifactChat', () => ({
  ArtifactChat: () => <div data-testid="artifact-chat">Chat</div>,
}))

// Mock window.matchMedia (needed for Radix UI components)
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
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

// Mock ResizeObserver (needed for scroll-area component)
class ResizeObserverMock {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
}
global.ResizeObserver = ResizeObserverMock as any

import { api } from '@/api/client'

const mockArtifact = {
  filename: 'test-artifact.md',
  type: '.md',
  description: 'A test artifact',
  savedAt: '2026-01-01T00:00:00.000Z',
  phase: 'Specification',
}

const mockContent = '# Test Heading\n\nSome **bold** content.'

// Setup clipboard mock at top level
const clipboardWriteTextMock = vi.fn().mockResolvedValue(undefined)
Object.defineProperty(navigator, 'clipboard', {
  value: {
    writeText: clipboardWriteTextMock,
  },
  writable: true,
  configurable: true,
})

describe('ArtifactViewerFull - Copy Button', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.getTicketArtifact).mockResolvedValue(mockContent)
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('renders copy button when content is loaded', async () => {
    vi.mocked(api.getTicketArtifact).mockResolvedValue(mockContent)

    render(
      <ArtifactViewerFull
        projectId="proj-1"
        ticketId="ticket-1"
        artifact={mockArtifact}
        onClose={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(screen.getByLabelText('Copy to clipboard')).toBeTruthy()
    })
  })

  it('does not render copy button during loading', () => {
    // Mock API to never resolve - component stays in loading state
    vi.mocked(api.getTicketArtifact).mockReturnValue(new Promise(() => {}))

    render(
      <ArtifactViewerFull
        projectId="proj-1"
        ticketId="ticket-1"
        artifact={mockArtifact}
        onClose={vi.fn()}
      />
    )

    // Button should not be visible while loading
    expect(screen.queryByLabelText('Copy to clipboard')).toBeNull()
  })

  it('does not render copy button when there is an error', async () => {
    vi.mocked(api.getTicketArtifact).mockRejectedValue(new Error('Fetch failed'))

    render(
      <ArtifactViewerFull
        projectId="proj-1"
        ticketId="ticket-1"
        artifact={mockArtifact}
        onClose={vi.fn()}
      />
    )

    // Wait for the error state to be set
    await waitFor(() => {
      expect(screen.getByText('Fetch failed')).toBeTruthy()
    })

    // Button should not be visible when there's an error
    expect(screen.queryByLabelText('Copy to clipboard')).toBeNull()
  })

  it('does not render copy button when artifact is null', () => {
    const { container } = render(
      <ArtifactViewerFull
        projectId="proj-1"
        ticketId="ticket-1"
        artifact={null}
        onClose={vi.fn()}
      />
    )

    expect(container.innerHTML).toBe('')
  })

  it('calls navigator.clipboard.writeText with raw markdown on click', async () => {
    render(
      <ArtifactViewerFull
        projectId="proj-1"
        ticketId="ticket-1"
        artifact={mockArtifact}
        onClose={vi.fn()}
      />
    )

    // Wait for the copy button to appear (indicates content is loaded)
    const copyButton = await screen.findByLabelText('Copy to clipboard')

    // Click the button using the native DOM click to ensure it works
    copyButton.click()

    // Verify clipboard.writeText was called with the raw markdown
    await waitFor(() => {
      expect(clipboardWriteTextMock).toHaveBeenCalledWith(mockContent)
    })
  })
})
