import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { api } from './api/client'
import type { Poll, Question, Session, SessionEvent, SessionSnapshot } from './api/types'
import { PollManager } from './components/PollManager'
import { QaModeration } from './components/QaModeration'
import { SessionSetup } from './components/SessionSetup'
import { useSessionSocket } from './hooks/useSessionSocket'
import { writeSessionBinding } from './office/sessionBinding'
import { updatePollWidget, updateQnaWidget } from './office/widgetShapes'

const HOST_BASE_URL =
  import.meta.env.VITE_HOST_BASE_URL?.toString() ?? window.location.origin
const AUDIENCE_BASE_URL =
  import.meta.env.VITE_AUDIENCE_BASE_URL?.toString() ?? 'http://localhost:5174'
const upsertById = <T extends { id: string }>(items: T[], item: T) => {
  const index = items.findIndex((entry) => entry.id === item.id)
  if (index === -1) {
    return [item, ...items]
  }
  const updated = [...items]
  updated[index] = item
  return updated
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [polls, setPolls] = useState<Poll[]>([])
  const [error, setError] = useState<string | null>(null)
  const [showPolls, setShowPolls] = useState(false)
  const [showQna, setShowQna] = useState(false)
  const latestSessionRef = useRef<Session | null>(null)
  const latestQuestionsRef = useRef<Question[]>([])
  const latestPollsRef = useRef<Poll[]>([])

  const handleEvent = useCallback((event: SessionEvent) => {
    if (event.type === 'session_snapshot') {
      const snapshot = event.payload.snapshot as SessionSnapshot
      setSession(snapshot.session)
      setQuestions(snapshot.questions)
      setPolls(snapshot.polls)
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
      return
    }

    if (event.payload.poll) {
      const poll = event.payload.poll as Poll
      setPolls((prev) => upsertById(prev, poll))
    }
  }, [])

  const socketStatus = useSessionSocket(session?.id ?? null, handleEvent)

  useEffect(() => {
    latestSessionRef.current = session
  }, [session])

  useEffect(() => {
    latestQuestionsRef.current = questions
  }, [questions])

  useEffect(() => {
    latestPollsRef.current = polls
  }, [polls])

  useEffect(() => {
    if (session?.qna_open) {
      setShowQna(true)
    }
  }, [session?.qna_open])

  useEffect(() => {
    if (!session) {
      return
    }
    void writeSessionBinding({ sessionId: session.id, code: session.code })
  }, [session?.id, session?.code])

  useEffect(() => {
    if (!session) {
      return
    }
    void updateQnaWidget(session.id, session.code, questions).catch((err) =>
      console.warn('Failed to update widget shapes', err)
    )
  }, [session?.id, session?.code, questions])

  useEffect(() => {
    if (!session) {
      return
    }
    void updatePollWidget(session.id, session.code, polls).catch((err) =>
      console.warn('Failed to update poll widget shapes', err)
    )
  }, [session?.id, session?.code, polls])

  useEffect(() => {
    if (!session || !window.Office?.context?.document?.addHandlerAsync) {
      return
    }

    const refresh = () => {
      const currentSession = latestSessionRef.current
      if (!currentSession) {
        return
      }
      void updateQnaWidget(
        currentSession.id,
        currentSession.code,
        latestQuestionsRef.current
      ).catch((err) => console.warn('Failed to refresh Q&A widget shapes', err))
      void updatePollWidget(
        currentSession.id,
        currentSession.code,
        latestPollsRef.current
      ).catch((err) => console.warn('Failed to refresh poll widget shapes', err))
    }

    Office.context.document.addHandlerAsync(
      Office.EventType.DocumentSelectionChanged,
      refresh
    )
    refresh()

    return () => {
      Office.context.document.removeHandlerAsync(
        Office.EventType.DocumentSelectionChanged,
        { handler: refresh }
      )
    }
  }, [session?.id])

  const createSession = async (title: string) => {
    setError(null)
    const created = await api.createSession(title || undefined)
    setSession(created)
  }

  const openQna = async () => {
    if (!session) {
      return
    }
    const updated = await api.openQna(session.id)
    setSession(updated)
    setShowQna(true)
  }

  const closeQna = async () => {
    if (!session) {
      return
    }
    const updated = await api.closeQna(session.id)
    setSession(updated)
    setShowQna(false)
  }

  const approveQuestion = async (questionId: string) => {
    if (!session) {
      return
    }
    await api.approveQuestion(session.id, questionId)
  }

  const hideQuestion = async (questionId: string) => {
    if (!session) {
      return
    }
    await api.hideQuestion(session.id, questionId)
  }

  const createPoll = async (
    questionText: string,
    options: string[],
    allowMultiple: boolean
  ) => {
    if (!session) {
      return
    }
    const created = await api.createPoll(session.id, questionText, options, allowMultiple)
    await api.openPoll(session.id, created.id)
    setShowPolls(true)
  }

  const openPoll = async (pollId: string) => {
    if (!session) {
      return
    }
    await api.openPoll(session.id, pollId)
  }

  const closePoll = async (pollId: string) => {
    if (!session) {
      return
    }
    await api.closePoll(session.id, pollId)
  }

  const pendingQuestions = useMemo(
    () => questions.filter((question) => question.status === 'pending'),
    [questions]
  )
  const approvedQuestions = useMemo(
    () => questions.filter((question) => question.status === 'approved'),
    [questions]
  )

  const isAddinHost = window.Office?.context?.host === window.Office?.HostType?.PowerPoint
  const joinLink = session?.join_url ?? `${AUDIENCE_BASE_URL}/`

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">Prezo</span>
          <span className="brand-subtitle">Live sessions</span>
        </div>
        <nav className="nav">
          <a className="nav-link active" href={HOST_BASE_URL}>
            Host
          </a>
          {!isAddinHost ? (
            <a className="nav-link" href={joinLink}>
              Join
            </a>
          ) : null}
        </nav>
        <div className="status">
          <span className={`dot ${socketStatus}`}></span>
          <span className="muted">{socketStatus}</span>
        </div>
      </header>

      <div className="page-heading">
        <h1>Host console</h1>
        <p className="muted">Manage questions, approve submissions, and run polls.</p>
      </div>

      {error ? <p className="error">{error}</p> : null}

      <div className="grid">
        <SessionSetup session={session} onCreate={createSession} />

        <div className="panel">
          <div className="panel-header">
            <div>
              <h2>Q&amp;A</h2>
              <p className="muted">Open Q&amp;A to collect and moderate questions.</p>
            </div>
            <div className="actions">
              {session?.qna_open ? (
                <button className="ghost" onClick={closeQna}>
                  Close Q&amp;A
                </button>
              ) : (
                <button onClick={openQna} disabled={!session}>
                  Open Q&amp;A
                </button>
              )}
            </div>
          </div>
          {!session ? (
            <p className="muted">Create a session to enable Q&amp;A.</p>
          ) : session.qna_open ? (
            <p className="muted">Q&amp;A is open. New questions will appear below.</p>
          ) : (
            <p className="muted">Q&amp;A is closed. Open it to start collecting questions.</p>
          )}
        </div>

        {session?.qna_open && showQna ? (
          <QaModeration
            pending={pendingQuestions}
            approved={approvedQuestions}
            onApprove={approveQuestion}
            onHide={hideQuestion}
          />
        ) : null}

        {!showPolls ? (
          <div className="panel">
            <div className="panel-header">
              <div>
                <h2>Polls</h2>
                <p className="muted">Launch a poll and share it instantly with your audience.</p>
              </div>
              <button onClick={() => setShowPolls(true)} disabled={!session}>
                Start poll
              </button>
            </div>
            {!session ? <p className="muted">Create a session to run polls.</p> : null}
          </div>
        ) : (
          <PollManager polls={polls} onCreate={createPoll} onOpen={openPoll} onClose={closePoll} />
        )}
      </div>
    </div>
  )
}
