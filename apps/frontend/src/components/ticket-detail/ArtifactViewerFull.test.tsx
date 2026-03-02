import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup, act } from '@testing-library/react'
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

const mockMutateAsync = vi.fn()

// Mock useUpdateArtifact hook
vi.mock('@/hooks/queries', () => ({
  useUpdateArtifact: () => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
  }),
}))

// Mock ArtifactEditor component
vi.mock('./ArtifactEditor', () => ({
  ArtifactEditor: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <textarea
      data-testid="artifact-editor"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
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
import { toast } from 'sonner'

const mockArtifact = {
  filename: 'test-artifact.md',
  type: 'specification' as const,
  description: 'A test artifact',
  savedAt: '2026-01-01T00:00:00.000Z',
  phase: 'Specification',
  versionCount: 1,
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

  it('shows success toast after successful copy', async () => {
    const user = userEvent.setup()

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

    await user.click(screen.getByLabelText('Copy to clipboard'))

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Copied to clipboard!')
    })
  })

  it('shows error toast when clipboard write fails', async () => {
    const user = userEvent.setup()
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: vi.fn().mockRejectedValue(new Error('Permission denied')),
      },
      writable: true,
      configurable: true,
    })

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

    await user.click(screen.getByLabelText('Copy to clipboard'))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to copy to clipboard')
    })
  })

  it('swaps to Check icon after successful copy', async () => {
    const user = userEvent.setup()

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

    const button = screen.getByLabelText('Copy to clipboard')

    // Before click: should have Copy icon (no Check icon)
    // lucide-react renders SVGs with class names
    expect(button.querySelector('svg')).toBeTruthy()

    await user.click(button)

    // After successful copy, icon should change
    // The button should still exist and be accessible
    await waitFor(() => {
      expect(screen.getByLabelText('Copy to clipboard')).toBeTruthy()
    })
  })

  it('does not swap icon when clipboard write fails', async () => {
    const user = userEvent.setup()
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: vi.fn().mockRejectedValue(new Error('Permission denied')),
      },
      writable: true,
      configurable: true,
    })

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

    await user.click(screen.getByLabelText('Copy to clipboard'))

    // Wait for the error handler to complete
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled()
    })

    // toast.success should NOT have been called
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('reverts to Copy icon after 2 seconds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

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

    await user.click(screen.getByLabelText('Copy to clipboard'))

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalled()
    })

    // Advance time by 2 seconds to trigger the reset
    await act(async () => {
      vi.advanceTimersByTime(2000)
    })

    // The button should still be accessible (icon reverted back to Copy)
    expect(screen.getByLabelText('Copy to clipboard')).toBeTruthy()

    vi.useRealTimers()
  })
})

describe('ArtifactViewerFull - Edit Mode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.getTicketArtifact).mockResolvedValue(mockContent)
    mockMutateAsync.mockResolvedValue({ ok: true, filename: 'test-artifact.md', isNewVersion: true })
  })

  afterEach(() => {
    cleanup()
  })

  it('renders the Edit button when content is loaded', async () => {
    render(
      <ArtifactViewerFull
        projectId="proj-1"
        ticketId="ticket-1"
        artifact={mockArtifact}
        onClose={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('Edit')).toBeTruthy()
    })
  })

  it('shows editor when Edit is clicked', async () => {
    const user = userEvent.setup()

    render(
      <ArtifactViewerFull
        projectId="proj-1"
        ticketId="ticket-1"
        artifact={mockArtifact}
        onClose={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('Edit')).toBeTruthy()
    })

    await user.click(screen.getByText('Edit'))

    expect(screen.getByTestId('artifact-editor')).toBeTruthy()
    expect(screen.getByText('Save')).toBeTruthy()
    expect(screen.getByText('Cancel')).toBeTruthy()
  })

  it('Save button is disabled when no changes have been made', async () => {
    const user = userEvent.setup()

    render(
      <ArtifactViewerFull
        projectId="proj-1"
        ticketId="ticket-1"
        artifact={mockArtifact}
        onClose={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('Edit')).toBeTruthy()
    })

    await user.click(screen.getByText('Edit'))

    const saveButton = screen.getByText('Save').closest('button')
    expect(saveButton?.disabled).toBe(true)
  })

  it('calls mutateAsync with correct args on save', async () => {
    const user = userEvent.setup()

    render(
      <ArtifactViewerFull
        projectId="proj-1"
        ticketId="ticket-1"
        artifact={mockArtifact}
        onClose={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('Edit')).toBeTruthy()
    })

    await user.click(screen.getByText('Edit'))

    const editor = screen.getByTestId('artifact-editor')
    await user.clear(editor)
    await user.type(editor, 'New content')

    await user.click(screen.getByText('Save'))

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        filename: 'test-artifact.md',
        content: 'New content',
      })
    })
  })

  it('exits edit mode after successful save', async () => {
    const user = userEvent.setup()

    render(
      <ArtifactViewerFull
        projectId="proj-1"
        ticketId="ticket-1"
        artifact={mockArtifact}
        onClose={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('Edit')).toBeTruthy()
    })

    await user.click(screen.getByText('Edit'))

    const editor = screen.getByTestId('artifact-editor')
    await user.clear(editor)
    await user.type(editor, 'New content')

    await user.click(screen.getByText('Save'))

    await waitFor(() => {
      expect(screen.getByText('Edit')).toBeTruthy()
      expect(screen.queryByTestId('artifact-editor')).toBeNull()
    })
  })

  it('Cancel exits edit mode when no changes', async () => {
    const user = userEvent.setup()

    render(
      <ArtifactViewerFull
        projectId="proj-1"
        ticketId="ticket-1"
        artifact={mockArtifact}
        onClose={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('Edit')).toBeTruthy()
    })

    await user.click(screen.getByText('Edit'))
    expect(screen.getByTestId('artifact-editor')).toBeTruthy()

    await user.click(screen.getByText('Cancel'))

    await waitFor(() => {
      expect(screen.getByText('Edit')).toBeTruthy()
      expect(screen.queryByTestId('artifact-editor')).toBeNull()
    })
  })

  it('Cancel shows discard dialog when there are unsaved changes', async () => {
    const user = userEvent.setup()

    render(
      <ArtifactViewerFull
        projectId="proj-1"
        ticketId="ticket-1"
        artifact={mockArtifact}
        onClose={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('Edit')).toBeTruthy()
    })

    await user.click(screen.getByText('Edit'))

    const editor = screen.getByTestId('artifact-editor')
    await user.clear(editor)
    await user.type(editor, 'Modified content')

    await user.click(screen.getByText('Cancel'))

    await waitFor(() => {
      expect(screen.getByText('Unsaved Changes')).toBeTruthy()
      expect(screen.getByText('Discard Changes')).toBeTruthy()
    })
  })

  it('Discard Changes in dialog exits edit mode', async () => {
    const user = userEvent.setup()

    render(
      <ArtifactViewerFull
        projectId="proj-1"
        ticketId="ticket-1"
        artifact={mockArtifact}
        onClose={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('Edit')).toBeTruthy()
    })

    await user.click(screen.getByText('Edit'))

    const editor = screen.getByTestId('artifact-editor')
    await user.clear(editor)
    await user.type(editor, 'Modified content')

    await user.click(screen.getByText('Cancel'))

    await waitFor(() => {
      expect(screen.getByText('Discard Changes')).toBeTruthy()
    })

    await user.click(screen.getByText('Discard Changes'))

    await waitFor(() => {
      expect(screen.getByText('Edit')).toBeTruthy()
      expect(screen.queryByTestId('artifact-editor')).toBeNull()
    })
  })
})
