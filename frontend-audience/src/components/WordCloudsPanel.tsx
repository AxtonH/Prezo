import { useMemo } from 'react'

import type { WordCloud } from '../api/types'

interface WordCloudsPanelProps {
  wordClouds: WordCloud[]
  onVote: (wordCloudId: string, wordId: string) => Promise<void>
}

const pickCloud = (wordClouds: WordCloud[]) => {
  if (wordClouds.length === 0) {
    return null
  }
  const openCloud = wordClouds.find((cloud) => cloud.status === 'open')
  if (openCloud) {
    return openCloud
  }
  const sorted = [...wordClouds].sort((a, b) => {
    const aTime = Date.parse(a.created_at)
    const bTime = Date.parse(b.created_at)
    if (Number.isNaN(aTime) || Number.isNaN(bTime)) {
      return 0
    }
    return bTime - aTime
  })
  return sorted[0] ?? wordClouds[0]
}

export function WordCloudsPanel({ wordClouds, onVote }: WordCloudsPanelProps) {
  const activeCloud = useMemo(() => pickCloud(wordClouds), [wordClouds])

  if (!activeCloud) {
    return (
      <div className="panel">
        <h2>Word cloud</h2>
        <p className="muted">No word cloud is live right now.</p>
      </div>
    )
  }

  const totalVotes = activeCloud.words.reduce((sum, word) => sum + word.votes, 0)
  const maxVotes = activeCloud.words.reduce((max, word) => Math.max(max, word.votes), 0)

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>Word cloud</h2>
        <span className={`chip ${activeCloud.status}`}>{activeCloud.status}</span>
      </div>
      <p className="muted">{activeCloud.prompt || 'Choose a word that best fits.'}</p>
      <div className="word-cloud-live">
        {activeCloud.words.map((word) => {
          const ratio = maxVotes > 0 ? word.votes / maxVotes : 0
          const size = 16 + Math.round(ratio * 24)
          return (
            <span
              key={word.id}
              className="word-cloud-token"
              style={{ fontSize: `${size}px`, fontWeight: ratio >= 0.45 ? 700 : 500 }}
            >
              {word.label}
            </span>
          )
        })}
      </div>
      <div className="poll-options">
        {activeCloud.words.map((word) => {
          const percentage = totalVotes ? Math.round((word.votes / totalVotes) * 100) : 0
          return (
            <div key={word.id} className="poll-option">
              <div className="option-main">
                <span>{word.label}</span>
                <span className="muted">{word.votes} votes</span>
              </div>
              <div className="option-bar">
                <span style={{ width: `${percentage}%` }}></span>
              </div>
              {activeCloud.status === 'open' ? (
                <button onClick={() => onVote(activeCloud.id, word.id)}>Vote</button>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}
