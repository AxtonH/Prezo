import { API_BASE_URL } from './client'
import type { SessionActivity } from './types'

const wsBaseFromApi = () => {
  const url = new URL(API_BASE_URL)
  const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  // Keep the path: path-based API bases (e.g. a dev proxy) need it on the
  // WS URL too, or the socket bypasses the proxy.
  const basePath = url.pathname.replace(/\/+$/, '')
  return `${protocol}//${url.host}${basePath}`
}

const WS_BASE_URL =
  import.meta.env.VITE_WS_BASE_URL?.toString() ?? wsBaseFromApi()

export type SocketStatus = 'connecting' | 'connected' | 'disconnected'

export interface SessionSocketHandle {
  close: () => void
}

const INITIAL_RETRY_DELAY_MS = 1_000
const MAX_RETRY_DELAY_MS = 15_000
const HEARTBEAT_INTERVAL_MS = 25_000
const HEARTBEAT_TIMEOUT_MS = 5_000
/** Server closes with 1008 when the session doesn't exist — retrying is pointless. */
const CLOSE_CODE_SESSION_GONE = 1008

/**
 * Session socket that survives phone lock, tab switches, and network blips.
 *
 * Mobile browsers kill websockets the moment the page is backgrounded, so a
 * bare WebSocket leaves the audience staring at stale state until they
 * reload. This wrapper reconnects automatically (exponential backoff), and
 * reconnects *immediately* on the signals that mean "the user is back"
 * (visibilitychange/pageshow/online). Recovery is complete on reconnect
 * because the server sends a full session_snapshot to every new socket.
 * A ping/pong heartbeat force-closes half-open sockets the OS never
 * reports as closed.
 */
export function connectSessionSocket(
  sessionId: string,
  onActivity: (activity: SessionActivity) => void,
  onStatus?: (status: SocketStatus) => void
): SessionSocketHandle {
  let socket: WebSocket | null = null
  let closed = false
  let retryDelay = INITIAL_RETRY_DELAY_MS
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null
  let heartbeatDeadline: ReturnType<typeof setTimeout> | null = null

  const stopHeartbeat = () => {
    if (heartbeatTimer !== null) {
      clearInterval(heartbeatTimer)
      heartbeatTimer = null
    }
    if (heartbeatDeadline !== null) {
      clearTimeout(heartbeatDeadline)
      heartbeatDeadline = null
    }
  }

  const startHeartbeat = () => {
    stopHeartbeat()
    heartbeatTimer = setInterval(() => {
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        return
      }
      try {
        socket.send('ping')
      } catch {
        return
      }
      if (heartbeatDeadline === null) {
        heartbeatDeadline = setTimeout(() => {
          heartbeatDeadline = null
          // No traffic since the ping: half-open socket. Force the close
          // event, which schedules the reconnect.
          socket?.close()
        }, HEARTBEAT_TIMEOUT_MS)
      }
    }, HEARTBEAT_INTERVAL_MS)
  }

  const noteTraffic = () => {
    if (heartbeatDeadline !== null) {
      clearTimeout(heartbeatDeadline)
      heartbeatDeadline = null
    }
  }

  const scheduleReconnect = () => {
    if (closed || retryTimer !== null) {
      return
    }
    retryTimer = setTimeout(() => {
      retryTimer = null
      retryDelay = Math.min(retryDelay * 2, MAX_RETRY_DELAY_MS)
      open()
    }, retryDelay)
  }

  /** Skip the backoff — the user just came back or the network returned. */
  const reconnectNow = () => {
    if (closed) {
      return
    }
    if (
      socket &&
      (socket.readyState === WebSocket.OPEN ||
        socket.readyState === WebSocket.CONNECTING)
    ) {
      return
    }
    if (retryTimer !== null) {
      clearTimeout(retryTimer)
      retryTimer = null
    }
    retryDelay = INITIAL_RETRY_DELAY_MS
    open()
  }

  const open = () => {
    if (closed) {
      return
    }
    onStatus?.('connecting')
    const ws = new WebSocket(`${WS_BASE_URL}/ws/sessions/${sessionId}`)
    socket = ws

    ws.addEventListener('open', () => {
      if (ws !== socket) {
        return
      }
      retryDelay = INITIAL_RETRY_DELAY_MS
      onStatus?.('connected')
      startHeartbeat()
    })
    ws.addEventListener('close', (event) => {
      if (ws !== socket) {
        return
      }
      stopHeartbeat()
      onStatus?.('disconnected')
      if (event.code === CLOSE_CODE_SESSION_GONE) {
        return
      }
      scheduleReconnect()
    })
    ws.addEventListener('message', (message) => {
      if (ws !== socket) {
        return
      }
      noteTraffic()
      let data: SessionActivity
      try {
        data = JSON.parse(message.data) as SessionActivity
      } catch {
        return
      }
      if (data.type === 'pong') {
        return
      }
      onActivity(data)
    })
  }

  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      reconnectNow()
    }
  }
  const handleWake = () => reconnectNow()

  document.addEventListener('visibilitychange', handleVisibilityChange)
  window.addEventListener('online', handleWake)
  window.addEventListener('pageshow', handleWake)
  window.addEventListener('focus', handleWake)

  open()

  return {
    close: () => {
      closed = true
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('online', handleWake)
      window.removeEventListener('pageshow', handleWake)
      window.removeEventListener('focus', handleWake)
      if (retryTimer !== null) {
        clearTimeout(retryTimer)
        retryTimer = null
      }
      stopHeartbeat()
      const ws = socket
      socket = null
      ws?.close()
    }
  }
}
