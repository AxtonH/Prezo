/**
 * React hook that runs the embed-cache prefetcher once per host taskpane
 * mount, when running inside PowerPoint and the user is signed in.
 *
 * The hook is the integration seam between App.tsx and the prefetcher.
 * Keeping it as a hook (rather than calling runPrefetch directly from
 * App.tsx) lets us evolve the trigger conditions — e.g., re-running on
 * deck-change events, retrying on transient failures — without touching
 * the host shell.
 *
 * Failure mode: silent. A failed prefetch is non-fatal; the embed
 * iframes' existing cold-load path is the safety net. We log to the
 * console so that prefetch issues are diagnosable in the field, but do
 * not surface anything to the user.
 */

import { useEffect, useRef } from 'react'

import { getAccessToken } from '../../auth/auth'
import { API_BASE_URL } from '../../api/client'
import { isPowerPointAddinHost } from '../../utils/officeHost'
import { runPrefetch } from './prefetcher'

export function useEmbedPrefetch(): void {
  const ranRef = useRef(false)

  useEffect(() => {
    // Only relevant inside PowerPoint — outside the host there are no
    // bindings to enumerate and no point hitting the batch endpoint.
    if (!isPowerPointAddinHost()) {
      return
    }
    // Guard against React 18 StrictMode's double-effect-run in
    // development. The prefetcher is idempotent (safe to run twice) but
    // a second pass wastes a network call.
    if (ranRef.current) {
      return
    }
    ranRef.current = true

    void runPrefetch({
      apiBase: API_BASE_URL,
      fetch: authedFetch,
    })
      .then((summary) => {
        if (summary.discovered > 0) {
          // Useful in production logs to confirm the prefetcher saw the
          // deck and warmed the cache. No-op when the deck has no bindings.
          // eslint-disable-next-line no-console
          console.info(
            `[embed-cache] prefetched ${summary.cached}/${summary.discovered} sessions`,
          )
        }
      })
      .catch(() => {
        // runPrefetch already swallows errors and returns ok:false; this
        // catch is purely a guard against future implementation changes.
      })
  }, [])
}

/**
 * Authenticated fetch wrapper for the prefetcher. Mirrors what
 * `api/client.ts` does for its own requests so the two paths stay
 * consistent. Bearer token is fetched fresh on each call so a stale
 * cached token in the prefetcher doesn't outlive a sign-out.
 */
async function authedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers)
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  try {
    const token = await getAccessToken()
    if (token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`)
    }
  } catch {
    // No token = unauthenticated request. The batch endpoint allows
    // anonymous reads, so we proceed regardless.
  }
  return fetch(input, { ...init, headers })
}
