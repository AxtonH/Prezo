import { useState } from 'react'
import { QRCodeCanvas } from 'qrcode.react'

import type { Session } from '../api/types'
import { resolveJoinUrl } from '../utils/joinUrl'

interface SessionSetupProps {
  session: Session | null
  onCreate: (title: string) => Promise<void>
  recentSessions?: Session[]
  isLoading?: boolean
  loadError?: string | null
  onResume?: (session: Session) => void
  onRefresh?: () => void
  hasMore?: boolean
  onShowMore?: () => void
  hasLess?: boolean
  onShowLess?: () => void
}

export function SessionSetup({
  session,
  onCreate,
  recentSessions,
  isLoading = false,
  loadError,
  onResume,
  onRefresh,
  hasMore = false,
  onShowMore,
  hasLess = false,
  onShowLess
}: SessionSetupProps) {
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

  const formatTimestamp = (value: string) => {
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) {
      return ''
    }
    return parsed.toLocaleString()
  }

  const hasRecentSessions = Boolean(recentSessions?.length)
  const showResumeSection = Boolean(onResume)

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
        {showResumeSection ? (
          <div className="session-resume">
            <div className="panel-header session-resume-header">
              <h3>Resume a session</h3>
              <div className="session-resume-actions">
                {hasMore && onShowMore ? (
                  <button type="button" className="ghost" onClick={onShowMore}>
                    See more
                  </button>
                ) : null}
                {hasLess && onShowLess ? (
                  <button type="button" className="ghost" onClick={onShowLess}>
                    Show less
                  </button>
                ) : null}
                {onRefresh ? (
                  <button type="button" className="ghost" onClick={onRefresh}>
                    Refresh
                  </button>
                ) : null}
              </div>
            </div>
            {isLoading ? <p className="muted">Loading your recent sessions...</p> : null}
            {loadError ? <p className="error">{loadError}</p> : null}
            {!isLoading && !loadError && !hasRecentSessions ? (
              <p className="muted">No recent sessions yet.</p>
            ) : null}
            {hasRecentSessions ? (
              <div className="session-grid">
                {recentSessions?.map((entry) => {
                  const title = entry.title?.trim() || 'Untitled session'
                  const timestamp = formatTimestamp(entry.created_at)
                  const badgeLabel = entry.status === 'active' ? 'Active' : 'Ended'
                  return (
                    <div key={entry.id} className="session-card">
                      <div>
                        <div className="session-title">{title}</div>
                        <div className="session-subtitle">
                          <span className="code-inline">{entry.code}</span>
                          {timestamp ? ` - ${timestamp}` : ''}
                        </div>
                      </div>
                      <div className="session-card-actions">
                        <span className="badge">{badgeLabel}</span>
                        <button type="button" className="ghost" onClick={() => onResume?.(entry)}>
                          Resume
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : null}
          </div>
        ) : null}
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
