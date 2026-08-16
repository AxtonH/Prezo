/**
 * In-memory trace of the widget update pipeline (schedule → run → per-slide
 * pass), readable from the taskpane's debug panel without webview console
 * access. TEMPORARY field-debugging aid for the stale-widget investigation —
 * remove the call sites once the pipeline is proven stable.
 */

export type WidgetDebugEntry = { at: string; kind: string } & Record<string, unknown>

const MAX_ENTRIES = 250

const entries: WidgetDebugEntry[] = []

export function logWidgetDebug(kind: string, data?: Record<string, unknown>): void {
  entries.push({ at: new Date().toISOString(), kind, ...(data ?? {}) })
  if (entries.length > MAX_ENTRIES) {
    entries.splice(0, entries.length - MAX_ENTRIES)
  }
  try {
    ;(window as unknown as Record<string, unknown>).__prezoWidgetDebug = entries
  } catch {
    // window unavailable — keep the in-memory buffer only
  }
}

export function getWidgetDebugLog(): WidgetDebugEntry[] {
  return entries
}
