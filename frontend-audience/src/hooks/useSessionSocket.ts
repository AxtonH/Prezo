import { useEffect, useRef, useState } from 'react'

import { connectSessionSocket } from '../api/realtime'
import type { SocketStatus } from '../api/realtime'
import type { SessionActivity } from '../api/types'

export function useSessionSocket(
  sessionId: string | null,
  onActivity: (activity: SessionActivity) => void
): SocketStatus {
  const [status, setStatus] = useState<SocketStatus>('disconnected')
  const handlerRef = useRef(onActivity)

  useEffect(() => {
    handlerRef.current = onActivity
  }, [onActivity])

  useEffect(() => {
    if (!sessionId) {
      setStatus('disconnected')
      return undefined
    }

    const socket = connectSessionSocket(sessionId, (activity) => {
      handlerRef.current(activity)
    }, setStatus)

    return () => {
      socket.close()
    }
  }, [sessionId])

  return status
}
