/**
 * Shared types for the embed-cache module.
 *
 * The cache is intentionally generic over its payload shape: stores know how
 * to read and write `CacheEntry<T>`, but never inspect the payload itself.
 * This keeps the adapters (localStorage, Office document settings) reusable
 * if we ever cache something other than session snapshots.
 *
 * The session-snapshot specific shape lives in `prefetcher.ts` so the store
 * layer stays decoupled from the API.
 */

/** A cached payload plus the metadata needed to reason about freshness. */
export interface CacheEntry<T = unknown> {
  /** The cached payload, exactly as returned by the origin (after stripping). */
  payload: T
  /** Wall-clock time of the fetch, ms since epoch. Used to decide staleness. */
  fetchedAt: number
  /** Server-provided ETag if available; useful for future revalidation. */
  etag?: string
}

/**
 * Read-only view of a store. Used by the embed iframe's reader, which never
 * writes — only the prefetcher and live subscribers do.
 */
export interface CacheReader<T = unknown> {
  get(key: string): Promise<CacheEntry<T> | null>
}

/**
 * Read-write view. Implementations are: in-process localStorage adapter,
 * Office document.settings adapter, and a unified facade that fans out
 * writes to both and returns the freshest read.
 */
export interface CacheStore<T = unknown> extends CacheReader<T> {
  set(key: string, entry: CacheEntry<T>): Promise<void>
  delete(key: string): Promise<void>
  /**
   * Best-effort durability hint. localStorage writes are durable on `set`;
   * document settings need an explicit save to land in the .pptx file.
   * Callers should call this before relying on the data being persisted
   * across machine boundaries (e.g., after a batch of prefetch writes).
   */
  flush?(): Promise<void>
}
