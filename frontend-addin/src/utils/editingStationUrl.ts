import { API_BASE_URL } from '../api/client'

const HOST_BASE_URL =
  import.meta.env.VITE_HOST_BASE_URL?.toString() ?? window.location.origin

/**
 * Build a URL that opens the Prezo Editing Station pre-connected to a session.
 *
 * The Editing Station (poll-game-poc) lives under the same origin as the host
 * console, so we use the host base URL as the root.
 */
/** Which activity the editing station renders (docs/artifact-activity-kinds.md). */
export type EditingStationActivityKind = 'poll' | 'qna' | 'discussion'

export function buildEditingStationUrl(options: {
  sessionId: string
  code?: string | null
  apiBase?: string | null
  pollId?: string | null
  /** Activity kind for the station; omitted/poll keeps the legacy poll flow. */
  activityKind?: EditingStationActivityKind | null
  /** QnaPrompt binding when activityKind is "discussion". */
  promptId?: string | null
  /** Origin of the parent frame (e.g. host console) for safe postMessage targets in the embedded editor. */
  parentOrigin?: string | null
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

  const activityKind = options.activityKind ?? 'poll'
  if (activityKind !== 'poll') {
    params.set('activityKind', activityKind)
    if (activityKind === 'discussion' && options.promptId) {
      params.set('promptId', options.promptId)
    }
  } else if (options.pollId) {
    params.set('pollId', options.pollId)
  }

  if (options.parentOrigin) {
    params.set('parentOrigin', options.parentOrigin)
  }

  return `${base}/poc/poll-game-poc?${params.toString()}`
}
