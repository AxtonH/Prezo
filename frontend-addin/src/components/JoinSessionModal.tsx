import { useEffect, useMemo, useState } from 'react'

import type { Session } from '../api/types'
import { filterHostSessionsByQuery } from '../utils/joinSessionSearch'

const SUGGESTION_LIMIT = 8

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
  const [query, setQuery] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setQuery('')
      setLocalError(null)
      onClearError()
    }
  }, [open, onClearError])

  const matches = useMemo(() => {
    const all = filterHostSessionsByQuery(query, sessions)
    return all.slice(0, SUGGESTION_LIMIT)
  }, [query, sessions])

  const fullMatchCount = useMemo(
    () => filterHostSessionsByQuery(query, sessions).length,
    [query, sessions]
  )

  const displayError = localError ?? error

  const runSubmit = async () => {
    const q = query.trim()
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
      <div className="relative bg-white rounded-2xl shadow-[0_24px_60px_rgba(15,23,42,0.18)] w-full max-w-md mx-4 overflow-hidden flex flex-col max-h-[min(90vh,36rem)]">
        <div className="px-7 pt-7 pb-2 shrink-0">
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

        <div className="px-7 py-3 space-y-3 flex-1 min-h-0 flex flex-col">
          <div className="relative">
            <input
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setLocalError(null)
                onClearError()
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  onClose()
                  return
                }
                if (e.key === 'Enter' && !isBusy && query.trim()) {
                  e.preventDefault()
                  void runSubmit()
                }
              }}
              placeholder="Session name, code, or full code to join…"
              className="!w-full !rounded-xl !border !border-slate-200 !bg-slate-50 !px-4 !py-3 !text-[15px] focus:!border-primary focus:!ring-2 focus:!ring-primary/20 !outline-none !transition-all placeholder:!text-slate-400"
              autoComplete="off"
              spellCheck={false}
            />
            {sessionsLoading ? (
              <p className="text-xs text-muted mt-1.5 !m-0">Loading your sessions…</p>
            ) : null}
          </div>

          {matches.length > 0 ? (
            <div className="min-h-0 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/80 divide-y divide-slate-100">
              {fullMatchCount > SUGGESTION_LIMIT ? (
                <p className="text-xs text-muted px-3 py-2 !m-0 bg-slate-100/60">
                  Showing {SUGGESTION_LIMIT} of {fullMatchCount} matches — type more to narrow.
                </p>
              ) : null}
              {matches.map((s) => {
                const title = s.title?.trim() || 'Untitled session'
                return (
                  <button
                    key={s.id}
                    type="button"
                    className="!w-full !text-left !px-3 !py-2.5 !flex !items-center !justify-between !gap-3 !border-0 !bg-transparent !shadow-none hover:!bg-white/90 !transition-colors"
                    onClick={() => void onJoinWithSession(s)}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-slate-900 truncate">{title}</span>
                      <span className="font-mono text-xs text-muted tracking-wider">{s.code}</span>
                    </span>
                    {s.is_original_host === false ? (
                      <span className="shrink-0 bg-orange-50 text-orange-800 border border-orange-200/90 px-2 py-0.5 rounded-full text-[0.6rem] font-bold uppercase tracking-wider">
                        Co-Host
                      </span>
                    ) : null}
                  </button>
                )
              })}
            </div>
          ) : null}

          {displayError ? (
            <p className="text-danger text-sm !m-0" role="alert">
              {displayError}
            </p>
          ) : null}
        </div>

        <div className="px-7 pb-7 flex gap-3 shrink-0 border-t border-slate-100 pt-4">
          <button
            type="button"
            onClick={() => void runSubmit()}
            disabled={isBusy || !query.trim() || fullMatchCount > 0}
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
