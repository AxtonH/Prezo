import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { api } from '../api/client'
import type { Session, SessionSnapshot } from '../api/types'

const BATCH = 5

/**
 * When `debouncedQuery` is at least 2 characters, loads `getSnapshot` for sessions
 * missing from an in-memory cache (batched). Bumps `tick` when cache grows so consumers recompute.
 */
export function useHostSearchSnapshotCache(
  sessions: Session[],
  debouncedQuery: string
) {
  const cacheRef = useRef<Map<string, SessionSnapshot>>(new Map())
  const sessionsRef = useRef(sessions)
  sessionsRef.current = sessions
  const [tick, setTick] = useState(0)
  const [loading, setLoading] = useState(false)

  const sessionIdsKey = useMemo(
    () => [...new Set(sessions.map((s) => s.id))].sort().join(','),
    [sessions]
  )

  useEffect(() => {
    const q = debouncedQuery.trim()
    if (q.length < 2) {
      setLoading(false)
      return
    }

    const list = sessionsRef.current
    const missing = list.filter((s) => !cacheRef.current.has(s.id))
    if (missing.length === 0) {
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)

    ;(async () => {
      for (let i = 0; i < missing.length; i += BATCH) {
        if (cancelled) return
        const batch = missing.slice(i, i + BATCH)
        await Promise.all(
          batch.map(async (s) => {
            try {
              const snap = await api.getSnapshot(s.id)
              cacheRef.current.set(s.id, snap)
            } catch {
              /* deleted or forbidden */
            }
          })
        )
        if (!cancelled) {
          setTick((t) => t + 1)
        }
      }
      if (!cancelled) {
        setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [debouncedQuery, sessionIdsKey])

  const getSnapshot = useCallback(
    (sessionId: string) => cacheRef.current.get(sessionId),
    [tick]
  )

  return { getSnapshot, loading, tick }
}
