import { useCallback, useEffect, useState } from 'react'

import { api } from './api/client'
import type { QnaMode, Question, Session, SessionEvent, SessionSnapshot } from './api/types'
import { useSessionSocket } from './hooks/useSessionSocket'
import type { SessionBinding } from './office/sessionBinding'
import { readSessionBinding } from './office/sessionBinding'
import { insertQnaWidget, updateQnaWidget } from './office/widgetShapes'

const BINDING_POLL_MS = 3000

export function WidgetManagerApp() {
  const [binding, setBinding] = useState<SessionBinding | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [qnaMode, setQnaMode] = useState<QnaMode>('audience')
  const [qnaPrompt, setQnaPrompt] = useState('')
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isInserting, setIsInserting] = useState(false)
  const [isSavingConfig, setIsSavingConfig] = useState(false)

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
    if (!session) {
      return
    }
    setQnaMode(session.qna_mode ?? 'audience')
    setQnaPrompt(session.qna_prompt ?? '')
  }, [session?.id, session?.qna_mode, session?.qna_prompt])

  useEffect(() => {
    if (!binding?.sessionId) {
      return
    }
    void updateQnaWidget(
      binding.sessionId,
      binding.code,
      questions,
      session?.qna_mode ?? 'audience',
      session?.qna_prompt ?? null
    ).catch((err) =>
      console.warn('Failed to update widget shapes', err)
    )
  }, [questions, binding?.sessionId, binding?.code, session?.qna_mode, session?.qna_prompt])

  const saveQnaConfig = async () => {
    if (!binding?.sessionId) {
      throw new Error('Start a session in the host add-in first.')
    }
    const prompt = qnaMode === 'prompt' ? qnaPrompt.trim() : ''
    if (qnaMode === 'prompt' && !prompt) {
      throw new Error('Enter a prompt question to enable prompt mode.')
    }
    const updated = await api.updateQnaConfig(
      binding.sessionId,
      qnaMode,
      prompt || null
    )
    setSession(updated)
  }

  const handleInsert = async () => {
    const hasSession = Boolean(binding?.sessionId)
    setError(null)
    setStatusMessage(null)
    setIsInserting(true)
    try {
      if (hasSession) {
        setIsSavingConfig(true)
        await saveQnaConfig()
        setIsSavingConfig(false)
      }
      await insertQnaWidget(binding?.sessionId ?? null, binding?.code ?? null)
      if (hasSession && binding?.sessionId) {
        await updateQnaWidget(
          binding.sessionId,
          binding.code,
          questions,
          session?.qna_mode ?? qnaMode,
          session?.qna_prompt ?? qnaPrompt
        )
      }
      setStatusMessage(
        hasSession
          ? 'Widget inserted on the selected slide.'
          : 'Placeholder inserted. It will connect when a session starts.'
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to insert widget')
    } finally {
      setIsSavingConfig(false)
      setIsInserting(false)
    }
  }

  const handleSaveConfig = async () => {
    setError(null)
    setStatusMessage(null)
    setIsSavingConfig(true)
    try {
      await saveQnaConfig()
      setStatusMessage('Q&A settings saved.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save Q&A settings')
    } finally {
      setIsSavingConfig(false)
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
        <div className="field">
          <label>Q&amp;A mode</label>
          <div className="radio-group">
            <label className="radio">
              <input
                type="radio"
                name="qna-mode"
                value="audience"
                checked={qnaMode === 'audience'}
                onChange={() => setQnaMode('audience')}
              />
              Audience questions
            </label>
            <label className="radio">
              <input
                type="radio"
                name="qna-mode"
                value="prompt"
                checked={qnaMode === 'prompt'}
                onChange={() => setQnaMode('prompt')}
              />
              Host prompt (audience answers)
            </label>
          </div>
        </div>
        {qnaMode === 'prompt' ? (
          <div className="field">
            <label htmlFor="qna-prompt">Prompt question</label>
            <input
              id="qna-prompt"
              value={qnaPrompt}
              onChange={(event) => setQnaPrompt(event.target.value)}
              placeholder="What should we cover next?"
              maxLength={200}
            />
          </div>
        ) : null}
        <div className="actions">
          <button onClick={handleSaveConfig} disabled={isSavingConfig || !binding?.sessionId}>
            {isSavingConfig ? 'Saving...' : 'Save Q&amp;A settings'}
          </button>
          <button onClick={handleInsert} disabled={isInserting || isSavingConfig}>
            {isInserting ? 'Inserting...' : 'Insert widget on slide'}
          </button>
        </div>
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
