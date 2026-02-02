import type { Poll } from '../api/types'

interface PollsPanelProps {
  polls: Poll[]
  onVote: (pollId: string, optionId: string) => Promise<void>
}

export function PollsPanel({ polls, onVote }: PollsPanelProps) {
  if (polls.length === 0) {
    return (
      <div className="panel">
        <h2>Polls</h2>
        <p className="muted">No polls are live right now.</p>
      </div>
    )
  }

  return (
    <div className="panel">
      <h2>Polls</h2>
      <div className="polls">
        {polls.map((poll) => {
          const totalVotes = poll.options.reduce((sum, opt) => sum + opt.votes, 0)
          return (
            <div key={poll.id} className="poll-card">
              <div className="poll-header">
                <span>{poll.question}</span>
                <span className={`chip ${poll.status}`}>{poll.status}</span>
              </div>
              <div className="poll-options">
                {poll.options.map((option) => {
                  const percentage = totalVotes
                    ? Math.round((option.votes / totalVotes) * 100)
                    : 0
                  return (
                    <div key={option.id} className="poll-option">
                      <div className="option-main">
                        <span>{option.label}</span>
                        <span className="muted">{option.votes} votes</span>
                      </div>
                      <div className="option-bar">
                        <span style={{ width: `${percentage}%` }}></span>
                      </div>
                      {poll.status === 'open' ? (
                        <button onClick={() => onVote(poll.id, option.id)}>
                          Vote
                        </button>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
