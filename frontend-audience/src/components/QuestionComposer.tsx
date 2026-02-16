import { useState } from 'react'

import type { QnaMode } from '../api/types'

interface QuestionComposerProps {
  onSubmit: (text: string) => Promise<void>
  mode: QnaMode
  prompt?: string | null
}

export function QuestionComposer({ onSubmit, mode, prompt }: QuestionComposerProps) {
  const [text, setText] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    const trimmed = text.trim()
    if (!trimmed) {
      return
    }
    setError(null)
    setIsSending(true)
    try {
      await onSubmit(trimmed)
      setText('')
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : isPrompt
            ? 'Failed to send answer'
            : 'Failed to send question'
      )
    } finally {
      setIsSending(false)
    }
  }

  const isPrompt = mode === 'prompt'

  return (
    <div className="panel">
      <h2>{isPrompt ? 'Answer the host question' : 'Ask a question'}</h2>
      {isPrompt && prompt ? (
        <div className="prompt-card">
          <span className="eyebrow">Prompt</span>
          <p>{prompt}</p>
        </div>
      ) : null}
      <div className="field">
        <label htmlFor="question">{isPrompt ? 'Your answer' : 'Your question'}</label>
        <input
          id="question"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={
            isPrompt ? 'Share your answer...' : 'What is the timeline for launch?'
          }
        />
      </div>
      <button className="primary" onClick={handleSubmit} disabled={isSending}>
        {isSending ? 'Sending...' : isPrompt ? 'Submit answer' : 'Submit question'}
      </button>
      {error ? <p className="error">{error}</p> : null}
    </div>
  )
}
