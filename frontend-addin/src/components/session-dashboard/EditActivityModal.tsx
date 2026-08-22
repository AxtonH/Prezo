import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'

import type { Poll, QnaPrompt } from '../../api/types'

/** Structural poll edit computed as a diff against the original poll. */
export interface PollEditUpdate {
  question?: string
  /** option_id → new label, existing options only. */
  options?: Record<string, string>
  add_options?: string[]
  remove_option_ids?: string[]
  allow_multiple?: boolean
}

export type EditActivityTarget =
  | { kind: 'poll'; poll: Poll }
  | { kind: 'discussion'; prompt: QnaPrompt }

export interface EditActivityModalProps {
  /** null → closed. The target snapshot seeds the form when the modal opens. */
  target: EditActivityTarget | null
  onCancel: () => void
  onSavePoll?: (pollId: string, update: PollEditUpdate) => Promise<void>
  onSaveDiscussion?: (promptId: string, prompt: string) => Promise<void>
}

interface OptionRow {
  /** Existing option id, or null for a row added in this edit. */
  id: string | null
  label: string
  votes: number
}

/**
 * Reconfigure an existing activity. Deliberately mirrors the CreateActivityMenu
 * dialog (same fields, spacing, and button styles) so create and edit feel like
 * one flow. Portals to `document.body` for the same reason as
 * DeleteActivityConfirmModal: the activities list lives inside an overflow
 * scroller that would otherwise clip the fixed backdrop.
 */
