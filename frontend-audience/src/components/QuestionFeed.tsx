import type { QnaMode, Question } from '../api/types'

interface QuestionFeedProps {
  approved: Question[]
  pendingCount: number
  onVote: (questionId: string) => Promise<void>
  mode: QnaMode
}

export function QuestionFeed({ approved, pendingCount, onVote, mode }: QuestionFeedProps) {
  const isPrompt = mode === 'prompt'
  return (
    <div className="panel">
      <div className="panel-header">
        <h2>{isPrompt ? 'Top answers' : 'Live Q&amp;A'}</h2>
        {!isPrompt ? <span className="badge">Pending {pendingCount}</span> : null}
      </div>
      {approved.length === 0 ? (
        <p className="muted">
          {isPrompt
            ? 'No answers yet. Be the first to respond.'
            : 'No approved questions yet. Check back soon.'}
        </p>
      ) : (
        <ul className="list">
          {approved.map((question) => (
            <li key={question.id} className="list-item">
              <div>
                <p>{question.text}</p>
                <span className="muted">{question.votes} votes</span>
              </div>
              <button onClick={() => onVote(question.id)}>Upvote</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
