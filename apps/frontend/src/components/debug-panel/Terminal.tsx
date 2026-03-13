import { useEffect, useRef, useCallback } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { useTerminalWebSocket } from '@/hooks/useWebSocket'
import type { TerminalMessage } from '@fleet-command/shared'

interface TerminalProps {
  projectId: string
  terminalId: string
}

const THEME = {
  background: '#0c0c0e',
  foreground: '#d4d4d8',
  cursor: '#d4d4d8',
  cursorAccent: '#0c0c0e',
  selectionBackground: '#3f3f46',
  selectionForeground: '#fafafa',
  black: '#18181b',
  red: '#ef4444',
  green: '#22c55e',
  yellow: '#eab308',
  blue: '#3b82f6',
  magenta: '#a855f7',
  cyan: '#06b6d4',
  white: '#d4d4d8',
  brightBlack: '#52525b',
  brightRed: '#f87171',
  brightGreen: '#4ade80',
  brightYellow: '#facc15',
  brightBlue: '#60a5fa',
  brightMagenta: '#c084fc',
  brightCyan: '#22d3ee',
  brightWhite: '#fafafa',
}

export function Terminal({ projectId, terminalId }: TerminalProps) {
  const termRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<XTerm | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const sendRef = useRef<((data: unknown) => void) | null>(null)

  const handleMessage = useCallback((data: unknown) => {
    const msg = data as TerminalMessage
    if (!xtermRef.current) return

    if (msg.type === 'output' && msg.data) {
      const decoded = atob(msg.data)
      xtermRef.current.write(decoded)
    } else if (msg.type === 'exit') {
      xtermRef.current.write('\r\n\x1b[33mProcess exited. Press any key to reconnect...\x1b[0m')
    }
  }, [])

  const { send, connected } = useTerminalWebSocket(projectId, terminalId, {
    onMessage: handleMessage
  })

  // Keep send ref updated
  sendRef.current = send

  // Initialize xterm
  useEffect(() => {
    if (!termRef.current) return

    const xterm = new XTerm({
      theme: THEME,
      fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", Menlo, monospace',
      fontSize: 13,
      lineHeight: 1.2,
      scrollback: 10000,
      cursorBlink: true,
      cursorStyle: 'bar',
      allowProposedApi: true,
    })

    const fitAddon = new FitAddon()
    xterm.loadAddon(fitAddon)
    xterm.open(termRef.current)

    xtermRef.current = xterm
    fitAddonRef.current = fitAddon

    // Fit after open with slight delay for layout
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        fitAddon.fit()
      })
    })

    // Handle user input → send to server
    xterm.onData((data: string) => {
      const msg: TerminalMessage = {
        type: 'input',
        data: btoa(data),
      }
      sendRef.current?.(msg)
    })

    // Resize observer to auto-fit terminal
    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        try {
          fitAddon.fit()
        } catch {
          // Ignore fit errors during layout transitions
        }
      })
    })
    resizeObserver.observe(termRef.current)

    return () => {
      resizeObserver.disconnect()
      xterm.dispose()
      xtermRef.current = null
      fitAddonRef.current = null
    }
  }, [])

  // Send resize when terminal dimensions change
  useEffect(() => {
    if (!xtermRef.current || !connected) return

    const xterm = xtermRef.current
    const disposable = xterm.onResize(({ cols, rows }) => {
      const msg: TerminalMessage = {
        type: 'resize',
        cols,
        rows,
      }
      sendRef.current?.(msg)
    })

    // Send initial resize
    const fitAddon = fitAddonRef.current
    if (fitAddon) {
      try {
        fitAddon.fit()
      } catch { /* ignore */ }
    }

    const msg: TerminalMessage = {
      type: 'resize',
      cols: xterm.cols,
      rows: xterm.rows,
    }
    sendRef.current?.(msg)

    return () => disposable.dispose()
  }, [connected])

  return (
    <div
      ref={termRef}
      className="h-full w-full"
      style={{ padding: '4px 0 0 4px' }}
    />
  )
}
