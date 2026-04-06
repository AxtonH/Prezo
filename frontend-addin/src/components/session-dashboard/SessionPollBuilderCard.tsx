import { useState } from 'react'

export interface SessionPollBuilderCardProps {
  onCreatePoll: (question: string, options: string[], allowMultiple: boolean) => Promise<void>
  isBusy?: boolean
}

type OptionRow = { id: string; value: string }

function newOptionRow(value = ''): OptionRow {
  return { id: crypto.randomUUID(), value }
}

export function SessionPollBuilderCard({ onCreatePoll, isBusy = false }: SessionPollBuilderCardProps) {
  const [question, setQuestion] = useState('')
  const [options, setOptions] = useState<OptionRow[]>(() => [newOptionRow(), newOptionRow()])
  const [allowMultiple, setAllowMultiple] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const updateOption = (id: string, value: string) => {
    setOptions((prev) => prev.map((row) => (row.id === id ? { ...row, value } : row)))
  }

  const addOption = () => setOptions((prev) => [...prev, newOptionRow()])

  const removeOption = (id: string) => {
    setOptions((prev) => prev.filter((row) => row.id !== id))
  }

  const handleCreate = async () => {
    const trimmedQuestion = question.trim()
    const trimmedOptions = options.map((o) => o.value.trim()).filter(Boolean)
    if (!trimmedQuestion || trimmedOptions.length < 2) {
      setError('Enter a question and at least two options.')
      return
    }
    setError(null)
    try {
      await onCreatePoll(trimmedQuestion, trimmedOptions, allowMultiple)
      setQuestion('')
      setOptions([newOptionRow(), newOptionRow()])
      setAllowMultiple(false)
    } catch {
      /* parent sets page error */
    }
  }

  const inputClass =
    '!w-full !rounded-xl !border !border-slate-200 !bg-slate-50 !px-3 !py-2.5 !text-sm !text-slate-900 focus:!border-primary focus:!ring-2 focus:!ring-primary/20 !outline-none !transition-all placeholder:!text-slate-400'

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-card">
      <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted mb-4">Poll builder</p>

      <div className="space-y-4">
        <div>
          <label htmlFor="poll-builder-question" className="block text-xs font-semibold text-slate-700 mb-1.5">
            Question
          </label>
          <input
            id="poll-builder-question"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="What should we vote on?"
            className={inputClass}
            disabled={isBusy}
          />
        </div>

        <div>
          <p className="text-xs font-semibold text-slate-700 mb-2">Options</p>
          <div className="space-y-2">
            {options.map((row, index) => (
              <div key={row.id} className="flex gap-2 items-center">
                <input
                  value={row.value}
                  onChange={(e) => updateOption(row.id, e.target.value)}
                  placeholder={`Option ${index + 1}`}
                  className={`${inputClass} flex-1`}
                  disabled={isBusy}
                />
                {options.length > 2 ? (
                  <button
                    type="button"
                    onClick={() => removeOption(row.id)}
                    disabled={isBusy}
                    className="!shrink-0 !inline-flex !h-9 !w-9 !items-center !justify-center !rounded-lg !border !border-slate-200 !bg-white !text-muted hover:!bg-slate-50 !shadow-none"
                    aria-label={`Remove option ${index + 1}`}
                  >
                    <span className="material-symbols-outlined text-lg">close</span>
                  </button>
                ) : null}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addOption}
            disabled={isBusy}
            className="!mt-2 !inline-flex !items-center !gap-1 !text-sm !font-semibold !text-primary !bg-transparent !border-0 !p-0 !shadow-none hover:!underline"
          >
            <span className="material-symbols-outlined text-lg">add</span>
            Add option
          </button>
        </div>

        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={allowMultiple}
            onChange={(e) => setAllowMultiple(e.target.checked)}
            disabled={isBusy}
            className="!rounded !border-slate-300 !text-primary focus:!ring-primary/30"
          />
          <span className="text-sm text-slate-700">Allow multiple selections</span>
        </label>

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
              <span className="material-symbols-outlined text-lg">how_to_vote</span>
              Create &amp; open poll
            </>
          )}
        </button>
      </div>
    </div>
  )
}
