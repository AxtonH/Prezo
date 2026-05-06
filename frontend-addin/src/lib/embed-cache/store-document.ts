/**
 * Office document.settings-backed cache store.
 *
 * Slowest tier on read but the only tier that survives the .pptx file being
 * shared to another machine. Office serializes settings into the document
 * XML; once `saveAsync` has run, the cached snapshots travel with the file.
 *
 * The Office settings API is async-callback-based and the underlying
 * persistence is a single key/value bag scoped to the document. We adapt it
 * to the same `CacheStore<T>` shape used by the localStorage adapter so the
 * unified facade can treat them interchangeably.
 *
 * Key design notes:
 *
 *  - `saveAsync` is the only call that actually writes to the document.
 *    `set` updates the in-memory bag immediately (so a subsequent `get`
 *    sees the new value), but cross-machine durability requires a flush.
 *    We expose `flush()` as part of the contract; the prefetcher calls it
 *    after a batch write.
 *
 *  - We never throw. Office hosts (e.g., Office Online without an open
 *    document) can fail any of these calls; cache misses degrade
 *    gracefully into "no cache" rather than breaking the prefetcher.
 *
 *  - Office's settings bag has a soft 2 MB ceiling. With share-safe
 *    snapshots in the 5–50 KB range, we can hold ~40+ sessions per deck
 *    before bumping into the limit. We don't enforce a cap here; the
 *    prefetcher prunes in its own pass.
 */

import type { CacheEntry, CacheStore } from './types'

const VERSION = 1
const ROOT_PREFIX = `prezo:embed-cache:v${VERSION}`

function fullKey(key: string): string {
  return `${ROOT_PREFIX}:${key}`
}

function getSettings(): Office.Settings | null {
  // Office may be undefined entirely (e.g., in unit tests) or partially
  // initialised (Office.context not ready). In both cases we treat the
  // store as inert. The prefetcher already handles "no cache" returns.
  try {
    return (
      (typeof Office !== 'undefined' &&
        Office.context?.document?.settings) ||
      null
    )
  } catch {
    return null
  }
}

export function createDocumentSettingsStore<T = unknown>(): CacheStore<T> {
  return {
    async get(key) {
      const settings = getSettings()
      if (!settings) {
        return null
      }
      try {
        const raw = settings.get(fullKey(key))
        if (!raw) {
          return null
        }
        // Office's settings API can return either the original object or
        // its JSON string depending on host behavior. Normalise to the
        // structured form so callers always see CacheEntry<T>.
        const parsed: CacheEntry<T> | null =
          typeof raw === 'string' ? (JSON.parse(raw) as CacheEntry<T>) : (raw as CacheEntry<T>)
        if (!parsed || typeof parsed.fetchedAt !== 'number') {
          return null
        }
        return parsed
      } catch {
        return null
      }
    },

    async set(key, entry) {
      const settings = getSettings()
      if (!settings) {
        return
      }
      try {
        // Stored as a JSON string for cross-host consistency. Some Office
        // hosts mangle nested objects on round-trip; strings are safe.
        settings.set(fullKey(key), JSON.stringify(entry))
      } catch {
        // Same fail-soft contract as the localStorage adapter.
      }
    },

    async delete(key) {
      const settings = getSettings()
      if (!settings) {
        return
      }
      try {
        settings.remove(fullKey(key))
      } catch {
        // Ignored — consistent with the rest of the store.
      }
    },

    async flush() {
      const settings = getSettings()
      if (!settings) {
        return
      }
      // saveAsync does not return a Promise in the Office types, so we
      // wrap it. Resolves on success or failure; we never reject because
      // a failed flush just means cross-machine durability is delayed
      // until the next save attempt.
      await new Promise<void>((resolve) => {
        try {
          settings.saveAsync(() => resolve())
        } catch {
          resolve()
        }
      })
    },
  }
}
