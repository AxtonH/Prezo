import { useState } from 'react'
import { QRCodeCanvas } from 'qrcode.react'

import type { Session } from '../api/types'
import { resolveJoinUrl } from '../utils/joinUrl'

interface SessionSetupProps {
  session: Session | null
  onCreate: (title: string) => Promise<void>
  onJoinByCode?: (code: string) => Promise<void>
  onSetHostJoinAccess?: (allowHostJoin: boolean) => Promise<void>
  recentSessions?: Session[]
  isLoading?: boolean
  loadError?: string | null
  onResume?: (session: Session) => void
  onDelete?: (session: Session) => void
  onRefresh?: () => void
  hasMore?: boolean
  onShowMore?: () => void
  hasLess?: boolean
  onShowLess?: () => void
  deletingSessionId?: string | null
}

export function SessionSetup({
  session,
  onCreate,
  onJoinByCode,
  onSetHostJoinAccess,
  recentSessions,
  isLoading = false,
  loadError,
  onResume,
  onDelete,
  onRefresh,
  hasMore = false,
  onShowMore,
  hasLess = false,
  onShowLess,
  deletingSessionId = null
}: SessionSetupProps) {
  const [title, setTitle] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [isStarting, setIsStarting] = useState(false)
  const [isUpdatingHostAccess, setIsUpdatingHostAccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isJoinMode = joinCode.trim().length > 0

  const handleStart = async () => {
    setError(null)
    setIsStarting(true)
    try {
      const normalizedCode = joinCode.trim().toUpperCase()
      if (normalizedCode) {
        if (!onJoinByCode) {
          throw new Error('Host join is unavailable.')
        }
        await onJoinByCode(normalizedCode)
        setJoinCode('')
      } else {
        await onCreate(title.trim())
        setTitle('')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start session')
    } finally {
      setIsStarting(false)
    }
  }

  const handleHostJoinAccessToggle = async () => {
    if (!session || !onSetHostJoinAccess || session.is_original_host !== true) {
      return
    }
    setError(null)
    setIsUpdatingHostAccess(true)
    try {
      await onSetHostJoinAccess(!session.allow_host_join)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to update co-host access'
      )
    } finally {
      setIsUpdatingHostAccess(false)
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
  const showResumeSection = Boolean(onResume || onDelete)

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
        <div className="field">
          <label htmlFor="join-code">Host join code (optional)</label>
          <input
            id="join-code"
            value={joinCode}
            onChange={(event) => setJoinCode(event.target.value)}
            placeholder="Enter a code to join another host session"
          />
          <p className="muted">
            Enter a join code to join an existing host session. Leave blank to create
            a new one.
          </p>
        </div>
        <button className="primary" onClick={handleStart} disabled={isStarting}>
          {isStarting ? (isJoinMode ? 'Joining...' : 'Creating...') : 'Start session'}
        </button>
        {error ? <p className="error">{error}</p> : null}
        {showResumeSection ? (
          <div className="session-resume">
            <div className="panel-header session-resume-header">
              <h3>Resume a session</h3>
              <div className="session-resume-actions">
                {hasMore && onShowMore ? (
                  <button
                    type="button"
                    className="ghost"
                    onClick={onShowMore}
                    disabled={isLoading}
                  >
                    {isLoading ? 'Loading...' : 'See more'}
                  </button>
                ) : null}
                {hasLess && onShowLess ? (
                  <button
                    type="button"
                    className="ghost"
                    onClick={onShowLess}
                    disabled={isLoading}
                  >
                    Show less
                  </button>
                ) : null}
                {onRefresh ? (
                  <button
                    type="button"
                    className="ghost"
                    onClick={onRefresh}
                    disabled={isLoading}
                  >
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
                        <div className="session-card-buttons">
                          {onResume ? (
                            <button
                              type="button"
                              className="ghost"
                              onClick={() => onResume(entry)}
                              disabled={deletingSessionId === entry.id}
                            >
                              Resume
                            </button>
                          ) : null}
                          {onDelete ? (
                            <button
                              type="button"
                              className="danger"
                              onClick={() => onDelete(entry)}
                              disabled={deletingSessionId === entry.id}
                            >
                              {deletingSessionId === entry.id ? 'Deleting...' : 'Delete'}
                            </button>
                          ) : null}
                        </div>
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
      {onSetHostJoinAccess && session.is_original_host === true ? (
        <div className="field">
          <label htmlFor="host-access-toggle">Co-host access</label>
          <p className="muted">
            {session.allow_host_join
              ? 'Enabled. Hosts with this code can join your host console session.'
              : 'Disabled. Only the original host can use this host console session.'}
          </p>
          <button
            id="host-access-toggle"
            type="button"
            className="ghost"
            disabled={isUpdatingHostAccess}
            onClick={handleHostJoinAccessToggle}
          >
            {isUpdatingHostAccess
              ? 'Saving...'
              : session.allow_host_join
                ? 'Disable host joining'
                : 'Allow host joining'}
          </button>
        </div>
      ) : null}
      {error ? <p className="error">{error}</p> : null}
    </div>
  )
}
