import { useState } from 'react'

import type { WordCloud } from '../api/types'

interface WordCloudManagerProps {
  wordClouds: WordCloud[]
  onCreate: (words: string[], prompt?: string) => Promise<void>
  onOpen: (wordCloudId: string) => Promise<void>
  onClose: (wordCloudId: string) => Promise<void>
}

const dedupeWords = (words: string[]) => {
  const seen = new Set<string>()
  return words.filter((word) => {
    const key = word.toLowerCase()
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}

export function WordCloudManager({
  wordClouds,
  onCreate,
  onOpen,
  onClose
}: WordCloudManagerProps) {
  const [prompt, setPrompt] = useState('')
  const [words, setWords] = useState<string[]>(['', ''])
  const [error, setError] = useState<string | null>(null)

  const updateWord = (index: number, value: string) => {
    setWords((prev) => prev.map((word, idx) => (idx === index ? value : word)))
  }

  const addWord = () => {
    if (words.length >= 5) {
      return
    }
    setWords((prev) => [...prev, ''])
  }

  const removeWord = (index: number) => {
    setWords((prev) => prev.filter((_, idx) => idx !== index))
  }

  const handleCreate = async () => {
    const cleanedWords = words.map((word) => word.trim()).filter(Boolean)
    const uniqueWords = dedupeWords(cleanedWords)
    if (uniqueWords.length < 2) {
      setError('Enter at least two unique words.')
      return
    }

    setError(null)
    await onCreate(uniqueWords, prompt.trim() || undefined)
    setPrompt('')
    setWords(['', ''])
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>Word cloud</h2>
        <span className="badge">
          Active {wordClouds.filter((cloud) => cloud.status === 'open').length}
        </span>
      </div>

      <div className="poll-creator">
        <div className="field">
          <label htmlFor="word-cloud-prompt">Prompt (optional)</label>
          <input
            id="word-cloud-prompt"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="What word best describes this release?"
          />
        </div>

        <div className="option-list">
          {words.map((word, index) => (
            <div key={`word-${index}`} className="option-row">
              <input
                value={word}
                onChange={(event) => updateWord(index, event.target.value)}
                placeholder={`Word ${index + 1}`}
              />
              {words.length > 2 ? (
                <button className="ghost" onClick={() => removeWord(index)}>
                  Remove
                </button>
              ) : null}
            </div>
          ))}
          <button className="ghost" onClick={addWord} disabled={words.length >= 5}>
            Add word
          </button>
        </div>

        <button className="primary" onClick={handleCreate}>
          Create &amp; open word cloud
        </button>
        {error ? <p className="error">{error}</p> : null}
      </div>

      <div className="poll-list">
        {wordClouds.length === 0 ? (
          <p className="muted">No word clouds yet. Create one to start voting.</p>
        ) : (
          <ul className="list">
            {wordClouds.map((cloud) => (
              <li key={cloud.id} className="list-item">
                <div>
                  <p>{cloud.prompt || 'Word cloud'}</p>
                  <span className="muted">
                    {cloud.words.map((word) => word.label).join(', ')}
                  </span>
                </div>
                <div className="actions">
                  {cloud.status === 'open' ? (
                    <button onClick={() => onClose(cloud.id)}>Close</button>
                  ) : (
                    <button onClick={() => onOpen(cloud.id)}>Open</button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
