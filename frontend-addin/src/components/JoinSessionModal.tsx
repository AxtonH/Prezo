import { useEffect, useMemo, useRef, useState } from 'react'

import type { Session } from '../api/types'
import { filterHostSessionsByQuery } from '../utils/joinSessionSearch'

export interface JoinSessionModalProps {
  open: boolean
  onClose: () => void
  /** The user's sessions (host or co-host), most recent first — same source as the My Sessions list. */
  sessions: Session[]
  /** True only while the very first sessions load is still pending (list empty). */
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

/**
 * Single-purpose join flow: enter a code to join a session you are not on,
 * with all of the user's sessions embedded as instant shortcuts (no dropdown).
 * Typing filters the embedded list; the primary button always joins by code.
 */
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
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  /** Keyboard-highlighted row in the embedded list; -1 = none. */
  const [activeIndex, setActiveIndex] = useState(-1)

  useEffect(() => {
    if (open) {
      setQuery('')
      setLocalError(null)
      setActiveIndex(-1)
      onClearError()
    }
  }, [open, onClearError])

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

  const q = query.trim()

  /** Empty query: all of the user's sessions (scrollable). Otherwise: their matches. */
  const visibleSessions = useMemo(
    () => (q ? filterHostSessionsByQuery(q, sessions) : sessions),
    [q, sessions]
  )

  // The list shrinks as the user types; keep the highlight in range
  useEffect(() => {
    if (activeIndex >= visibleSessions.length) {
      setActiveIndex(visibleSessions.length > 0 ? visibleSessions.length - 1 : -1)
    }
  }, [activeIndex, visibleSessions.length])

  /** aria-activedescendant via setAttribute: the hint linter rejects JSX expressions for ARIA values. */
  useEffect(() => {
    const input = inputRef.current
    if (!input) {
      return
    }
    if (activeIndex >= 0) {
      input.setAttribute('aria-activedescendant', `join-session-option-${activeIndex}`)
    } else {
      input.removeAttribute('aria-activedescendant')
    }
  }, [activeIndex])

