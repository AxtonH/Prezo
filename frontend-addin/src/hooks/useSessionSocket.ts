import { useEffect, useRef, useState } from 'react'

import { connectSessionSocket } from '../api/realtime'
import type { SocketStatus } from '../api/realtime'
import type { SessionEvent } from '../api/types'

export function useSessionSocket(
  sessionId: string | null,
  onEvent: (event: SessionEvent) => void
): SocketStatus {
  const [status, setStatus] = useState<SocketStatus>('disconnected')
  const handlerRef = useRef(onEvent)

  useEffect(() => {
    handlerRef.current = onEvent
  }, [onEvent])

  useEffect(() => {
    if (!sessionId) {
      setStatus('disconnected')
      return undefined
    }

    const socket = connectSessionSocket(sessionId, (event) => {
      handlerRef.current(event)
    }, setStatus)

    return () => {
      socket.close()
    }
  }, [sessionId])

  return status
}
