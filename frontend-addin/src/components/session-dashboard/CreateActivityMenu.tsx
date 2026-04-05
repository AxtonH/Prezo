import { useCallback, useEffect, useRef, useState } from 'react'

export interface CreateActivityMenuProps {
  qnaOpen: boolean
  onCreatePoll: (
    question: string,
    options: string[],
    allowMultiple: boolean
  ) => Promise<void>
  onOpenAudienceQna: () => Promise<void>
  onCreateDiscussionPrompt: (prompt: string) => Promise<void>
}

const ACTIVITY_TYPES = [
  {
    id: 'poll' as const,
    emoji: '📊',
    title: 'Poll',
    description: 'Multiple-choice question your audience votes on live.'
  },
  {
    id: 'qna' as const,
    emoji: '💬',
    title: 'Q&A',
    description: 'Collect and moderate questions from the audience.'
  },
  {
    id: 'discussion' as const,
    emoji: '🗣️',
    title: 'Open discussion',
    description: 'Set a prompt and run a focused thread with your audience.'
  }
]

export function CreateActivityMenu({
  qnaOpen,
  onCreatePoll,
  onOpenAudienceQna,
  onCreateDiscussionPrompt
}: CreateActivityMenuProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<'pick' | 'poll' | 'qna' | 'discussion'>('pick')
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [pollQuestion, setPollQuestion] = useState('')
  const [pollOptions, setPollOptions] = useState<string[]>(['', ''])
  const [pollAllowMultiple, setPollAllowMultiple] = useState(false)

  const [discussionPrompt, setDiscussionPrompt] = useState('')

  const closeAll = useCallback(() => {
    setOpen(false)
    setStep('pick')
    setFormError(null)
    setPollQuestion('')
    setPollOptions(['', ''])
    setPollAllowMultiple(false)
    setDiscussionPrompt('')
  }, [])

  useEffect(() => {
    if (!open) {
      return
    }
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        closeAll()
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeAll()
      }
    }
    document.addEventListener('mousedown', onDoc)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, closeAll])

  const updatePollOption = (index: number, value: string) => {
    setPollOptions((prev) => prev.map((o, i) => (i === index ? value : o)))
  }

  const addPollOption = () => setPollOptions((prev) => [...prev, ''])
  const removePollOption = (index: number) =>
    setPollOptions((prev) => prev.filter((_, i) => i !== index))

  const handleCreatePoll = async () => {
    const q = pollQuestion.trim()
    const opts = pollOptions.map((o) => o.trim()).filter(Boolean)
    if (!q || opts.length < 2) {
      setFormError('Enter a question and at least two options.')
      return
    }
    setFormError(null)
    setBusy(true)
    try {
      await onCreatePoll(q, opts, pollAllowMultiple)
      closeAll()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not create poll.')
    } finally {
      setBusy(false)
    }
  }

  const handleOpenQna = async () => {
    if (qnaOpen) {
      closeAll()
      return
    }
    setFormError(null)
    setBusy(true)
    try {
      await onOpenAudienceQna()
      closeAll()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not open Q&A.')
    } finally {
      setBusy(false)
    }
  }

  const handleCreateDiscussion = async () => {
    const t = discussionPrompt.trim()
    if (!t) {
      setFormError('Enter a prompt for the discussion.')
      return
    }
    setFormError(null)
    setBusy(true)
    try {
      await onCreateDiscussionPrompt(t)
      closeAll()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not start discussion.')
    } finally {
      setBusy(false)
    }
  }

  const panelTitle =
    step === 'pick'
      ? 'New activity'
      : step === 'poll'
        ? 'Create poll'
        : step === 'qna'
          ? 'Audience Q&A'
          : 'Open discussion'

  return (
    <div ref={rootRef} className="relative flex justify-end">
      <button
        type="button"
        onClick={() => {
          if (open) {
            closeAll()
          } else {
            setStep('pick')
            setFormError(null)
            setOpen(true)
          }
        }}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="!inline-flex !items-center !gap-2 !px-5 !py-2.5 !rounded-xl !text-sm !font-bold !bg-primary !text-white !border-0 !shadow-sm hover:!bg-primary-dark active:!scale-[0.98] !transition-all !shrink-0"
      >
        <span className="material-symbols-outlined text-lg" aria-hidden>
          add_circle
        </span>
        Create activity
      </button>

      {open ? (
        <div
          className="absolute right-0 top-[calc(100%+0.5rem)] z-[60] w-[min(calc(100vw-2rem),26rem)] sm:w-[26rem] rounded-2xl border border-slate-200/95 bg-white shadow-[0_16px_48px_rgba(15,23,42,0.14)] overflow-hidden"
          role="dialog"
          aria-label={panelTitle}
        >
          <div className="px-5 pt-4 pb-3 border-b border-slate-100 flex items-center gap-2">
            {step !== 'pick' ? (
              <button
                type="button"
                onClick={() => {
                  setStep('pick')
                  setFormError(null)
                }}
                className="!p-1.5 !rounded-lg !border-0 !bg-transparent !text-slate-600 hover:!bg-slate-100 !shadow-none"
                aria-label="Back"
              >
                <span className="material-symbols-outlined text-xl">arrow_back</span>
              </button>
            ) : null}
            <h3 className="text-base font-bold text-slate-900 flex-1 min-w-0">{panelTitle}</h3>
            <button
              type="button"
              onClick={closeAll}
              className="!p-1.5 !rounded-lg !border-0 !bg-transparent !text-muted hover:!text-slate-800 hover:!bg-slate-100 !shadow-none"
              aria-label="Close"
            >
              <span className="material-symbols-outlined text-xl">close</span>
            </button>
          </div>

          <div className="p-5 max-h-[min(70vh,32rem)] overflow-y-auto">
            {step === 'pick' ? (
              <div className="grid grid-cols-1 gap-3">
                {ACTIVITY_TYPES.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => {
                      setFormError(null)
                      setStep(a.id)
                    }}
                    className="flex gap-4 text-left rounded-xl border border-slate-200 p-4 hover:border-primary/35 hover:bg-slate-50/90 transition-colors"
                  >
                    <span
                      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-2xl"
                      aria-hidden
                    >
                      {a.emoji}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-bold text-slate-900 text-sm">{a.title}</span>
                      <span className="block text-xs text-muted mt-1 leading-relaxed">{a.description}</span>
                    </span>
                  </button>
                ))}
              </div>
            ) : null}

            {step === 'poll' ? (
              <div className="space-y-4">
                <p className="text-sm text-muted leading-relaxed">
                  Add your question and at least two answer choices. The poll opens as soon as you create it.
                </p>
                <div>
                  <label htmlFor="create-poll-q" className="block text-xs font-bold uppercase tracking-wider text-muted mb-1.5">
                    Question
                  </label>
                  <input
                    id="create-poll-q"
                    value={pollQuestion}
                    onChange={(e) => setPollQuestion(e.target.value)}
                    placeholder="What should we vote on?"
                    className="!w-full !rounded-xl !border !border-slate-200 !bg-slate-50 !px-4 !py-2.5 !text-sm focus:!border-primary focus:!ring-2 focus:!ring-primary/20 !outline-none"
                  />
                </div>
                <div className="space-y-2">
                  <span className="block text-xs font-bold uppercase tracking-wider text-muted">Options</span>
                  {pollOptions.map((opt, index) => (
                    <div key={index} className="flex gap-2">
                      <input
                        value={opt}
                        onChange={(e) => updatePollOption(index, e.target.value)}
                        placeholder={`Option ${index + 1}`}
                        className="!min-w-0 !flex-1 !rounded-xl !border !border-slate-200 !bg-slate-50 !px-4 !py-2.5 !text-sm focus:!border-primary focus:!ring-2 focus:!ring-primary/20 !outline-none"
                      />
                      {pollOptions.length > 2 ? (
                        <button
                          type="button"
                          onClick={() => removePollOption(index)}
                          className="!shrink-0 !px-2 !text-xs !font-semibold !text-slate-500 hover:!text-danger !bg-transparent !border-0 !shadow-none"
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={addPollOption}
                    className="!text-sm !font-semibold !text-primary !bg-transparent !border-0 !p-0 !shadow-none hover:!underline"
                  >
                    + Add option
                  </button>
                </div>
                <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-800">
                  <input
                    type="checkbox"
                    checked={pollAllowMultiple}
                    onChange={(e) => setPollAllowMultiple(e.target.checked)}
                    className="!rounded !border-slate-300"
                  />
                  Allow multiple choices
                </label>
                {formError ? <p className="text-danger text-sm !m-0">{formError}</p> : null}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleCreatePoll()}
                  className="!w-full !bg-primary !text-white !py-3 !rounded-xl !text-sm !font-bold hover:!bg-primary-dark disabled:!opacity-50 !border-0 !shadow-sm"
                >
                  {busy ? 'Creating…' : 'Create & open poll'}
                </button>
              </div>
            ) : null}

            {step === 'qna' ? (
              <div className="space-y-4">
                {qnaOpen ? (
                  <>
                    <p className="text-sm text-slate-700 leading-relaxed">
                      Audience Q&amp;A is already open. Participants can submit questions; use the activity list to moderate.
                    </p>
                    <button
                      type="button"
                      onClick={closeAll}
                      className="!w-full !bg-primary !text-white !py-3 !rounded-xl !text-sm !font-bold hover:!bg-primary-dark !border-0 !shadow-sm"
                    >
                      Done
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-muted leading-relaxed">
                      Opens live audience Q&amp;A so people can send questions. You can approve or hide them from the dashboard.
                    </p>
                    {formError ? <p className="text-danger text-sm !m-0">{formError}</p> : null}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleOpenQna()}
                      className="!w-full !bg-primary !text-white !py-3 !rounded-xl !text-sm !font-bold hover:!bg-primary-dark disabled:!opacity-50 !border-0 !shadow-sm"
                    >
                      {busy ? 'Opening…' : 'Open audience Q&A'}
                    </button>
                  </>
                )}
              </div>
            ) : null}

            {step === 'discussion' ? (
              <div className="space-y-4">
                <p className="text-sm text-muted leading-relaxed">
                  The prompt appears to participants. The discussion opens as soon as you create it.
                </p>
                <div>
                  <label htmlFor="create-discussion-prompt" className="block text-xs font-bold uppercase tracking-wider text-muted mb-1.5">
                    Discussion prompt
                  </label>
                  <textarea
                    id="create-discussion-prompt"
                    value={discussionPrompt}
                    onChange={(e) => setDiscussionPrompt(e.target.value)}
                    rows={4}
                    placeholder="What topic should people discuss?"
                    className="!w-full !rounded-xl !border !border-slate-200 !bg-slate-50 !px-4 !py-3 !text-sm focus:!border-primary focus:!ring-2 focus:!ring-primary/20 !outline-none resize-y min-h-[6rem]"
                  />
                </div>
                {formError ? <p className="text-danger text-sm !m-0">{formError}</p> : null}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleCreateDiscussion()}
                  className="!w-full !bg-primary !text-white !py-3 !rounded-xl !text-sm !font-bold hover:!bg-primary-dark disabled:!opacity-50 !border-0 !shadow-sm"
                >
                  {busy ? 'Starting…' : 'Create & open discussion'}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
