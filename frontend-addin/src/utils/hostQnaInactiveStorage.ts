/**
 * Persist whether this browser has used session Q&A so the inactive card can show
 * after Q&A is closed (same idea as closed polls / prompts living in API state).
 */

const PREFIX_ENGAGED = 'prezo.hostQnaEngaged:'
const PREFIX_LEGACY = 'prezo.hostQnaInactive:'

function keyEngaged(sessionId: string): string {
  return `${PREFIX_ENGAGED}${sessionId}`
}

function keyLegacy(sessionId: string): string {
  return `${PREFIX_LEGACY}${sessionId}`
}

/** Mark that this session’s Q&A channel has been used (opened and/or closed). */
export function setHostQnaEngaged(sessionId: string): void {
  try {
    sessionStorage.setItem(keyEngaged(sessionId), '1')
  } catch {
    /* ignore quota / private mode */
  }
}

/** True if we should show the inactive Q&A panel when `!qna_open`. */
export function readHostQnaEngaged(sessionId: string): boolean {
  try {
    if (sessionStorage.getItem(keyEngaged(sessionId)) === '1') {
      return true
    }
    if (sessionStorage.getItem(keyLegacy(sessionId)) === '1') {
      return true
    }
    return false
  } catch {
    return false
  }
}

export function clearHostQnaSessionFlags(sessionId: string): void {
  try {
    sessionStorage.removeItem(keyEngaged(sessionId))
    sessionStorage.removeItem(keyLegacy(sessionId))
  } catch {
    /* ignore */
  }
}

/** @deprecated Use readHostQnaEngaged — same behavior (legacy + engaged keys). */
export function readHostQnaInactive(sessionId: string): boolean {
  return readHostQnaEngaged(sessionId)
}

/** @deprecated Use setHostQnaEngaged — writes engaged flag. */
export function setHostQnaInactive(sessionId: string): void {
  setHostQnaEngaged(sessionId)
}

/** @deprecated Use clearHostQnaSessionFlags */
export function clearHostQnaInactive(sessionId: string): void {
  clearHostQnaSessionFlags(sessionId)
}

/** Clear all session-scoped Q&A flags (e.g. on sign-out). */
export function clearAllHostQnaInactiveFlags(): void {
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i -= 1) {
      const k = sessionStorage.key(i)
      if (k?.startsWith(PREFIX_ENGAGED) || k?.startsWith(PREFIX_LEGACY)) {
        sessionStorage.removeItem(k)
      }
    }
  } catch {
    /* ignore */
  }
}
