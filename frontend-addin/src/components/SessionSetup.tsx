import { useState } from 'react'
import { QRCodeCanvas } from 'qrcode.react'

import type { Session } from '../api/types'
import { resolveJoinUrl } from '../utils/joinUrl'

interface SessionSetupProps {
  session: Session | null
  onCreate: (title: string) => Promise<void>
}

export function SessionSetup({ session, onCreate }: SessionSetupProps) {
  const [title, setTitle] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCreate = async () => {
    setError(null)
    setIsCreating(true)
    try {
      await onCreate(title.trim())
      setTitle('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create session')
    } finally {
      setIsCreating(false)
    }
  }

  const joinUrl = resolveJoinUrl(session)

  if (!session) {
    return (
      <div className="panel">
        <h2>Start a Prezo session</h2>
        <p className="muted">
          Create a live Prezo room for Q&A and polls. Show the QR on the slide
          or copy the join link.
        </p>
        <div className="field">
          <label htmlFor="title">Session title (optional)</label>
          <input
            id="title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Quarterly kickoff"
          />
        </div>
        <button className="primary" onClick={handleCreate} disabled={isCreating}>
          {isCreating ? 'Creating...' : 'Create Prezo session'}
        </button>
        {error ? <p className="error">{error}</p> : null}
      </div>
    )
  }

  return (
    <div className="panel">
      <h2>Session live</h2>
      <div className="session-meta">
        <div>
          <span className="eyebrow">Join code</span>
          <div className="code">{session.code}</div>
          <p className="muted">Share this code or the QR link below.</p>
        </div>
        {joinUrl ? (
          <div className="qr">
            <QRCodeCanvas
              value={joinUrl}
              size={120}
              fgColor="#1f2937"
              bgColor="#ffffff"
            />
            <a
              className="qr-label"
              href={joinUrl}
              target="_blank"
              rel="noreferrer"
            >
              {joinUrl}
            </a>
          </div>
        ) : null}
      </div>
    </div>
  )
}
