import { API_BASE_URL } from './client'
import type { SessionActivity } from './types'

const wsBaseFromApi = () => {
  const url = new URL(API_BASE_URL)
  const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${url.host}`
}

const WS_BASE_URL =
  import.meta.env.VITE_WS_BASE_URL?.toString() ?? wsBaseFromApi()

export type SocketStatus = 'connecting' | 'connected' | 'disconnected'

/** Reconnect tuning mirrors the gamified station feed
 * (public/poc/gamified/poll-game-gamified-session-feed.js). */
const RECONNECT_INITIAL_DELAY_MS = 2800
const RECONNECT_MAX_DELAY_MS = 20000
/** Client-side heartbeat: the server answers "ping" with a pong activity, so a
 * healthy-but-quiet session still produces regular traffic. */
const HEARTBEAT_INTERVAL_MS = 20000
/** No traffic (activity or pong) within this window means the socket is
 * half-open — force-close it so the reconnect path takes over. Without this,
 * a dead-but-not-closed socket reports 'connected' forever, which also keeps
 * the HTTP snapshot fallback disabled. */
const STALE_SOCKET_TIMEOUT_MS = 45000

/** Close code the server uses for unrecoverable rejections (session not found). */
const WS_CLOSE_POLICY_VIOLATION = 1008

export type SessionSocketHandle = {
  close: () => void
}

export function connectSessionSocket(
  sessionId: string,
  onActivity: (activity: SessionActivity) => void,
  onStatus?: (status: SocketStatus) => void
): SessionSocketHandle {
  let socket: WebSocket | null = null
  let stopped = false
  let reconnectDelayMs = RECONNECT_INITIAL_DELAY_MS
  let reconnectTimer: number | null = null
  let heartbeatTimer: number | null = null
  let lastMessageAt = Date.now()

  const clearReconnectTimer = () => {
    if (reconnectTimer !== null) {
      window.clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
  }

  const scheduleReconnect = () => {
    if (stopped || reconnectTimer !== null) {
      return
    }
    const delay = reconnectDelayMs
    reconnectDelayMs = Math.min(delay * 2, RECONNECT_MAX_DELAY_MS)
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null
      connect()
    }, delay)
  }

  const heartbeatTick = () => {
    const current = socket
    if (!current || current.readyState !== WebSocket.OPEN) {
      return
    }
    if (Date.now() - lastMessageAt > STALE_SOCKET_TIMEOUT_MS) {
      /** Half-open socket: pings went unanswered. close() fires the 'close'
       * handler, which schedules the reconnect. */
      current.close()
      return
    }
    try {
      current.send('ping')
    } catch {
      /* Send failure surfaces as a close event; reconnect happens there. */
    }
  }

  const connect = () => {
    if (stopped) {
      return
    }
    onStatus?.('connecting')
    const next = new WebSocket(`${WS_BASE_URL}/ws/sessions/${sessionId}`)
    socket = next

    next.addEventListener('open', () => {
      if (socket !== next) {
        return
      }
      lastMessageAt = Date.now()
      reconnectDelayMs = RECONNECT_INITIAL_DELAY_MS
      onStatus?.('connected')
    })

    next.addEventListener('message', (message) => {
      if (socket !== next) {
        return
      }
      lastMessageAt = Date.now()
      let data: SessionActivity
      try {
        data = JSON.parse(message.data) as SessionActivity
      } catch {
        return
      }
      if (data?.type === 'pong') {
        return
      }
      onActivity(data)
    })

    next.addEventListener('close', (event) => {
      if (socket !== next) {
        return
      }
      socket = null
      /** Session gone (server closed with 1008): retrying would loop forever. */
      if (event.code === WS_CLOSE_POLICY_VIOLATION) {
        stopped = true
      }
      onStatus?.('disconnected')
      scheduleReconnect()
    })
  }

  connect()
  heartbeatTimer = window.setInterval(heartbeatTick, HEARTBEAT_INTERVAL_MS)

  return {
    close: () => {
      stopped = true
      clearReconnectTimer()
      if (heartbeatTimer !== null) {
        window.clearInterval(heartbeatTimer)
        heartbeatTimer = null
      }
      const current = socket
      socket = null
      current?.close()
    }
  }
}
