/**
 * Unified facade over the localStorage and document.settings stores.
 *
 * Read strategy: query both, return the entry with the most recent
 * `fetchedAt`. localStorage usually wins on the same device because the
 * host taskpane refreshes it more frequently than it saves the document,
 * but on a brand-new device that opens a shared .pptx, localStorage is
 * empty and the document settings entry wins.
 *
 * Write strategy: write to both. localStorage is durable on `set`;
 * document settings need an explicit `flush()` to actually land in the
 * .pptx file. Callers that care about cross-machine durability
 * (the prefetcher, after a batch write) should call `flush()` once at
 * the end rather than after each set.
 *
 * The facade implements the same `CacheStore<T>` shape so code that
 * doesn't care about the multi-tier nature can treat it as a single
 * store.
 */

import type { CacheEntry, CacheStore } from './types'
import { createLocalStorageStore } from './store-localstorage'
import { createDocumentSettingsStore } from './store-document'

export interface UnifiedStoreOptions<T> {
  /**
   * Override the underlying stores. Primarily used for tests; production
   * callers should leave these undefined and accept the defaults.
   */
  localStore?: CacheStore<T>
  documentStore?: CacheStore<T>
}

export function createUnifiedStore<T = unknown>(
  opts: UnifiedStoreOptions<T> = {},
): CacheStore<T> {
  const local = opts.localStore ?? createLocalStorageStore<T>()
  const doc = opts.documentStore ?? createDocumentSettingsStore<T>()

  return {
    async get(key) {
      // Run reads in parallel: the document settings read can be slow
      // (Office API hop), no reason to make localStorage wait for it.
      const [fromLocal, fromDoc] = await Promise.all([local.get(key), doc.get(key)])

      if (fromLocal && fromDoc) {
        return fromLocal.fetchedAt >= fromDoc.fetchedAt ? fromLocal : fromDoc
      }
      return fromLocal ?? fromDoc
    },

    async set(key, entry) {
      // Fan-out writes; await both so a caller that immediately calls
      // `get` sees a consistent answer. Both adapters are fail-soft, so
      // a failed write in one layer doesn't reject this promise.
      await Promise.all([local.set(key, entry), doc.set(key, entry)])
    },

    async delete(key) {
      await Promise.all([local.delete(key), doc.delete(key)])
    },

    async flush() {
      // localStorage has no flush concept; only the document store's
      // saveAsync needs to be invoked to land bytes in the .pptx file.
      if (doc.flush) {
        await doc.flush()
      }
    },
  }
}

/**
 * Convenience: read a single entry from both stores and return the
 * fresher of the two. Same logic as `createUnifiedStore().get`, exposed
 * separately for callers that don't want to hold a store reference.
 */
export async function readFreshest<T>(
  key: string,
  local: CacheStore<T>,
  doc: CacheStore<T>,
): Promise<CacheEntry<T> | null> {
  const [a, b] = await Promise.all([local.get(key), doc.get(key)])
  if (a && b) {
    return a.fetchedAt >= b.fetchedAt ? a : b
  }
  return a ?? b
}
