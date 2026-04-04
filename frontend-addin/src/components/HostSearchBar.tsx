import { useEffect, useRef, useState } from 'react'

import type { Session } from '../api/types'
import type { HostSearchEventHit } from '../utils/hostSearch'

export type HostSearchBarProps = {
  value: string
  onChange: (value: string) => void
  /** Sessions matching title/code (tab filter already applied). */
  sessionMatches: Session[]
  eventHits: HostSearchEventHit[]
  /** True while snapshots are loading for event search. */
  eventsLoading: boolean
  /** Debounced query length ≥ 2 enables event matching. */
  debouncedQuery: string
  onSelectSession: (session: Session) => void
  /** Clears the search field after navigation. */
  onClear?: () => void
}

function sessionLabel(s: Session) {
  return s.title?.trim() || 'Untitled session'
}

export function HostSearchBar({
  value,
  onChange,
  sessionMatches,
  eventHits,
  eventsLoading,
  debouncedQuery,
  onSelectSession,
  onClear
}: HostSearchBarProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)

  const q = value.trim()
  const dq = debouncedQuery.trim()
  const showEventsSection = dq.length >= 2
  const showPanel = open && q.length > 0

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        inputRef.current?.blur()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const handlePickSession = (s: Session) => {
    onChange('')
    onClear?.()
    setOpen(false)
    onSelectSession(s)
  }

  const handlePickEvent = (hit: HostSearchEventHit) => {
    onChange('')
    onClear?.()
    setOpen(false)
    onSelectSession(hit.session)
  }

  return (
    <div ref={rootRef} className="relative flex-1 min-w-0 max-w-xl">
      <div
        className={`flex items-center gap-2 rounded-xl border px-3 py-2 transition-all duration-200 ease-out ${
          open && q.length > 0
            ? 'border-primary/35 bg-white shadow-sm ring-1 ring-primary/10'
            : 'border-slate-200/90 bg-slate-50/50 hover:border-slate-300/90'
        }`}
      >
        <span className="material-symbols-outlined text-muted flex-shrink-0 text-[1.25rem]">
          search
        </span>
        <input
          ref={inputRef}
          type="search"
          autoComplete="off"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder="Search sessions or events..."
          className="!min-w-0 !flex-1 !bg-transparent !border-none !shadow-none focus:!ring-0 !text-sm !font-medium !tracking-tight !p-0 !text-slate-900 placeholder:!text-slate-400"
          aria-expanded={showPanel}
          aria-controls="host-search-results"
          aria-autocomplete="list"
        />
        {value ? (
          <button
            type="button"
            className="!flex !h-8 !w-8 !shrink-0 !items-center !justify-center !rounded-lg !border-0 !bg-transparent !p-0 !text-muted hover:!text-slate-800 !shadow-none"
            aria-label="Clear search"
            onClick={() => {
              onChange('')
              onClear?.()
              inputRef.current?.focus()
            }}
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        ) : null}
      </div>

      {showPanel ? (
        <div
          id="host-search-results"
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+0.35rem)] z-[60] max-h-[min(24rem,70vh)] overflow-y-auto rounded-xl border border-slate-200/95 bg-white py-2 shadow-[0_16px_40px_rgba(15,23,42,0.12)]"
        >
          {sessionMatches.length > 0 ? (
            <div>
              <p className="px-3 pb-1.5 pt-1 text-[0.65rem] font-bold uppercase tracking-widest text-muted">
                Sessions
              </p>
              <ul className="space-y-0.5 px-1">
                {sessionMatches.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      role="option"
                      className="flex w-full flex-col gap-0.5 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-slate-50"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handlePickSession(s)}
                    >
                      <span className="text-sm font-semibold text-slate-900 truncate">
                        {sessionLabel(s)}
                      </span>
                      <span className="font-mono text-xs font-medium tracking-wider text-muted">
                        {s.code}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {showEventsSection ? (
            <div className={sessionMatches.length > 0 ? 'mt-2 border-t border-slate-100 pt-2' : ''}>
              <p className="px-3 pb-1.5 pt-1 text-[0.65rem] font-bold uppercase tracking-widest text-muted">
                Polls &amp; questions
              </p>
              {eventsLoading && eventHits.length === 0 ? (
                <p className="px-3 py-3 text-sm text-muted">Searching sessions…</p>
              ) : null}
              {!eventsLoading && eventHits.length === 0 && sessionMatches.length === 0 ? (
                <p className="px-3 py-2 text-sm text-muted">
                  No matching polls or questions. Try another keyword.
                </p>
              ) : null}
              {!eventsLoading && eventHits.length === 0 && sessionMatches.length > 0 ? (
                <p className="px-3 pb-2 text-xs text-muted">No polls or questions match this search.</p>
              ) : null}
              <ul className="space-y-0.5 px-1">
                {eventHits.map((hit, i) => {
                  const key = `${hit.session.id}-${hit.kind}-${
                    hit.kind === 'poll'
                      ? hit.poll.id
                      : hit.kind === 'question'
                        ? hit.question.id
                        : hit.prompt.id
                  }-${i}`
                  let primary = ''
                  if (hit.kind === 'poll') primary = hit.poll.question
                  else if (hit.kind === 'question') primary = hit.question.text
                  else primary = hit.prompt.prompt
                  const sub = sessionLabel(hit.session)
                  return (
                    <li key={key}>
                      <button
                        type="button"
                        role="option"
                        className="flex w-full flex-col gap-0.5 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-slate-50"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => handlePickEvent(hit)}
                      >
                        <span className="text-[0.65rem] font-bold uppercase tracking-wider text-primary/90">
                          {hit.kind === 'poll'
                            ? 'Poll'
                            : hit.kind === 'question'
                              ? 'Question'
                              : 'Q&A prompt'}
                        </span>
                        <span className="text-sm font-medium text-slate-900 line-clamp-2">{primary}</span>
                        <span className="text-xs text-muted truncate">{sub}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          ) : null}

          {sessionMatches.length === 0 && !showEventsSection ? (
            <p className="px-3 py-4 text-sm text-muted">No sessions match. Try a different name or code.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
