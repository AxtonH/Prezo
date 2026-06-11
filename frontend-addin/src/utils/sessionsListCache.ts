import type { Session, SessionSessionStats } from '../api/types'

/**
 * Last successfully loaded sessions list, persisted so the next taskpane open
 * paints content immediately (stale-while-revalidate). Entries are keyed by
 * user id: a cache written by another account on the same machine is ignored.
 */
const STORAGE_KEY = 'prezo.hostSessionsList.v1'

export interface SessionsListCacheEntry {
  userId: string
  sessions: Session[]
  statsMap: Partial<Record<string, SessionSessionStats | null>>
}

export function readSessionsListCache(
  userId: string
): Pick<SessionsListCacheEntry, 'sessions' | 'statsMap'> | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return null
    }
    const parsed = JSON.parse(raw) as SessionsListCacheEntry
    if (
      !parsed ||
      parsed.userId !== userId ||
      !Array.isArray(parsed.sessions) ||
      typeof parsed.statsMap !== 'object' ||
      parsed.statsMap === null
    ) {
      return null
    }
    return { sessions: parsed.sessions, statsMap: parsed.statsMap }
  } catch {
    return null
  }
}

export function writeSessionsListCache(entry: SessionsListCacheEntry): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entry))
  } catch {
    /* quota exceeded or storage unavailable: the cache is best-effort */
  }
}

export function clearSessionsListCache(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* storage unavailable */
  }
}
