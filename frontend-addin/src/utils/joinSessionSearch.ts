import type { Session } from '../api/types'

/**
 * Match sessions the user can open as host or co-host: partial session code or title substring.
 */
export function filterHostSessionsByQuery(query: string, sessions: Session[]): Session[] {
  const raw = query.trim()
  if (!raw) {
    return []
  }
  const qLower = raw.toLowerCase()
  const qCode = raw.toUpperCase().replace(/\s+/g, '')

  return sessions.filter((s) => {
    const code = s.code.toUpperCase().replace(/\s+/g, '')
    if (qCode && code.includes(qCode)) {
      return true
    }
    const title = (s.title ?? '').trim().toLowerCase()
    if (title && title.includes(qLower)) {
      return true
    }
    return false
  })
}
