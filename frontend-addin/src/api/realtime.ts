import { API_BASE_URL } from './client'
import type { SessionEvent } from './types'

const wsBaseFromApi = () => {
  const url = new URL(API_BASE_URL)
  const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${url.host}`
}

const WS_BASE_URL =
  import.meta.env.VITE_WS_BASE_URL?.toString() ?? wsBaseFromApi()

export type SocketStatus = 'connecting' | 'connected' | 'disconnected'

export function connectSessionSocket(
  sessionId: string,
  onEvent: (event: SessionEvent) => void,
  onStatus?: (status: SocketStatus) => void
): WebSocket {
  const socket = new WebSocket(`${WS_BASE_URL}/ws/sessions/${sessionId}`)

  onStatus?.('connecting')

  socket.addEventListener('open', () => onStatus?.('connected'))
  socket.addEventListener('close', () => onStatus?.('disconnected'))
  socket.addEventListener('message', (message) => {
    const data = JSON.parse(message.data) as SessionEvent
    onEvent(data)
  })

  return socket
}
