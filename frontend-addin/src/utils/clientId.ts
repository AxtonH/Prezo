const CLIENT_KEY = 'prezo-client-id'

export function getClientId(): string {
  const existing = localStorage.getItem(CLIENT_KEY)
  if (existing) {
    return existing
  }

  const fallback = `client-${Math.random().toString(36).slice(2, 10)}`
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : fallback

  localStorage.setItem(CLIENT_KEY, id)
  return id
}
