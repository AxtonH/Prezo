import { useCallback, useEffect, useState } from 'react'

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

/** Same Material Symbols as `WORKSPACE_NAV_ITEMS` in SideNav (polls, discussion, qna). */
const ACTIVITY_TYPES = [
  {
    id: 'poll' as const,
    icon: 'bar_chart',
    title: 'Poll',
    description: 'Multiple-choice question your audience votes on live.'
  },
  {
    id: 'qna' as const,
    icon: 'chat_bubble',
    title: 'Q&A',
    description: 'Collect and moderate questions from the audience.'
  },
  {
    id: 'discussion' as const,
    icon: 'forum',
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
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeAll()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
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

  const headerIcon =
    step === 'pick'
      ? 'add_circle'
      : step === 'poll'
        ? 'bar_chart'
        : step === 'qna'
          ? 'chat_bubble'
          : 'forum'

  const headerBlurb =
    step === 'pick'
      ? 'Choose what you want to run in this session.'
      : step === 'poll'
        ? 'Add your question and answer choices. The poll opens as soon as you create it.'
        : step === 'qna'
          ? qnaOpen
            ? 'Audience Q&A is already live for this session.'
            : 'Open live audience Q&A so people can send questions.'
          : 'Set a prompt — the discussion opens as soon as you create it.'

  return (
    <>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => {
            setStep('pick')
            setFormError(null)
            setOpen(true)
          }}
          className="!inline-flex !items-center !gap-2 !px-5 !py-2.5 !rounded-xl !text-sm !font-bold !bg-primary !text-white !border-0 !shadow-sm hover:!bg-primary-dark active:!scale-[0.98] !transition-all !shrink-0"
        >
          <span className="material-symbols-outlined text-lg" aria-hidden>
            add_circle
          </span>
          Create activity
        </button>
      </div>

      {open ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          role="presentation"
        >
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={closeAll}
            aria-hidden
          />
          <div
            className="relative z-10 bg-white rounded-2xl shadow-[0_24px_60px_rgba(15,23,42,0.18)] w-full max-h-[min(90vh,40rem)] overflow-hidden flex flex-col max-w-lg"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-activity-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-7 pt-7 pb-2 shrink-0 border-b border-slate-100">
              <div className="flex items-start gap-3">
                {step !== 'pick' ? (
                  <button
                    type="button"
                    onClick={() => {
                      setStep('pick')
                      setFormError(null)
                    }}
                    className="!mt-0.5 !p-1.5 !rounded-lg !border-0 !bg-transparent !text-slate-600 hover:!bg-slate-100 !shadow-none shrink-0"
                    aria-label="Back"
                  >
                    <span className="material-symbols-outlined text-xl">arrow_back</span>
                  </button>
                ) : null}
                <div className="w-9 h-9 bg-primary/10 rounded-xl flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-primary text-xl">{headerIcon}</span>
                </div>
                <div className="min-w-0 flex-1 pr-2">
                  <h2 id="create-activity-title" className="text-lg font-bold text-slate-900 !m-0">
                    {panelTitle}
                  </h2>
                  <p className="text-sm text-muted mt-2 leading-relaxed !m-0">{headerBlurb}</p>
                </div>
                <button
                  type="button"
                  onClick={closeAll}
                  className="!p-1.5 !rounded-lg !border-0 !bg-transparent !text-muted hover:!text-slate-800 hover:!bg-slate-100 !shadow-none shrink-0"
                  aria-label="Close"
                >
                  <span className="material-symbols-outlined text-xl">close</span>
                </button>
              </div>
            </div>

            <div className="px-7 py-5 overflow-y-auto flex-1 min-h-0">
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
                      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-primary"
                      aria-hidden
                    >
                      <span className="material-symbols-outlined text-[1.25rem]">{a.icon}</span>
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
                  <div>
                    <label htmlFor="create-poll-q" className="block text-xs font-bold uppercase tracking-wider text-muted mb-1.5">
                      Question
                    </label>
                    <input
                      id="create-poll-q"
                      value={pollQuestion}
                      onChange={(e) => setPollQuestion(e.target.value)}
                      placeholder="What should we vote on?"
                      className="!w-full !rounded-xl !border !border-slate-200 !bg-slate-50 !px-4 !py-3 !text-[15px] focus:!border-primary focus:!ring-2 focus:!ring-primary/20 !outline-none !transition-all"
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
                          className="!min-w-0 !flex-1 !rounded-xl !border !border-slate-200 !bg-slate-50 !px-4 !py-3 !text-[15px] focus:!border-primary focus:!ring-2 focus:!ring-primary/20 !outline-none !transition-all"
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
                </div>
              ) : null}

              {step === 'qna' ? (
                <div className="space-y-4">
                  {qnaOpen ? (
                    <p className="text-sm text-slate-700 leading-relaxed !m-0">
                      Participants can submit questions; use the activity list below to moderate.
                    </p>
                  ) : (
                    <>
                      {formError ? <p className="text-danger text-sm !m-0">{formError}</p> : null}
                    </>
                  )}
                </div>
              ) : null}

              {step === 'discussion' ? (
                <div className="space-y-4">
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
                      className="!w-full !rounded-xl !border !border-slate-200 !bg-slate-50 !px-4 !py-3 !text-[15px] focus:!border-primary focus:!ring-2 focus:!ring-primary/20 !outline-none resize-y min-h-[6rem] !transition-all"
                    />
                  </div>
                  {formError ? <p className="text-danger text-sm !m-0">{formError}</p> : null}
                </div>
              ) : null}
            </div>

            <div className="px-7 pb-7 flex flex-col sm:flex-row gap-3 shrink-0 border-t border-slate-100 pt-4 bg-white">
              {step === 'pick' ? (
                <button
                  type="button"
                  onClick={closeAll}
                  className="!w-full !bg-transparent !border !border-slate-200 !text-slate-600 !py-3 !rounded-xl !text-sm !font-semibold hover:!bg-slate-50 !transition-all !shadow-none"
                >
                  Cancel
                </button>
              ) : null}

              {step === 'poll' ? (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleCreatePoll()}
                    className="!flex-1 !bg-primary !text-white !py-3 !rounded-xl !text-sm !font-bold hover:!bg-primary-dark active:!scale-[0.98] !transition-all !shadow-sm !border-0 disabled:!opacity-50"
                  >
                    {busy ? 'Creating…' : 'Create & open poll'}
                  </button>
                  <button
                    type="button"
                    onClick={closeAll}
                    className="!bg-transparent !border !border-slate-200 !text-slate-600 !px-5 !py-3 !rounded-xl !text-sm !font-semibold hover:!bg-slate-50 !transition-all !shadow-none sm:!min-w-[7rem]"
                  >
                    Cancel
                  </button>
                </>
              ) : null}

              {step === 'qna' ? (
                <>
                  {qnaOpen ? (
                    <button
                      type="button"
                      onClick={closeAll}
                      className="!flex-1 !bg-primary !text-white !py-3 !rounded-xl !text-sm !font-bold hover:!bg-primary-dark active:!scale-[0.98] !transition-all !shadow-sm !border-0"
                    >
                      Done
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleOpenQna()}
                        className="!flex-1 !bg-primary !text-white !py-3 !rounded-xl !text-sm !font-bold hover:!bg-primary-dark active:!scale-[0.98] !transition-all !shadow-sm !border-0 disabled:!opacity-50"
                      >
                        {busy ? 'Opening…' : 'Open audience Q&A'}
                      </button>
                      <button
                        type="button"
                        onClick={closeAll}
                        className="!bg-transparent !border !border-slate-200 !text-slate-600 !px-5 !py-3 !rounded-xl !text-sm !font-semibold hover:!bg-slate-50 !transition-all !shadow-none sm:!min-w-[7rem]"
                      >
                        Cancel
                      </button>
                    </>
                  )}
                </>
              ) : null}

              {step === 'discussion' ? (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleCreateDiscussion()}
                    className="!flex-1 !bg-primary !text-white !py-3 !rounded-xl !text-sm !font-bold hover:!bg-primary-dark active:!scale-[0.98] !transition-all !shadow-sm !border-0 disabled:!opacity-50"
                  >
                    {busy ? 'Starting…' : 'Create & open discussion'}
                  </button>
                  <button
                    type="button"
                    onClick={closeAll}
                    className="!bg-transparent !border !border-slate-200 !text-slate-600 !px-5 !py-3 !rounded-xl !text-sm !font-semibold hover:!bg-slate-50 !transition-all !shadow-none sm:!min-w-[7rem]"
                  >
                    Cancel
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
