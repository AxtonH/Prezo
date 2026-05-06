/**
 * BroadcastChannel-based pub/sub for cross-iframe cache updates.
 *
 * The host taskpane and the embed iframes all live on the same origin
 * (`prezo-frontend-addin-production.up.railway.app`), so they share a
 * BroadcastChannel namespace. When the host's WebSocket receives a fresh
 * snapshot, it can push the new payload through this channel and every
 * mounted embed iframe with the same sessionId picks it up immediately —
 * no polling, no per-iframe WebSocket roundtrip needed.
 *
 * This is the "cache stays live while the host is open" half of the
 * three-tier strategy. It's deliberately separate from the cache stores
 * so callers that don't need live broadcast (e.g., a one-shot prefetch)
 * don't pay the wiring cost.
 */

const CHANNEL_NAME = 'prezo:embed-cache'

/**
 * Wire-format for messages on the channel. Versioned so we can evolve
 * the shape later (e.g., partial-update events) without breaking older
 * subscribers — they just ignore unknown event types.
 */
export interface SnapshotUpdateEvent {
  v: 1
  type: 'snapshot-update'
  sessionId: string
  /** Full snapshot payload, share-safe. */
  payload: unknown
  /** Wall-clock time of the publishing side, ms since epoch. */
  fetchedAt: number
}

export type CacheChannelEvent = SnapshotUpdateEvent

function isSupported(): boolean {
  return typeof BroadcastChannel !== 'undefined'
}

/**
 * Publish a snapshot update to all open iframes/tabs on this origin.
 * No-op when BroadcastChannel is unavailable (e.g., older browsers,
 * sandboxed iframes that don't share a context).
 */
export function publishSnapshotUpdate(
  sessionId: string,
  payload: unknown,
): void {
  if (!isSupported()) {
    return
  }
  let channel: BroadcastChannel | null = null
  try {
    channel = new BroadcastChannel(CHANNEL_NAME)
    const event: SnapshotUpdateEvent = {
      v: 1,
      type: 'snapshot-update',
      sessionId,
      payload,
      fetchedAt: Date.now(),
    }
    channel.postMessage(event)
  } catch {
    // BroadcastChannel can throw under exotic security contexts; not fatal.
  } finally {
    channel?.close()
  }
}

/**
 * Subscribe to cache events. Returns an unsubscribe function the caller
 * should invoke during teardown (component unmount, iframe close).
 *
 * Filtering by sessionId is the caller's job — the channel is shared
 * across all sessions in the deck, so a callback for session A still
 * receives notifications for session B and must ignore them.
 */
export function subscribeToCacheUpdates(
  handler: (event: CacheChannelEvent) => void,
): () => void {
  if (!isSupported()) {
    return () => undefined
  }
  let channel: BroadcastChannel
  try {
    channel = new BroadcastChannel(CHANNEL_NAME)
  } catch {
    return () => undefined
  }
  const onMessage = (msg: MessageEvent<CacheChannelEvent>) => {
    if (msg.data?.v === 1) {
      handler(msg.data)
    }
  }
  channel.addEventListener('message', onMessage)
  return () => {
    try {
      channel.removeEventListener('message', onMessage)
      channel.close()
    } catch {
      // Already closed; ignored.
    }
  }
}
