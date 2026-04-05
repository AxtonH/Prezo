/**
 * Persist when the host opened audience Q&A (this browser) so the dashboard can merge
 * the Q&A panel with polls/discussions by real open order — the API has no `qna_opened_at`.
 */

const PREFIX = 'prezo.audienceQnaOpenedAt:'

function storageKey(sessionId: string): string {
  return `${PREFIX}${sessionId}`
}

/** Record the instant audience Q&A was opened (overwrites on each open). */
export function setAudienceQnaOpenedAt(sessionId: string, iso?: string): void {
  try {
    sessionStorage.setItem(storageKey(sessionId), iso ?? new Date().toISOString())
  } catch {
    /* ignore quota / private mode */
  }
}

export function readAudienceQnaOpenedAt(sessionId: string): string | null {
  try {
    return sessionStorage.getItem(storageKey(sessionId))
  } catch {
    return null
  }
}

export function clearAudienceQnaOpenedAt(sessionId: string): void {
  try {
    sessionStorage.removeItem(storageKey(sessionId))
  } catch {
    /* ignore */
  }
}

export function clearAllAudienceQnaOpenedAt(): void {
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
