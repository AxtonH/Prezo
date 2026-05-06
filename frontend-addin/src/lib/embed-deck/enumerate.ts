/**
 * Enumerate every Prezo session binding present in the open deck.
 *
 * Reads all Office Custom XML Parts under the Prezo binding namespace,
 * parses each, and returns a deduped list of bindings keyed by
 * `sessionId`. The host taskpane prefetcher uses this to know which
 * sessions to warm before the user navigates into an embed.
 *
 * Limitations to be aware of:
 *
 *  - URL-only embeds (configured with `?sessionId=` query params and no
 *    persisted binding) are NOT discoverable through this path. They
 *    will fall through to the cold-load path on first slide click. A
 *    future enhancement could reconcile against the embed-state server
 *    so those embeds get prefetched too; for now the conservative
 *    behaviour is "we prefetch what the document tells us about."
 *
 *  - The Office API for custom XML parts is callback-based and can be
 *    unavailable (e.g., in unit tests, in Office hosts that disable
 *    customXmlParts in iframes). All those failure modes degrade
 *    gracefully into "no bindings found"; the prefetcher then no-ops.
 */

import {
  PREZO_BINDING_NAMESPACE,
  parseBindingXml,
  type DeckBinding,
} from './binding'

/**
 * Resolves with every {@link DeckBinding} parsed out of the document.
 * Never rejects — callers don't need defensive try/catch.
 */
export async function enumerateBindingsFromDocument(): Promise<DeckBinding[]> {
  const parts = await getPartsByNamespace(PREZO_BINDING_NAMESPACE)
  if (parts.length === 0) {
    return []
  }

  // Pull XML from every part in parallel rather than awaiting them in
  // sequence — Office API calls have observable latency.
  const xmlBlobs = await Promise.all(parts.map(getXml))

  const seen = new Set<string>()
  const result: DeckBinding[] = []
  for (const xml of xmlBlobs) {
    const parsed = parseBindingXml(xml)
    if (!parsed || seen.has(parsed.sessionId)) {
      continue
    }
    seen.add(parsed.sessionId)
    result.push(parsed)
  }
  return result
}

function getPartsByNamespace(
  namespace: string,
): Promise<Office.CustomXmlPart[]> {
  return new Promise((resolve) => {
    let parts: Office.CustomXmlParts | null = null
    try {
      parts = (typeof Office !== 'undefined' &&
        Office.context?.document?.customXmlParts) || null
    } catch {
      parts = null
    }
    if (!parts) {
      resolve([])
      return
    }
    try {
      parts.getByNamespaceAsync(namespace, (result) => {
        if (result.status === Office.AsyncResultStatus.Succeeded) {
          resolve(result.value || [])
        } else {
          resolve([])
        }
      })
    } catch {
      resolve([])
    }
  })
}

function getXml(part: Office.CustomXmlPart): Promise<string> {
  return new Promise((resolve) => {
    try {
      part.getXmlAsync((result) => {
        if (result.status === Office.AsyncResultStatus.Succeeded) {
          resolve(result.value || '')
        } else {
          resolve('')
        }
      })
    } catch {
      resolve('')
    }
  })
}
