import type { Question } from '../api/types'

interface QaModerationProps {
  pending: Question[]
  approved: Question[]
  onApprove: (questionId: string) => Promise<void>
  onHide: (questionId: string) => Promise<void>
}

export function QaModeration({
  pending,
  approved,
  onApprove,
  onHide
}: QaModerationProps) {
  return (
    <div className="panel">
      <div className="panel-header">
        <h2>Q&amp;A moderation</h2>
        <span className="badge">Pending {pending.length}</span>
      </div>
      <div className="split">
        <div>
          <h3>Pending</h3>
          {pending.length === 0 ? (
            <p className="muted">No questions waiting for approval.</p>
          ) : (
            <ul className="list">
              {pending.map((question) => (
                <li key={question.id} className="list-item">
                  <div>
                    <p>{question.text}</p>
                    <span className="muted">{question.votes} votes</span>
                  </div>
                  <div className="actions">
                    <button onClick={() => onApprove(question.id)}>Approve</button>
                    <button className="ghost" onClick={() => onHide(question.id)}>
                      Hide
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3>Approved</h3>
          {approved.length === 0 ? (
            <p className="muted">Approved questions will appear here.</p>
          ) : (
            <ul className="list">
              {approved.map((question) => (
                <li key={question.id} className="list-item">
                  <div>
                    <p>{question.text}</p>
                    <span className="muted">{question.votes} votes</span>
                  </div>
                  <div className="actions">
                    <button className="ghost" onClick={() => onHide(question.id)}>
                      Hide
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
