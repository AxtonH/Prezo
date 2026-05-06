/**
 * Public surface of the embed-cache module.
 *
 * Consumers (host taskpane prefetcher, integration glue) import from this
 * file rather than the individual store files. That keeps the public API
 * small and lets us reorganise internals without ripples.
 */

export type { CacheEntry, CacheReader, CacheStore } from './types'

export {
  createLocalStorageStore,
  clearLocalStorageStore,
} from './store-localstorage'

export { createDocumentSettingsStore } from './store-document'

export {
  createUnifiedStore,
  readFreshest,
  type UnifiedStoreOptions,
} from './store-unified'

export {
  runPrefetch,
  type PrefetcherConfig,
  type PrefetchSummary,
  type SnapshotPayload,
} from './prefetcher'

export {
  publishSnapshotUpdate,
  subscribeToCacheUpdates,
  type CacheChannelEvent,
  type SnapshotUpdateEvent,
} from './broadcast'
