import { API_BASE_URL } from '../api/client'

const HOST_BASE_URL =
  import.meta.env.VITE_HOST_BASE_URL?.toString() ?? window.location.origin

/**
 * Build a URL that opens the Prezo Editing Station pre-connected to a session.
 *
 * The Editing Station (poll-game-poc) lives under the same origin as the host
 * console, so we use the host base URL as the root.
 */
export function buildEditingStationUrl(options: {
  sessionId: string
  code?: string | null
  apiBase?: string | null
  pollId?: string | null
}): string {
  const base = HOST_BASE_URL.replace(/\/+$/, '')
  const params = new URLSearchParams()

  params.set('sessionId', options.sessionId)

  if (options.code) {
    params.set('code', options.code)
  }

  const apiBase = options.apiBase || API_BASE_URL
  if (apiBase) {
    params.set('apiBase', apiBase)
  }

  if (options.pollId) {
    params.set('pollId', options.pollId)
  }

  return `${base}/poc/poll-game-poc?${params.toString()}`
}
