/**
 * Prefetcher: warms the embed cache for every Prezo session in the open
 * deck before the user clicks into a slide.
 *
 * Run by the host taskpane shortly after Office.onReady. The host has a
 * fully-resolved fetch (auth headers, base URL) which is why the
 * prefetcher takes its dependencies as constructor arguments rather than
 * pulling them from a global. That keeps this module testable and
 * decouples it from the host's specific networking choices.
 *
 * The prefetcher never throws — it returns a summary of what happened so
 * callers can log or surface progress. A failed prefetch leaves the
 * existing cache untouched; the embed iframe's existing cold-load path
 * remains the safety net.
 */

import { enumerateBindingsFromDocument, type DeckBinding } from '../embed-deck'
import { createUnifiedStore } from './store-unified'
import type { CacheEntry, CacheStore } from './types'

/** What we cache: the snapshot payload as returned by the backend. */
export interface SnapshotPayload {
  session: unknown
  questions: unknown[]
  polls: unknown[]
  prompts: unknown[]
}

export interface PrefetcherConfig {
  /** Base URL of the backend API (no trailing slash). */
  apiBase: string
  /**
   * fetch implementation, typically the host taskpane's authenticated
   * wrapper. Must include any required auth headers itself; the prefetcher
   * does not add them.
   */
  fetch: typeof globalThis.fetch
  /**
   * Override the cache store; defaults to the unified
   * (localStorage + document settings) store. Tests inject mocks here.
   */
  store?: CacheStore<SnapshotPayload>
}

export interface PrefetchSummary {
  /** Number of cache entries written successfully. */
  cached: number
  /** Bindings discovered in the deck (cached + uncached). */
  discovered: number
  /** True if the network call succeeded (regardless of how many sessions). */
  ok: boolean
}

/**
 * Run one prefetch pass. Idempotent: safe to call repeatedly. The host
 * taskpane calls this once at initialize and may schedule additional
 * passes when the deck changes (slide added, embed inserted, etc.).
 */
export async function runPrefetch(
  config: PrefetcherConfig,
): Promise<PrefetchSummary> {
  const bindings = await enumerateBindingsFromDocument()
  if (bindings.length === 0) {
    return { cached: 0, discovered: 0, ok: true }
  }

  const ids = uniqueSessionIds(bindings)
  const url = buildBatchUrl(config.apiBase, ids)

  let payload: Record<string, SnapshotPayload>
  try {
    const response = await config.fetch(url)
    if (!response.ok) {
      return { cached: 0, discovered: bindings.length, ok: false }
    }
    payload = (await response.json()) as Record<string, SnapshotPayload>
  } catch {
    return { cached: 0, discovered: bindings.length, ok: false }
  }

  const store = config.store ?? createUnifiedStore<SnapshotPayload>()
  const fetchedAt = Date.now()

  // Write all entries before flushing once at the end. Flushing is the
  // expensive Office saveAsync round-trip; doing it per-entry would
  // serialise the whole batch unnecessarily.
  let cached = 0
  await Promise.all(
    Object.entries(payload).map(async ([sessionId, snapshot]) => {
      if (!snapshot) {
        return
      }
      const entry: CacheEntry<SnapshotPayload> = {
        payload: snapshot,
        fetchedAt,
      }
      await store.set(sessionId, entry)
      cached += 1
    }),
  )

  if (store.flush) {
    await store.flush()
  }

  return { cached, discovered: bindings.length, ok: true }
}

function uniqueSessionIds(bindings: DeckBinding[]): string[] {
  const seen = new Set<string>()
  const ids: string[] = []
  for (const b of bindings) {
    if (!seen.has(b.sessionId)) {
      seen.add(b.sessionId)
      ids.push(b.sessionId)
    }
  }
  return ids
}

function buildBatchUrl(apiBase: string, ids: string[]): string {
  // Deliberately not URL-encoding the comma — the backend splits on it.
  // Each id IS URL-encoded so a forward-slash or weird char doesn't
  // break the path.
  const csv = ids.map(encodeURIComponent).join(',')
  const trimmed = apiBase.endsWith('/') ? apiBase.slice(0, -1) : apiBase
  return `${trimmed}/sessions/snapshots?ids=${csv}`
}
