import { useState } from 'react'

interface QuestionComposerProps {
  onSubmit: (text: string) => Promise<void>
}

export function QuestionComposer({ onSubmit }: QuestionComposerProps) {
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
      setError(err instanceof Error ? err.message : 'Failed to send question')
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className="panel">
      <h2>Ask a question</h2>
      <div className="field">
        <label htmlFor="question">Your question</label>
        <input
          id="question"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="What is the timeline for launch?"
        />
      </div>
      <button className="primary" onClick={handleSubmit} disabled={isSending}>
        {isSending ? 'Sending...' : 'Submit question'}
      </button>
      {error ? <p className="error">{error}</p> : null}
    </div>
  )
}