  useEffect(() => {
    if (activeIndex < 0) {
      return
    }
    document
      .getElementById(`join-session-option-${activeIndex}`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  const displayError = localError ?? error

  const handlePickSession = (s: Session) => {
    if (isBusy) {
      return
    }
    setLocalError(null)
    onClearError()
    void onJoinWithSession(s)
  }

  const submitCode = () => {
    if (!q || isBusy) {
      return
    }
    setLocalError(null)
    onClearError()
    void onJoinWithCode(q)
  }

  const handleEnter = () => {
    if (isBusy) {
      return
    }
    if (activeIndex >= 0 && activeIndex < visibleSessions.length) {
      const picked = visibleSessions[activeIndex]
      if (picked) {
        handlePickSession(picked)
      }
      return
    }
    if (!q) {
      return
    }
    if (visibleSessions.length === 1) {
      handlePickSession(visibleSessions[0])
      return
    }
    if (visibleSessions.length === 0) {
      submitCode()
      return
    }
    setLocalError('Several of your sessions match — pick one above, or enter a full code.')
  }

  if (!open) {
    return null
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose()
        }
      }}
    >
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />
      <div
        className="relative z-[1] bg-white rounded-2xl shadow-[0_24px_60px_rgba(15,23,42,0.18)] w-full max-w-md mx-4 overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="join-session-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-7 pt-7 pb-2">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 bg-primary/10 rounded-xl flex items-center justify-center">
              <span className="material-symbols-outlined text-primary text-xl">login</span>
            </div>
            <h2 id="join-session-title" className="text-lg font-bold text-slate-900 !m-0">
              Join a session
            </h2>
          </div>
          <p className="text-sm text-muted mt-2 leading-relaxed !m-0">
            Open one of your sessions, or enter a code to join one you&apos;re not on.
          </p>
        </div>

        <div className="px-7 pb-3">
          <div className="flex items-center gap-2 rounded-xl border border-slate-200/90 bg-slate-50/50 px-3 py-2 transition-all duration-200 ease-out focus-within:border-primary/35 focus-within:bg-white focus-within:shadow-sm focus-within:ring-1 focus-within:ring-primary/10">
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
                setQuery(e.target.value)
                setActiveIndex(-1)
                setLocalError(null)
                onClearError()
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  setActiveIndex((i) => Math.min(i + 1, visibleSessions.length - 1))
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  setActiveIndex((i) => (i <= 0 ? -1 : i - 1))
                } else if (e.key === 'Enter') {
                  e.preventDefault()
                  handleEnter()
                }
              }}
              placeholder="Search your sessions or enter a code…"
              aria-controls="join-session-list"
              className="!min-w-0 !flex-1 !bg-transparent !border-none !shadow-none focus:!ring-0 !text-sm !font-medium !tracking-tight !p-0 !text-slate-900 placeholder:!text-slate-400"
            />
            {query ? (
              <button
                type="button"
                className="!flex !h-8 !w-8 !shrink-0 !items-center !justify-center !rounded-lg !border-0 !bg-transparent !p-0 !text-muted hover:!text-slate-800 !shadow-none"
                aria-label="Clear search"
                onClick={() => {
                  setQuery('')
                  setActiveIndex(-1)
                  setLocalError(null)
                  onClearError()
                  inputRef.current?.focus()
                }}
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            ) : null}
          </div>

          <div className="mt-4">
            <p className="text-[0.65rem] font-bold uppercase tracking-widest text-muted !m-0 mb-1.5">
              {q ? 'Matching sessions' : 'Your sessions'}
            </p>
            {visibleSessions.length > 0 ? (
              <ul
                id="join-session-list"
                role="listbox"
                aria-label="Your sessions"
                className="space-y-0.5 max-h-[min(18rem,40vh)] overflow-y-auto -mx-2 px-1"
              >
                {visibleSessions.map((s, i) => (
                  <li
                    key={s.id}
                    role="option"
                    aria-selected="false"
                    /* id + aria-selected via ref: the hint linter rejects JSX expressions for both */
                    ref={(node) => {
                      if (node) {
                        node.id = `join-session-option-${i}`
                        node.setAttribute('aria-selected', activeIndex === i ? 'true' : 'false')
                      }
                    }}
                    tabIndex={0}
                    className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-slate-50 cursor-pointer ${
                      activeIndex === i ? 'bg-slate-50' : ''
                    }`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handlePickSession(s)}
                    onKeyDown={(e) => e.key === 'Enter' && handlePickSession(s)}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-slate-900 truncate">
                        {sessionLabel(s)}
                      </span>
                      <span className="font-mono text-xs font-medium tracking-wider text-muted">
                        {s.code}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      {s.status === 'active' ? (
                        <span className="flex items-center gap-1 text-[0.65rem] font-bold uppercase tracking-wider text-emerald-600">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          Live
                        </span>
                      ) : null}
                      {s.is_original_host === false ? (
                        <span className="bg-orange-50 text-orange-800 border border-orange-200/90 px-2 py-0.5 rounded-full text-[0.6rem] font-bold uppercase tracking-wider">
                          Co-Host
                        </span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            ) : q ? (
              <p className="text-sm text-muted py-2 !m-0">
                None of your sessions match. If this is a code from another host, use Join with
                code.
              </p>
            ) : sessionsLoading ? (
              <p className="text-sm text-muted py-2 !m-0">Loading your sessions…</p>
            ) : (
              <p className="text-sm text-muted py-2 !m-0">
                No sessions yet. Enter a code to join one.
              </p>
            )}
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
            onClick={submitCode}
            disabled={isBusy || !q}
            className="!flex-1 !bg-primary !text-white !py-3 !rounded-xl !text-sm !font-bold hover:!bg-primary-dark active:!scale-[0.98] !transition-all !shadow-sm !border-0 disabled:!opacity-50 disabled:!cursor-not-allowed"
          >
            {isBusy ? 'Joining…' : 'Join with code'}
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