export function EditActivityModal({
  target,
  onCancel,
  onSavePoll,
  onSaveDiscussion
}: EditActivityModalProps) {
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [question, setQuestion] = useState('')
  const [optionRows, setOptionRows] = useState<OptionRow[]>([])
  const [allowMultiple, setAllowMultiple] = useState(false)
  const [discussionPrompt, setDiscussionPrompt] = useState('')

  const targetKey =
    target === null
      ? null
      : target.kind === 'poll'
        ? `poll:${target.poll.id}`
        : `discussion:${target.prompt.id}`

  useEffect(() => {
    if (!target) {
      return
    }
    setFormError(null)
    setBusy(false)
    if (target.kind === 'poll') {
      setQuestion(target.poll.question)
      setOptionRows(
        target.poll.options.map((opt) => ({
          id: opt.id,
          label: opt.label,
          votes: opt.votes ?? 0
        }))
      )
      setAllowMultiple(target.poll.allow_multiple)
    } else {
      setDiscussionPrompt(target.prompt.prompt)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetKey])

  useEffect(() => {
    if (!target) {
      return
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) {
        onCancel()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [target, busy, onCancel])

  const totalVotes = useMemo(
    () =>
      target?.kind === 'poll'
        ? target.poll.options.reduce((sum, o) => sum + (o.votes ?? 0), 0)
        : 0,
    [target]
  )

  const removedVotedOptions = useMemo(() => {
    if (target?.kind !== 'poll') {
      return 0
    }
    const keptIds = new Set(optionRows.filter((r) => r.id).map((r) => r.id))
    return target.poll.options.filter((o) => !keptIds.has(o.id) && (o.votes ?? 0) > 0)
      .length
  }, [target, optionRows])

  if (!target || typeof document === 'undefined') {
    return null
  }

  const isPoll = target.kind === 'poll'
  const panelTitle = isPoll ? 'Edit poll' : 'Edit discussion'
  const headerIcon = isPoll ? 'bar_chart' : 'forum'
  const headerBlurb = isPoll
    ? 'Update the question and answer choices. Changes go live everywhere immediately.'
    : 'Update the prompt. The change goes live everywhere immediately.'

  const updateOptionRow = (index: number, value: string) => {
    setOptionRows((prev) => prev.map((r, i) => (i === index ? { ...r, label: value } : r)))
  }
  /** Slide widgets render at most 5 option rows — polls are capped to match
   * (legacy polls above the cap can be relabeled or shrunk, never grown). */
  const MAX_POLL_OPTIONS = 5
  const addOptionRow = () =>
    setOptionRows((prev) =>
      prev.length >= MAX_POLL_OPTIONS ? prev : [...prev, { id: null, label: '', votes: 0 }]
    )
  const removeOptionRow = (index: number) =>
    setOptionRows((prev) => prev.filter((_, i) => i !== index))

  const handleSavePoll = async () => {
    if (target.kind !== 'poll' || !onSavePoll) {
      return
    }
    const q = question.trim()
    const rows = optionRows
      .map((r) => ({ ...r, label: r.label.trim() }))
      .filter((r) => r.id !== null || r.label !== '')
    if (!q || rows.filter((r) => r.label !== '').length < 2) {
      setFormError('Enter a question and at least two options.')
      return
    }
    if (rows.some((r) => r.label === '')) {
      setFormError('Options cannot be empty — remove unused ones instead.')
      return
    }

    const original = target.poll
    const update: PollEditUpdate = {}
    if (q !== original.question) {
      update.question = q
    }
    const relabels: Record<string, string> = {}
    for (const row of rows) {
      if (row.id) {
        const before = original.options.find((o) => o.id === row.id)
        if (before && before.label !== row.label) {
          relabels[row.id] = row.label
        }
      }
    }
    if (Object.keys(relabels).length > 0) {
      update.options = relabels
    }
    const keptIds = new Set(rows.filter((r) => r.id).map((r) => r.id))
    const removedIds = original.options.filter((o) => !keptIds.has(o.id)).map((o) => o.id)
    if (removedIds.length > 0) {
      update.remove_option_ids = removedIds
    }
    const added = rows.filter((r) => r.id === null).map((r) => r.label)
    if (added.length > 0) {
      update.add_options = added
    }
    if (allowMultiple !== original.allow_multiple) {
      update.allow_multiple = allowMultiple
    }
    if (Object.keys(update).length === 0) {
      onCancel()
      return
    }

    setFormError(null)
    setBusy(true)
    try {
      await onSavePoll(original.id, update)
      onCancel()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save changes.')
    } finally {
      setBusy(false)
    }
  }

  const handleSaveDiscussion = async () => {
    if (target.kind !== 'discussion' || !onSaveDiscussion) {
      return
    }
    const t = discussionPrompt.trim()
    if (!t) {
      setFormError('Enter a prompt for the discussion.')
      return
    }
    if (t === target.prompt.prompt) {
      onCancel()
      return
    }
    setFormError(null)
    setBusy(true)
    try {
      await onSaveDiscussion(target.prompt.id, t)
      onCancel()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save changes.')
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4" role="presentation">
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={busy ? undefined : onCancel}
        aria-hidden
      />
      <div
        className="relative z-10 bg-white rounded-2xl shadow-[0_24px_60px_rgba(15,23,42,0.18)] w-full max-h-[min(90vh,40rem)] overflow-hidden flex flex-col max-w-lg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-activity-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-7 pt-7 pb-2 shrink-0 border-b border-slate-100">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 bg-primary/10 rounded-xl flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-primary text-xl">{headerIcon}</span>
            </div>
            <div className="min-w-0 flex-1 pr-2">
              <h2 id="edit-activity-title" className="text-lg font-bold text-slate-900 !m-0">
                {panelTitle}
              </h2>
              <p className="text-sm text-muted mt-2 leading-relaxed !m-0">{headerBlurb}</p>
            </div>
            <button
              type="button"
              onClick={busy ? undefined : onCancel}
              className="!p-1.5 !rounded-lg !border-0 !bg-transparent !text-muted hover:!text-slate-800 hover:!bg-slate-100 !shadow-none shrink-0"
              aria-label="Close"
            >
              <span className="material-symbols-outlined text-xl">close</span>
            </button>
          </div>
        </div>

        <div className="px-7 py-5 overflow-y-auto flex-1 min-h-0">
          {isPoll ? (
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="edit-poll-q"
                  className="block text-xs font-bold uppercase tracking-wider text-muted mb-1.5"
                >
                  Question
                </label>
                <input
                  id="edit-poll-q"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="What should we vote on?"
                  className="!w-full !rounded-xl !border !border-slate-200 !bg-slate-50 !px-4 !py-3 !text-[15px] focus:!border-primary focus:!ring-2 focus:!ring-primary/20 !outline-none !transition-all"
                />
              </div>
              <div className="space-y-2">
                <span className="block text-xs font-bold uppercase tracking-wider text-muted">
                  Options
                </span>
                {optionRows.map((row, index) => (
                  <div key={row.id ?? `new-${index}`} className="flex gap-2">
                    <input
                      value={row.label}
                      onChange={(e) => updateOptionRow(index, e.target.value)}
                      placeholder={`Option ${index + 1}`}
                      className="!min-w-0 !flex-1 !rounded-xl !border !border-slate-200 !bg-slate-50 !px-4 !py-3 !text-[15px] focus:!border-primary focus:!ring-2 focus:!ring-primary/20 !outline-none !transition-all"
                    />
                    {optionRows.length > 2 ? (
                      <button
                        type="button"
                        onClick={() => removeOptionRow(index)}
                        title={
                          row.votes > 0
                            ? `Removing this option discards its ${row.votes} ${row.votes === 1 ? 'vote' : 'votes'}`
                            : undefined
                        }
                        className="!shrink-0 !px-2 !text-xs !font-semibold !text-slate-500 hover:!text-danger !bg-transparent !border-0 !shadow-none"
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                ))}
                {optionRows.length < MAX_POLL_OPTIONS ? (
                  <button
                    type="button"
                    onClick={addOptionRow}
                    className="!text-sm !font-semibold !text-primary !bg-transparent !border-0 !p-0 !shadow-none hover:!underline"
                  >
                    + Add option
                  </button>
                ) : (
                  <p className="!m-0 text-xs text-muted">
                    Polls support up to {MAX_POLL_OPTIONS} options.
                  </p>
                )}
              </div>
              <label
                className={`flex items-center gap-2 text-sm text-slate-800 ${
                  totalVotes > 0 ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
                }`}
                title={
                  totalVotes > 0
                    ? 'Choice mode is locked once votes are in. Reset the poll to change it.'
                    : undefined
                }
              >
                <input
                  type="checkbox"
                  checked={allowMultiple}
                  disabled={totalVotes > 0}
                  onChange={(e) => setAllowMultiple(e.target.checked)}
                  className="!rounded !border-slate-300"
                />
                Allow multiple choices
              </label>
              {removedVotedOptions > 0 ? (
                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 !m-0">
                  {removedVotedOptions === 1
                    ? 'A removed option already has votes — those votes will be discarded when you save.'
                    : 'Some removed options already have votes — those votes will be discarded when you save.'}
                </p>
              ) : null}
              {formError ? <p className="text-danger text-sm !m-0">{formError}</p> : null}
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="edit-discussion-prompt"
                  className="block text-xs font-bold uppercase tracking-wider text-muted mb-1.5"
                >
                  Discussion prompt
                </label>
                <textarea
                  id="edit-discussion-prompt"
                  value={discussionPrompt}
                  onChange={(e) => setDiscussionPrompt(e.target.value)}
                  rows={4}
                  placeholder="What topic should people discuss?"
                  className="!w-full !rounded-xl !border !border-slate-200 !bg-slate-50 !px-4 !py-3 !text-[15px] focus:!border-primary focus:!ring-2 focus:!ring-primary/20 !outline-none resize-y min-h-[6rem] !transition-all"
                />
              </div>
              {formError ? <p className="text-danger text-sm !m-0">{formError}</p> : null}
            </div>
          )}
        </div>

        <div className="px-7 pb-7 flex flex-col sm:flex-row gap-3 shrink-0 border-t border-slate-100 pt-4 bg-white">
          <button
            type="button"
            disabled={busy}
            onClick={() => void (isPoll ? handleSavePoll() : handleSaveDiscussion())}
            className="!flex-1 !bg-primary !text-white !py-3 !rounded-xl !text-sm !font-bold hover:!bg-primary-dark active:!scale-[0.98] !transition-all !shadow-sm !border-0 disabled:!opacity-50"
          >
            {busy ? 'Saving…' : 'Save changes'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="!bg-transparent !border !border-slate-200 !text-slate-600 !px-5 !py-3 !rounded-xl !text-sm !font-semibold hover:!bg-slate-50 !transition-all !shadow-none sm:!min-w-[7rem] disabled:!opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
