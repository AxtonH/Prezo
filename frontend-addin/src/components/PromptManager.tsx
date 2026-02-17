import { useState } from 'react'

import type { QnaPrompt } from '../api/types'

interface PromptManagerProps {
  prompts: QnaPrompt[]
  onCreate: (prompt: string) => Promise<void>
  onOpen: (promptId: string) => Promise<void>
  onClose: (promptId: string) => Promise<void>
  onBindWidget?: (promptId: string | null) => Promise<void>
}

export function PromptManager({
  prompts,
  onCreate,
  onOpen,
  onClose,
  onBindWidget
}: PromptManagerProps) {
  const [promptText, setPromptText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [bindingStatus, setBindingStatus] = useState<string | null>(null)
  const [bindingError, setBindingError] = useState<string | null>(null)

  const handleCreate = async () => {
    const trimmed = promptText.trim()
    if (!trimmed) {
      setError('Enter a prompt question.')
      return
    }
    setError(null)
    try {
      await onCreate(trimmed)
      setPromptText('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create prompt.')
    }
  }

  const handleBind = async (promptId: string | null) => {
    if (!onBindWidget) {
      return
    }
    setBindingStatus(null)
    setBindingError(null)
    try {
      await onBindWidget(promptId)
      setBindingStatus(
        promptId
          ? 'Q&A widget bound to the selected prompt.'
          : 'Q&A widget bound to audience Q&A.'
      )
    } catch (err) {
      setBindingError(
        err instanceof Error ? err.message : 'Failed to update Q&A widget binding.'
      )
    }
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>Prompt Q&amp;A</h2>
        <span className="badge">
          Open {prompts.filter((prompt) => prompt.status === 'open').length}
        </span>
      </div>
      <div className="poll-creator">
        <div className="field">
          <label htmlFor="prompt-question">Prompt question</label>
          <input
            id="prompt-question"
            value={promptText}
            onChange={(event) => setPromptText(event.target.value)}
            placeholder="What should we cover next?"
          />
        </div>
        <button className="primary" onClick={handleCreate}>
          Create &amp; open prompt
        </button>
        {error ? <p className="error">{error}</p> : null}
      </div>
      {onBindWidget ? (
        <div className="poll-binding">
          <p className="muted">
            Select a slide with a Q&amp;A widget to bind it to a prompt below.
          </p>
          <div className="actions">
            <button className="ghost" onClick={() => handleBind(null)}>
              Bind to audience Q&amp;A
            </button>
          </div>
          {bindingStatus ? <p className="muted">{bindingStatus}</p> : null}
          {bindingError ? <p className="error">{bindingError}</p> : null}
        </div>
      ) : null}
      <div className="poll-list">
        {prompts.length === 0 ? (
          <p className="muted">No prompts yet. Create one to start collecting answers.</p>
        ) : (
          <ul className="list">
            {prompts.map((prompt) => (
              <li key={prompt.id} className="list-item">
                <div>
                  <p>{prompt.prompt}</p>
                  <span className="muted">
                    {prompt.status === 'open' ? 'Open' : 'Closed'}
                  </span>
                </div>
                <div className="actions">
                  {prompt.status === 'open' ? (
                    <button onClick={() => onClose(prompt.id)}>Close</button>
                  ) : (
                    <button onClick={() => onOpen(prompt.id)}>Open</button>
                  )}
                  {onBindWidget ? (
                    <button className="ghost" onClick={() => handleBind(prompt.id)}>
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
  )
}
