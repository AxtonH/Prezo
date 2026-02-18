import { useState } from 'react'

import type { Poll } from '../api/types'

interface PollManagerProps {
  polls: Poll[]
  onCreate: (question: string, options: string[], allowMultiple: boolean) => Promise<void>
  onOpen: (pollId: string) => Promise<void>
  onClose: (pollId: string) => Promise<void>
  onBindWidget?: (pollId: string | null) => Promise<void>
}

export function PollManager({
  polls,
  onCreate,
  onOpen,
  onClose,
  onBindWidget
}: PollManagerProps) {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [question, setQuestion] = useState('')
  const [options, setOptions] = useState<string[]>(['', ''])
  const [allowMultiple, setAllowMultiple] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [bindingStatus, setBindingStatus] = useState<string | null>(null)
  const [bindingError, setBindingError] = useState<string | null>(null)

  const updateOption = (index: number, value: string) => {
    setOptions((prev) => prev.map((option, idx) => (idx === index ? value : option)))
  }

  const addOption = () => {
    setOptions((prev) => [...prev, ''])
  }

  const removeOption = (index: number) => {
    setOptions((prev) => prev.filter((_, idx) => idx !== index))
  }

  const handleCreate = async () => {
    const trimmedQuestion = question.trim()
    const trimmedOptions = options.map((opt) => opt.trim()).filter(Boolean)

    if (!trimmedQuestion || trimmedOptions.length < 2) {
      setError('Enter a question and at least two options.')
      return
    }

    setError(null)
    await onCreate(trimmedQuestion, trimmedOptions, allowMultiple)
    setQuestion('')
    setOptions(['', ''])
    setAllowMultiple(false)
  }

  const handleBind = async (pollId: string | null) => {
    if (!onBindWidget) {
      return
    }
    setBindingStatus(null)
    setBindingError(null)
    try {
      await onBindWidget(pollId)
      setBindingStatus(
        pollId ? 'Poll widget linked to the selected poll.' : 'Poll widget will follow the latest poll.'
      )
    } catch (err) {
      setBindingError(err instanceof Error ? err.message : 'Failed to update poll widget binding.')
    }
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-title">
          <button
            type="button"
            className="collapse-toggle"
            aria-expanded={!isCollapsed}
            aria-label={isCollapsed ? 'Expand polls section' : 'Collapse polls section'}
            onClick={() => setIsCollapsed((prev) => !prev)}
          />
          <h2>Polls</h2>
        </div>
        <span className="badge">Active {polls.filter((poll) => poll.status === 'open').length}</span>
      </div>
      {isCollapsed ? null : (
        <div className="panel-body">
          <div className="poll-creator">
            <div className="field">
              <label htmlFor="poll-question">Poll question</label>
              <input
                id="poll-question"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="What should we cover next?"
              />
            </div>
            <div className="option-list">
              {options.map((option, index) => (
                <div key={`option-${index}`} className="option-row">
                  <input
                    value={option}
                    onChange={(event) => updateOption(index, event.target.value)}
                    placeholder={`Option ${index + 1}`}
                  />
                  {options.length > 2 ? (
                    <button className="ghost" onClick={() => removeOption(index)}>
                      Remove
                    </button>
                  ) : null}
                </div>
              ))}
              <button className="ghost" onClick={addOption}>
                Add option
              </button>
            </div>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={allowMultiple}
                onChange={(event) => setAllowMultiple(event.target.checked)}
              />
              Allow multiple selections
            </label>
            <button className="primary" onClick={handleCreate}>
              Create &amp; open poll
            </button>
            {error ? <p className="error">{error}</p> : null}
          </div>
          {onBindWidget ? (
            <div className="poll-binding">
              <p className="muted">
                Select a slide with a poll widget, then choose which poll it should show.
              </p>
              <div className="actions">
                <button className="ghost" onClick={() => handleBind(null)}>
                  Follow latest poll
                </button>
              </div>
              {bindingStatus ? <p className="muted">{bindingStatus}</p> : null}
              {bindingError ? <p className="error">{bindingError}</p> : null}
            </div>
          ) : null}
          <div className="poll-list">
            {polls.length === 0 ? (
              <p className="muted">No polls yet. Create one to start collecting votes.</p>
            ) : (
              <ul className="list">
                {polls.map((poll) => (
                  <li key={poll.id} className="list-item">
                    <div>
                      <p>{poll.question}</p>
                      <span className="muted">
                        {poll.options.reduce((sum, opt) => sum + opt.votes, 0)} votes
                      </span>
                    </div>
                    <div className="actions">
                      {poll.status === 'open' ? (
                        <button onClick={() => onClose(poll.id)}>Close</button>
                      ) : (
                        <button onClick={() => onOpen(poll.id)}>Open</button>
                      )}
                      {onBindWidget ? (
                        <button className="ghost" onClick={() => handleBind(poll.id)}>
                          Bind widget
                        </button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
