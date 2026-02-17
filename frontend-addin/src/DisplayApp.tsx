import { useCallback, useEffect, useMemo, useState } from 'react'

import { api } from './api/client'
import type { Question, Session, SessionEvent, SessionSnapshot } from './api/types'
import { useSessionSocket } from './hooks/useSessionSocket'
import { readSessionBinding } from './office/sessionBinding'

const BINDING_POLL_MS = 3000

const upsertById = <T extends { id: string }>(items: T[], item: T) => {
  const index = items.findIndex((entry) => entry.id === item.id)
  if (index === -1) {
    return [item, ...items]
  }
  const updated = [...items]
  updated[index] = item
  return updated
}

export function DisplayApp() {
  const [session, setSession] = useState<Session | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [bindingSessionId, setBindingSessionId] = useState<string | null>(null)
  const [bindingCode, setBindingCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleEvent = useCallback((event: SessionEvent) => {
    if (event.type === 'session_snapshot') {
      const snapshot = event.payload.snapshot as SessionSnapshot
      setSession(snapshot.session)
      setQuestions(snapshot.questions)
      return
    }

    if (event.payload.session) {
      const updated = event.payload.session as Session
      setSession(updated)
      return
    }

    if (event.payload.question) {
      const question = event.payload.question as Question
      setQuestions((prev) => upsertById(prev, question))
    }
  }, [])

  const socketStatus = useSessionSocket(bindingSessionId, handleEvent)

  useEffect(() => {
    let active = true
    const loadBinding = async () => {
      const binding = await readSessionBinding()
      if (!active) {
        return
      }
      setBindingSessionId(binding?.sessionId ?? null)
      setBindingCode(binding?.code ?? null)
    }

    void loadBinding()
    const interval = window.setInterval(() => {
      void loadBinding()
    }, BINDING_POLL_MS)

    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [])

  useEffect(() => {
    if (!bindingSessionId) {
      setSession(null)
      setQuestions([])
      return
    }
    setError(null)
    api
      .getSnapshot(bindingSessionId)
      .then((snapshot) => {
        setSession(snapshot.session)
        setQuestions(snapshot.questions)
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load session')
      })
  }, [bindingSessionId])

  const approvedQuestions = useMemo(
    () => questions.filter((question) => question.status === 'approved' && !question.prompt_id),
    [questions]
  )

  const pendingCount = useMemo(
    () =>
      questions.filter((question) => question.status === 'pending' && !question.prompt_id)
        .length,
    [questions]
  )

  const hasOfficeHost = Boolean(window.Office?.context?.host)

  return (
    <div className="display">
      <header className="display-header">
        <div className="display-title">
          <span className="brand-mark">Prezo</span>
          <span className="display-subtitle">Live Q&amp;A</span>
        </div>
        <div className="status">
          <span className={`dot ${socketStatus}`}></span>
          <span className="muted">{socketStatus}</span>
        </div>
      </header>

      {!hasOfficeHost ? (
        <div className="panel">
          <h2>Open inside PowerPoint</h2>
          <p className="muted">This view is meant for the Prezo slide widget.</p>
        </div>
      ) : null}

      {hasOfficeHost && !bindingSessionId ? (
        <div className="panel">
          <h2>No active session</h2>
          <p className="muted">
            Open the Prezo Host add-in and start a session to populate this slide.
          </p>
        </div>
      ) : null}

      {hasOfficeHost && bindingSessionId ? (
        <div className="panel display-panel">
          <div className="panel-header">
            <div>
              <h2>{session?.title ? session.title : 'Questions from your audience'}</h2>
              <p className="muted">
                {bindingCode ? `Join code ${bindingCode}` : 'Waiting for new questions.'}
              </p>
            </div>
            <span className="badge">Pending {pendingCount}</span>
          </div>
          {error ? <p className="error">{error}</p> : null}
          {approvedQuestions.length === 0 ? (
            <p className="muted">No approved questions yet.</p>
          ) : (
            <ul className="list display-list">
              {approvedQuestions.map((question) => (
                <li key={question.id} className="list-item display-item">
                  <div>
                    <p>{question.text}</p>
                    <span className="muted">{question.votes} votes</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  )
}
