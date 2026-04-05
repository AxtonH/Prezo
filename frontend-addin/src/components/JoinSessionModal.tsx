import { useEffect, useMemo, useRef, useState } from 'react'

import type { Session } from '../api/types'
import { filterHostSessionsByQuery } from '../utils/joinSessionSearch'

export interface JoinSessionModalProps {
  open: boolean
  onClose: () => void
  /** Active sessions where the user is host or co-host (same source as the All Sessions list). */
  sessions: Session[]
  sessionsLoading?: boolean
  isBusy: boolean
  /** API / load errors from the parent */
  error: string | null
  onClearError: () => void
  onJoinWithSession: (session: Session) => Promise<void>
  onJoinWithCode: (code: string) => Promise<void>
}

function sessionLabel(s: Session) {
  return s.title?.trim() || 'Untitled session'
}

export function JoinSessionModal({
  open,
  onClose,
  sessions,
  sessionsLoading = false,
  isBusy,
  error,
  onClearError,
  onJoinWithSession,
  onJoinWithCode
}: JoinSessionModalProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)

  useEffect(() => {
    if (open) {
      setQuery('')
      setLocalError(null)
      // Do not call setPanelOpen(false) here: it runs after paint and races with
      // autoFocus + onFocus (which sets panelOpen true), hiding the dropdown until
      // the user blurs/refocuses. showPanel is already false while query is ''.
      onClearError()
    }
  }, [open, onClearError])

  useEffect(() => {
    if (!panelOpen) return
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setPanelOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [panelOpen])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const matches = useMemo(
    () => filterHostSessionsByQuery(query, sessions),
    [query, sessions]
  )

  const fullMatchCount = matches.length
  const q = query.trim()
  const showPanel = panelOpen && q.length > 0

  const displayError = localError ?? error

  const runSubmit = async () => {
    if (!q || isBusy) {
      return
    }
    setLocalError(null)
    onClearError()

    const full = filterHostSessionsByQuery(q, sessions)
    if (full.length >= 1) {
      setLocalError('Click a session in the list to open it, or narrow your search.')
      return
    }
    await onJoinWithCode(q)
  }

  const handlePickSession = (s: Session) => {
    setPanelOpen(false)
    void onJoinWithSession(s)
  }

  if (!open) {
    return null
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose()
        }
      }}
    >
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />
      <div
        className="relative z-[1] bg-white rounded-2xl shadow-[0_24px_60px_rgba(15,23,42,0.18)] w-full max-w-md mx-4 overflow-visible"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-7 pt-7 pb-2">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 bg-primary/10 rounded-xl flex items-center justify-center">
              <span className="material-symbols-outlined text-primary text-xl">login</span>
            </div>
            <h2 className="text-lg font-bold text-slate-900 !m-0">Join a session</h2>
          </div>
          <p className="text-sm text-muted mt-2 leading-relaxed !m-0">
            Search your sessions by name or code and click one to open it. To join a session you are not
            listed on, enter its full code and use Join session.
          </p>
        </div>

        <div className="px-7 pb-3">
          <div ref={rootRef} className="relative w-full">
            <div
              className={`flex items-center gap-2 rounded-xl border px-3 py-2 transition-all duration-200 ease-out ${
                showPanel
                  ? 'border-primary/35 bg-white shadow-sm ring-1 ring-primary/10'
                  : 'border-slate-200/90 bg-slate-50/50 hover:border-slate-300/90'
              }`}
            >
              <span className="material-symbols-outlined text-muted flex-shrink-0 text-[1.25rem]">
                search
              </span>
              <input
                ref={inputRef}
                type="text"
                autoFocus
                autoComplete="off"
                spellCheck={false}
                value={query}
                onChange={(e) => {
                  const v = e.target.value
                  setQuery(v)
                  if (v.trim().length > 0) {
                    setPanelOpen(true)
                  }
                  setLocalError(null)
                  onClearError()
                }}
                onFocus={() => setPanelOpen(true)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault()
                    onClose()
                    return
                  }
                  if (e.key === 'Enter' && !isBusy && q) {
                    e.preventDefault()
                    void runSubmit()
                  }
                }}
                placeholder="Session name, code, or full code to join…"
                className="!min-w-0 !flex-1 !bg-transparent !border-none !shadow-none focus:!ring-0 !text-sm !font-medium !tracking-tight !p-0 !text-slate-900 placeholder:!text-slate-400"
                aria-expanded={showPanel}
                aria-controls="join-session-search-results"
                aria-autocomplete="list"
              />
              {query ? (
                <button
                  type="button"
                  className="!flex !h-8 !w-8 !shrink-0 !items-center !justify-center !rounded-lg !border-0 !bg-transparent !p-0 !text-muted hover:!text-slate-800 !shadow-none"
                  aria-label="Clear search"
                  onClick={() => {
                    setQuery('')
                    setLocalError(null)
                    onClearError()
                    inputRef.current?.focus()
                  }}
                >
                  <span className="material-symbols-outlined text-lg">close</span>
                </button>
              ) : null}
            </div>

            {sessionsLoading ? (
              <p className="text-xs text-muted mt-1.5 !m-0">Loading your sessions…</p>
            ) : null}

            {showPanel ? (
              <div
                id="join-session-search-results"
                role="listbox"
                className="absolute left-0 right-0 top-[calc(100%+0.35rem)] z-[110] max-h-[min(24rem,70vh)] overflow-y-auto rounded-xl border border-slate-200/95 bg-white py-2 shadow-[0_16px_40px_rgba(15,23,42,0.12)]"
              >
                {fullMatchCount > 0 ? (
                  <div>
                    <p className="px-3 pb-1.5 pt-1 text-[0.65rem] font-bold uppercase tracking-widest text-muted">
                      Sessions
                    </p>
                    <ul className="space-y-0.5 px-1">
                      {matches.map((s) => (
                        <li key={s.id}>
                          <button
                            type="button"
                            role="option"
                            className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-slate-50"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => handlePickSession(s)}
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-semibold text-slate-900 truncate">
                                {sessionLabel(s)}
                              </span>
                              <span className="font-mono text-xs font-medium tracking-wider text-muted">
                                {s.code}
                              </span>
                            </span>
                            {s.is_original_host === false ? (
                              <span className="shrink-0 bg-orange-50 text-orange-800 border border-orange-200/90 px-2 py-0.5 rounded-full text-[0.6rem] font-bold uppercase tracking-wider">
                                Co-Host
                              </span>
                            ) : null}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="px-3 py-4 text-sm text-muted">
                    No sessions match. Try another name or code, or use Join session with a full code.
                  </p>
                )}
              </div>
            ) : null}
          </div>

          {displayError ? (
            <p className="text-danger text-sm !m-0 mt-3" role="alert">
              {displayError}
            </p>
          ) : null}
        </div>

        <div className="px-7 pb-7 flex gap-3 border-t border-slate-100 pt-4">
          <button
            type="button"
            onClick={() => void runSubmit()}
            disabled={isBusy || !q || fullMatchCount > 0}
            title={
              fullMatchCount > 0
                ? 'Click a session in the list above, or narrow your search to use join by code'
                : undefined
            }
            className="!flex-1 !bg-primary !text-white !py-3 !rounded-xl !text-sm !font-bold hover:!bg-primary-dark active:!scale-[0.98] !transition-all !shadow-sm !border-0 disabled:!opacity-50 disabled:!cursor-not-allowed"
          >
            {isBusy ? 'Joining…' : 'Join session'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="!bg-transparent !border !border-slate-200 !text-slate-600 !px-5 !py-3 !rounded-xl !text-sm !font-semibold hover:!bg-slate-50 !transition-all !shadow-none"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
