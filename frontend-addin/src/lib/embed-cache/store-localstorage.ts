/**
 * localStorage-backed cache store.
 *
 * Fastest tier: synchronous reads under the hood, sub-millisecond hit, no
 * Office API or network involved. Lives per-browser-per-device, so it does
 * not survive being shared to another machine — that's what the document
 * settings store is for.
 *
 * Keys are namespaced under a single root prefix so the cache can be wiped
 * wholesale (e.g., on user sign-out) without clobbering unrelated keys, and
 * so cache layout changes can be rolled out by bumping the version segment.
 */

import type { CacheEntry, CacheStore } from './types'

const VERSION = 1
const ROOT_PREFIX = `prezo:embed-cache:v${VERSION}`

function fullKey(key: string): string {
  return `${ROOT_PREFIX}:${key}`
}

function isStorageAvailable(): boolean {
  // Some Office hosts disable storage in iframes via sandbox attributes; we
  // probe instead of trusting `typeof window.localStorage` because the
  // accessor itself can throw under those policies.
  try {
    return typeof window !== 'undefined' && Boolean(window.localStorage)
  } catch {
    return false
  }
}

export function createLocalStorageStore<T = unknown>(): CacheStore<T> {
  return {
    async get(key) {
      if (!isStorageAvailable()) {
        return null
      }
      try {
        const raw = window.localStorage.getItem(fullKey(key))
        if (!raw) {
          return null
        }
        const parsed = JSON.parse(raw) as CacheEntry<T>
        // Defensive: a corrupted entry from an older client should not
        // surface as a usable cache hit. Require both the payload and the
        // fetchedAt fields to be present.
        if (!parsed || typeof parsed.fetchedAt !== 'number') {
          return null
        }
        return parsed
      } catch {
        // Quota errors, JSON parse failures, sandbox blocks — all
        // map to "no cache". Cache misses are non-fatal.
        return null
      }
    },

    async set(key, entry) {
      if (!isStorageAvailable()) {
        return
      }
      try {
        window.localStorage.setItem(fullKey(key), JSON.stringify(entry))
      } catch {
        // Quota exceeded is the realistic failure here. The next layer
        // (document settings) is still durable, so we just drop the hot
        // cache write rather than throw.
      }
    },

    async delete(key) {
      if (!isStorageAvailable()) {
        return
      }
      try {
        window.localStorage.removeItem(fullKey(key))
      } catch {
        // Unreachable under normal browser behavior; ignored for safety.
      }
    },
  }
}

/**
 * Removes every embed-cache entry from localStorage regardless of session.
 * Intended for sign-out and "reset cache" flows. Safe to call when storage
 * is unavailable.
 */
export function clearLocalStorageStore(): void {
  if (!isStorageAvailable()) {
    return
  }
  try {
    const toRemove: string[] = []
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const k = window.localStorage.key(i)
      if (k && k.startsWith(`${ROOT_PREFIX}:`)) {
        toRemove.push(k)
      }
    }
    for (const k of toRemove) {
      window.localStorage.removeItem(k)
    }
  } catch {
    // Same swallow rationale as the store methods.
  }
}
