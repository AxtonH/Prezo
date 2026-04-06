import { useState } from 'react'

export interface SessionDiscussionBuilderCardProps {
  onCreateDiscussion: (prompt: string) => Promise<void>
  isBusy?: boolean
}

export function SessionDiscussionBuilderCard({
  onCreateDiscussion,
  isBusy = false
}: SessionDiscussionBuilderCardProps) {
  const [prompt, setPrompt] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleCreate = async () => {
    const trimmed = prompt.trim()
    if (!trimmed) {
      setError('Enter a topic or question to start the discussion.')
      return
    }
    setError(null)
    try {
      await onCreateDiscussion(trimmed)
      setPrompt('')
    } catch {
      /* parent sets page error */
    }
  }

  const inputClass =
    '!w-full !min-h-[6rem] !rounded-xl !border !border-slate-200 !bg-slate-50 !px-3 !py-2.5 !text-sm !text-slate-900 focus:!border-primary focus:!ring-2 focus:!ring-primary/20 !outline-none !transition-all placeholder:!text-slate-400 resize-y'

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-card">
      <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted mb-4">
        Discussion builder
      </p>

      <div className="space-y-4">
        <div>
          <label htmlFor="discussion-builder-prompt" className="block text-xs font-semibold text-slate-700 mb-1.5">
            Topic or question
          </label>
          <textarea
            id="discussion-builder-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="What should the audience discuss?"
            className={inputClass}
            disabled={isBusy}
            rows={4}
          />
        </div>

        {error ? <p className="text-danger text-sm !m-0">{error}</p> : null}

        <button
          type="button"
          onClick={() => void handleCreate()}
          disabled={isBusy}
          className="!w-full !inline-flex !items-center !justify-center !gap-2 !rounded-xl !bg-primary !text-white !py-3 !text-sm !font-bold !border-0 !shadow-sm hover:!bg-primary-dark active:!scale-[0.99] !transition-all disabled:!opacity-50"
        >
          {isBusy ? (
            'Creating…'
          ) : (
            <>
              <span className="material-symbols-outlined text-lg">forum</span>
              Create &amp; open discussion
            </>
          )}
        </button>
      </div>
    </div>
  )
}
