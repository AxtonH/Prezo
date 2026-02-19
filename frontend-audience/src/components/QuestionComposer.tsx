import { useMemo, useState } from 'react'

import type { QnaMode, Question } from '../api/types'

interface QuestionComposerProps {
  onSubmit: (text: string) => Promise<void>
  mode: QnaMode
  prompt?: string | null
  approvedQuestions?: Question[]
  onUpvote?: (questionId: string) => Promise<void>
}

export function QuestionComposer({
  onSubmit,
  mode,
  prompt,
  approvedQuestions = [],
  onUpvote
}: QuestionComposerProps) {
  const [text, setText] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [visibleCount, setVisibleCount] = useState(5)
  const [votingQuestionIds, setVotingQuestionIds] = useState<Record<string, boolean>>({})
  const [upvotedQuestionIds, setUpvotedQuestionIds] = useState<Record<string, boolean>>({})

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
  const visibleQuestions = useMemo(
    () => approvedQuestions.slice(0, visibleCount),
    [approvedQuestions, visibleCount]
  )
  const hasMoreQuestions = approvedQuestions.length > visibleCount

  const handleUpvote = async (questionId: string) => {
    if (!onUpvote || votingQuestionIds[questionId] || upvotedQuestionIds[questionId]) {
      return
    }
    setVotingQuestionIds((prev) => ({ ...prev, [questionId]: true }))
    try {
      await onUpvote(questionId)
      setUpvotedQuestionIds((prev) => ({ ...prev, [questionId]: true }))
    } finally {
      setVotingQuestionIds((prev) => {
        const next = { ...prev }
        delete next[questionId]
        return next
      })
    }
  }

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
      {!isPrompt ? (
        <div className="top-questions">
          <div className="top-questions-header">
            <h3>Most upvoted questions</h3>
            <span className="badge">{approvedQuestions.length}</span>
          </div>
          {approvedQuestions.length === 0 ? (
            <p className="muted">No approved questions yet.</p>
          ) : (
            <>
              <ul className="list">
                {visibleQuestions.map((question) => {
                  const isVoting = votingQuestionIds[question.id] ?? false
                  const hasUpvoted = upvotedQuestionIds[question.id] ?? false
                  return (
                    <li key={question.id} className="list-item top-question-item">
                      <div className="top-question-main">
                        <p>{question.text}</p>
                        <span className="muted">{question.votes} votes</span>
                      </div>
                      <button
                        className={hasUpvoted ? 'subtle' : ''}
                        onClick={() => handleUpvote(question.id)}
                        disabled={isVoting || hasUpvoted}
                      >
                        {isVoting ? 'Voting...' : hasUpvoted ? 'Upvoted' : 'Upvote'}
                      </button>
                    </li>
                  )
                })}
              </ul>
              {hasMoreQuestions ? (
                <button
                  className="subtle"
                  onClick={() => setVisibleCount((prev) => prev + 5)}
                >
                  Show more
                </button>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}
