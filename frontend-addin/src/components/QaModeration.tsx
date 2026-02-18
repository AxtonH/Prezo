import type { ReactNode } from 'react'

import type { QnaPrompt, Question } from '../api/types'

interface QaModerationProps {
  pending: Question[]
  approved: Question[]
  prompts?: QnaPrompt[]
  onApprove: (questionId: string) => Promise<void>
  onHide: (questionId: string) => Promise<void>
}

export function QaModeration({
  pending,
  approved,
  prompts = [],
  onApprove,
  onHide
}: QaModerationProps) {
  const promptMap = new Map(prompts.map((prompt) => [prompt.id, prompt.prompt]))
  const promptOrder = prompts.map((prompt) => prompt.id)
  const renderPromptLabel = (promptId: string | null | undefined) => {
    if (!promptId) {
      return 'Audience Q&A'
    }
    const promptText = promptMap.get(promptId)
    return promptText ? promptText : 'Prompt (unknown)'
  }

  const groupQuestions = (items: Question[]) => {
    const groups = new Map<string, Question[]>()
    items.forEach((question) => {
      const key = question.prompt_id ?? 'audience'
      const bucket = groups.get(key) ?? []
      bucket.push(question)
      groups.set(key, bucket)
    })

    const orderedKeys = [
      ...(groups.has('audience') ? ['audience'] : []),
      ...promptOrder.filter((id) => groups.has(id))
    ]
    const remainingKeys = [...groups.keys()].filter((key) => !orderedKeys.includes(key))
    const keys = [...orderedKeys, ...remainingKeys]

    return keys.map((key) => ({
      key,
      label: key === 'audience' ? 'Audience Q&A' : renderPromptLabel(key),
      items: groups.get(key) ?? []
    }))
  }

  const renderGroupedList = (
    items: Question[],
    emptyMessage: string,
    renderActions: (question: Question) => ReactNode
  ) => {
    if (items.length === 0) {
      return <p className="muted">{emptyMessage}</p>
    }
    return (
      <div className="prompt-groups">
        {groupQuestions(items).map((group) => (
          <div key={group.key} className="prompt-group">
            <div className="prompt-label">{group.label}</div>
            <ul className="list">
              {group.items.map((question) => (
                <li key={question.id} className="list-item">
                  <div>
                    <p>{question.text}</p>
                    <span className="muted">{question.votes} votes</span>
                  </div>
                  <div className="actions">{renderActions(question)}</div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>Q&amp;A moderation</h2>
        <span className="badge">Pending {pending.length}</span>
      </div>
      <div className="split">
        <div>
          <h3>Pending</h3>
          {renderGroupedList(pending, 'No questions waiting for approval.', (question) => (
            <>
              <button onClick={() => onApprove(question.id)}>Approve</button>
              <button className="ghost" onClick={() => onHide(question.id)}>
                Hide
              </button>
            </>
          ))}
        </div>
        <div>
          <h3>Approved</h3>
          {renderGroupedList(approved, 'Approved questions will appear here.', (question) => (
            <button className="ghost" onClick={() => onHide(question.id)}>
              Hide
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
