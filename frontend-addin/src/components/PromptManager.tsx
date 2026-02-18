import { useState } from 'react'
import type { ReactNode } from 'react'

import type { QnaPrompt, Question } from '../api/types'

interface PromptManagerProps {
  prompts: QnaPrompt[]
  questions: Question[]
  onCreate: (prompt: string) => Promise<void>
  onOpen: (promptId: string) => Promise<void>
  onClose: (promptId: string) => Promise<void>
  onApprove: (questionId: string) => Promise<void>
  onHide: (questionId: string) => Promise<void>
  onBindDiscussionWidget?: (promptId: string | null) => Promise<void>
}

export function PromptManager({
  prompts,
  questions,
  onCreate,
  onOpen,
  onClose,
  onApprove,
  onHide,
  onBindDiscussionWidget
}: PromptManagerProps) {
  const [isCollapsed, setIsCollapsed] = useState(false)
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
    if (!onBindDiscussionWidget) {
      return
    }
    setBindingStatus(null)
    setBindingError(null)
    try {
      await onBindDiscussionWidget(promptId)
      setBindingStatus(
        promptId
          ? 'Open discussion widget bound to the selected prompt.'
          : 'Open discussion widget binding cleared.'
      )
    } catch (err) {
      setBindingError(
        err instanceof Error
          ? err.message
          : 'Failed to update open discussion widget binding.'
      )
    }
  }

  const renderQuestionList = (
    items: Question[],
    emptyMessage: string,
    renderActions: (question: Question) => ReactNode
  ) => {
    if (items.length === 0) {
      return <p className="muted">{emptyMessage}</p>
    }
    return (
      <ul className="list">
        {items.map((question) => (
          <li key={question.id} className="list-item">
            <div>
              <p>{question.text}</p>
              <span className="muted">{question.votes} votes</span>
            </div>
            <div className="actions">{renderActions(question)}</div>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-title">
          <button
            type="button"
            className="collapse-toggle"
            aria-expanded={!isCollapsed}
            aria-label={
              isCollapsed
                ? 'Expand open discussion section'
                : 'Collapse open discussion section'
            }
            onClick={() => setIsCollapsed((prev) => !prev)}
          />
          <h2>Open discussion</h2>
        </div>
        <span className="badge">
          Open {prompts.filter((prompt) => prompt.status === 'open').length}
        </span>
      </div>
      {isCollapsed ? null : (
        <div className="panel-body">
          <div className="poll-creator">
            <div className="field">
              <label htmlFor="prompt-question">Discussion prompt</label>
              <input
                id="prompt-question"
                value={promptText}
                onChange={(event) => setPromptText(event.target.value)}
                placeholder="What should we cover next?"
              />
            </div>
            <button className="primary" onClick={handleCreate}>
              Create open discussion
            </button>
            {error ? <p className="error">{error}</p> : null}
          </div>
          <div className="poll-list">
            {prompts.length === 0 ? (
              <p className="muted">No discussions yet. Create a prompt to collect answers.</p>
            ) : (
              <ul className="list">
                {prompts.map((prompt) => {
                  const promptQuestions = questions.filter(
                    (question) => question.prompt_id === prompt.id
                  )
                  const pending = promptQuestions.filter(
                    (question) => question.status === 'pending'
                  )
                  const approved = promptQuestions.filter(
                    (question) => question.status === 'approved'
                  )
                  const hasQuestions = pending.length > 0 || approved.length > 0

                  return (
                    <li key={prompt.id} className="list-item prompt-item">
                      <div className="prompt-row">
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
                          {onBindDiscussionWidget ? (
                            <button className="ghost" onClick={() => handleBind(prompt.id)}>
                              Bind widget
                            </button>
                          ) : null}
                        </div>
                      </div>
                      <div className="prompt-moderation">
                        {!hasQuestions ? (
                          <p className="muted">No answers yet.</p>
                        ) : (
                          <div className="moderation-columns">
                            <div>
                              <div className="section-label">Pending</div>
                              {renderQuestionList(
                                pending,
                                'No answers waiting for approval.',
                                (question) => (
                                  <>
                                    <button onClick={() => onApprove(question.id)}>
                                      Approve
                                    </button>
                                    <button
                                      className="ghost"
                                      onClick={() => onHide(question.id)}
                                    >
                                      Hide
                                    </button>
                                  </>
                                )
                              )}
                            </div>
                            <div>
                              <div className="section-label">Approved</div>
                              {renderQuestionList(
                                approved,
                                'No approved answers yet.',
                                (question) => (
                                  <button className="ghost" onClick={() => onHide(question.id)}>
                                    Hide
                                  </button>
                                )
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
          {onBindDiscussionWidget ? (
            <div className="poll-binding">
              {bindingStatus ? <p className="muted">{bindingStatus}</p> : null}
              {bindingError ? <p className="error">{bindingError}</p> : null}
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
