import { useCallback, useEffect, useState } from 'react'

import { api } from './api/client'
import type { Question, Session, SessionEvent, SessionSnapshot } from './api/types'
import { useSessionSocket } from './hooks/useSessionSocket'
import type { SessionBinding } from './office/sessionBinding'
import { readSessionBinding } from './office/sessionBinding'
import { insertQnaWidget, updateQnaWidget } from './office/widgetShapes'

const BINDING_POLL_MS = 3000

export function WidgetManagerApp() {
  const [binding, setBinding] = useState<SessionBinding | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isInserting, setIsInserting] = useState(false)

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
      setQuestions((prev) => {
        const index = prev.findIndex((entry) => entry.id === question.id)
        if (index === -1) {
          return [question, ...prev]
        }
        const updated = [...prev]
        updated[index] = question
        return updated
      })
    }
  }, [])

  const socketStatus = useSessionSocket(binding?.sessionId ?? null, handleEvent)

  useEffect(() => {
    let active = true
    const loadBinding = async () => {
      const next = await readSessionBinding()
      if (!active) {
        return
      }
      setBinding(next)
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
    if (!binding?.sessionId) {
      setSession(null)
      setQuestions([])
      return
    }
    setError(null)
    api
      .getSnapshot(binding.sessionId)
      .then((snapshot) => {
        setSession(snapshot.session)
        setQuestions(snapshot.questions)
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load session')
      })
  }, [binding?.sessionId])

  useEffect(() => {
    if (!binding?.sessionId) {
      return
    }
    void updateQnaWidget(binding.sessionId, binding.code, questions).catch((err) =>
      console.warn('Failed to update widget shapes', err)
    )
  }, [questions, binding?.sessionId, binding?.code])

  const handleInsert = async () => {
    const hasSession = Boolean(binding?.sessionId)
    setError(null)
    setStatusMessage(null)
    setIsInserting(true)
    try {
      await insertQnaWidget(binding?.sessionId ?? null, binding?.code ?? null)
      if (hasSession && binding?.sessionId) {
        await updateQnaWidget(binding.sessionId, binding.code, questions)
      }
      setStatusMessage(
        hasSession
          ? 'Widget inserted on the selected slide.'
          : 'Placeholder inserted. It will connect when a session starts.'
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to insert widget')
    } finally {
      setIsInserting(false)
    }
  }

  return (
    <div className="manager">
      <header className="display-header">
        <div className="display-title">
          <span className="brand-mark">Prezo</span>
          <span className="display-subtitle">Widgets</span>
        </div>
        <div className="status">
          <span className={`dot ${socketStatus}`}></span>
          <span className="muted">{socketStatus}</span>
        </div>
      </header>

      <div className="panel">
        <h2>Insert the Q&amp;A widget</h2>
        <p className="muted">Adds a live Q&amp;A box to the selected slide.</p>
        <button onClick={handleInsert} disabled={isInserting}>
          {isInserting ? 'Inserting...' : 'Insert widget on slide'}
        </button>
        {statusMessage ? <p className="muted">{statusMessage}</p> : null}
        {error ? <p className="error">{error}</p> : null}
      </div>

      <div className="panel">
        <h2>Active session</h2>
        {binding ? (
          <div>
            <p className="muted">Widget will follow this session automatically.</p>
            <div className="code">{binding.code ?? binding.sessionId}</div>
          </div>
        ) : (
          <p className="muted">
            Start a session in the Prezo Host add-in to connect widgets.
          </p>
        )}
      </div>
    </div>
  )
}
