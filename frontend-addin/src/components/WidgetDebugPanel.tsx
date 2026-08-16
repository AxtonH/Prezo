import { useState } from 'react'

import { getWidgetDebugLog } from '../office/widgetDebugLog'

/**
 * TEMPORARY field-debugging surface for the stale-widget investigation:
 * dumps the widget update trace (schedule → run → per-slide pass) into a
 * copyable textarea, so no webview console access is needed on any host.
 * Remove together with the logWidgetDebug call sites once the pipeline is
 * proven stable.
 */
export function WidgetDebugPanel() {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')

  const refresh = () => {
    try {
      setText(JSON.stringify(getWidgetDebugLog(), null, 1))
    } catch {
      setText('Failed to serialize the debug log.')
    }
  }

  return (
    <>
      <button
        type="button"
        className="fixed bottom-3 left-3 z-50 rounded-full border border-slate-300 bg-white/95 px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-md hover:bg-slate-50"
        onClick={() => {
          refresh()
          setOpen((value) => !value)
        }}
      >
        Widget debug
      </button>
      {open ? (
        <div className="fixed inset-x-3 bottom-12 z-50 rounded-lg border border-slate-300 bg-white p-3 shadow-xl">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-700">
              Widget update trace (newest last)
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                className="text-xs font-semibold text-blue-600"
                onClick={refresh}
              >
                Refresh
              </button>
              <button
                type="button"
                className="text-xs font-semibold text-slate-500"
                onClick={() => setOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
          <textarea
            readOnly
            value={text}
            className="h-64 w-full resize-none rounded border border-slate-200 bg-slate-50 p-2 font-mono text-[10px] leading-tight text-slate-800"
          />
        </div>
      ) : null}
    </>
  )
}
