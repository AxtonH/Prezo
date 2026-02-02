import type { Question } from '../api/types'

interface QuestionFeedProps {
  approved: Question[]
  pendingCount: number
  onVote: (questionId: string) => Promise<void>
}

export function QuestionFeed({ approved, pendingCount, onVote }: QuestionFeedProps) {
  return (
    <div className="panel">
      <div className="panel-header">
        <h2>Live Q&amp;A</h2>
        <span className="badge">Pending {pendingCount}</span>
      </div>
      {approved.length === 0 ? (
        <p className="muted">No approved questions yet. Check back soon.</p>
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
