/**
 * Parser for a single Prezo session-binding XML payload.
 *
 * Bindings are stored as Office Custom XML Parts under the namespace
 * `https://prezo.app/session-binding`. Each part holds the session
 * identifier (and optionally the join code and a backend base URL) for
 * one or more embeds in the deck.
 *
 * The parser is intentionally permissive: missing optional fields, extra
 * elements, namespace-qualified or default-namespace tags all parse
 * cleanly. The only required field is `sessionId` — without it the
 * payload is meaningless and we return `null`.
 *
 * Kept separate from `enumerate.ts` so this module is testable in
 * isolation (no Office API mock required).
 */

export const PREZO_BINDING_NAMESPACE = 'https://prezo.app/session-binding'

export interface DeckBinding {
  /** Required. The session id every embed in this binding refers to. */
  sessionId: string
  /** Optional join code, used by code-mode embeds. */
  code?: string
  /** Optional backend override; falls back to the embed's default API base. */
  apiBaseUrl?: string
}

/**
 * Parse an XML string into a {@link DeckBinding}. Returns `null` for any
 * input that lacks a usable sessionId — including malformed XML, the
 * empty string, and `undefined`. Callers should treat that as "no
 * binding here."
 */
export function parseBindingXml(xml: string | null | undefined): DeckBinding | null {
  if (!xml) {
    return null
  }
  let doc: Document
  try {
    doc = new DOMParser().parseFromString(xml, 'application/xml')
  } catch {
    return null
  }
  // DOMParser returns a parsererror element on malformed input rather than
  // throwing, so we have to detect that explicitly.
  if (doc.getElementsByTagName('parsererror').length > 0) {
    return null
  }

  const sessionId = readNode(doc, 'sessionId')
  if (!sessionId) {
    return null
  }
  const code = readNode(doc, 'code') || undefined
  const apiBaseUrl = readNode(doc, 'apiBaseUrl') || undefined
  return { sessionId, code, apiBaseUrl }
}

/**
 * Reads a node value, preferring the namespaced lookup (matches the
 * historical wrapper behaviour at `poll-game-content.html`) and falling
 * back to a plain tag-name lookup so older bindings without the
 * namespace declaration still parse.
 */
function readNode(doc: Document, name: string): string {
  const ns =
    doc.getElementsByTagNameNS(PREZO_BINDING_NAMESPACE, name)[0]?.textContent ?? ''
  if (ns.trim()) {
    return ns.trim()
  }
  const plain = doc.getElementsByTagName(name)[0]?.textContent ?? ''
  return plain.trim()
}
