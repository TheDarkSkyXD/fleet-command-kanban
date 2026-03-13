import { useEffect, useRef, useCallback, useState } from 'react'

interface UseWebSocketOptions {
  onMessage?: (data: unknown) => void
  onOpen?: () => void
  onClose?: () => void
  enabled?: boolean
}

function getWsUrl(path: string): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}${path}`
}

function useWebSocketConnection(path: string | null, options: UseWebSocketOptions = {}) {
  const { onMessage, onOpen, onClose, enabled = true } = options
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectDelayRef = useRef(1000)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [connected, setConnected] = useState(false)

  // Store callbacks in refs to avoid reconnection on callback changes
  const onMessageRef = useRef(onMessage)
  const onOpenRef = useRef(onOpen)
  const onCloseRef = useRef(onClose)
  onMessageRef.current = onMessage
  onOpenRef.current = onOpen
  onCloseRef.current = onClose

  const send = useCallback((data: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data))
    }
  }, [])

  useEffect(() => {
    if (!path || !enabled) return

    function connect() {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }

      const ws = new WebSocket(getWsUrl(path!))
      wsRef.current = ws

      ws.onopen = () => {
        reconnectDelayRef.current = 1000
        setConnected(true)
        onOpenRef.current?.()
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          onMessageRef.current?.(data)
        } catch {
          // Ignore non-JSON messages
        }
      }

      ws.onclose = () => {
        setConnected(false)
        onCloseRef.current?.()
        // Reconnect with exponential backoff
        reconnectTimerRef.current = setTimeout(() => {
          reconnectDelayRef.current = Math.min(reconnectDelayRef.current * 1.5, 30000)
          connect()
        }, reconnectDelayRef.current)
      }

      ws.onerror = () => {
        ws.close()
      }
    }

    connect()

    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
      }
      if (wsRef.current) {
        wsRef.current.onclose = null // Prevent reconnect on intentional close
        wsRef.current.close()
        wsRef.current = null
      }
      setConnected(false)
    }
  }, [path, enabled])

  return { send, connected }
}

export function useTerminalWebSocket(
  projectId: string | null,
  terminalId: string | null,
  options: UseWebSocketOptions = {}
) {
  const path = projectId && terminalId
    ? `/ws/terminal/${encodeURIComponent(projectId)}/${encodeURIComponent(terminalId)}`
    : null

  return useWebSocketConnection(path, options)
}

export function useDevServerWebSocket(
  projectId: string | null,
  options: UseWebSocketOptions = {}
) {
  const path = projectId
    ? `/ws/devserver/${encodeURIComponent(projectId)}`
    : null

  return useWebSocketConnection(path, options)
}
