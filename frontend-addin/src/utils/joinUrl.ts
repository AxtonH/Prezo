const AUDIENCE_BASE_URL =
  import.meta.env.VITE_AUDIENCE_BASE_URL?.toString() ?? 'http://localhost:5174'

const normalizeBaseUrl = (value: string) => value.replace(/\/+$/, '')

const isLocalhostUrl = (value: string) => {
  try {
    const { hostname } = new URL(value)
    return hostname === 'localhost' || hostname === '127.0.0.1'
  } catch {
    return true
  }
}

export const buildJoinUrl = (code: string, baseUrl = AUDIENCE_BASE_URL) =>
  `${normalizeBaseUrl(baseUrl)}/join/${encodeURIComponent(code)}`

export const resolveJoinUrl = (
  session: { join_url?: string | null; code?: string | null } | null
) => {
  if (!session) {
    return ''
  }
  if (session.join_url && !isLocalhostUrl(session.join_url)) {
    return session.join_url
  }
  if (session.code) {
    return buildJoinUrl(session.code)
  }
  return session.join_url ?? ''
}

export { AUDIENCE_BASE_URL }
