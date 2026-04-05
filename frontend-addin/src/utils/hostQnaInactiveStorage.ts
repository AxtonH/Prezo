/** Persist “Q&A was closed” per session so the inactive panel survives a full reload. */

const PREFIX = 'prezo.hostQnaInactive:'

function key(sessionId: string): string {
  return `${PREFIX}${sessionId}`
}

export function setHostQnaInactive(sessionId: string): void {
  try {
    sessionStorage.setItem(key(sessionId), '1')
  } catch {
    /* ignore */
  }
}

export function clearHostQnaInactive(sessionId: string): void {
  try {
    sessionStorage.removeItem(key(sessionId))
  } catch {
    /* ignore */
  }
}

export function readHostQnaInactive(sessionId: string): boolean {
  try {
    return sessionStorage.getItem(key(sessionId)) === '1'
  } catch {
    return false
  }
}

/** Clear all session-scoped flags (e.g. on sign-out). */
export function clearAllHostQnaInactiveFlags(): void {
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i -= 1) {
      const k = sessionStorage.key(i)
      if (k?.startsWith(PREFIX)) {
        sessionStorage.removeItem(k)
      }
    }
  } catch {
    /* ignore */
  }
}
