import { useCallback, useMemo, useState } from 'react'

import { api } from './api/client'
import type {
  Poll,
  Question,
  Session,
  SessionEvent,
  SessionSnapshot,
  WordCloud
} from './api/types'
import { JoinPanel } from './components/JoinPanel'
import { PollsPanel } from './components/PollsPanel'
import { QuestionComposer } from './components/QuestionComposer'
import { QuestionFeed } from './components/QuestionFeed'
import { WordCloudsPanel } from './components/WordCloudsPanel'
import { useSessionSocket } from './hooks/useSessionSocket'
import { getClientId } from './utils/clientId'

const HOST_BASE_URL = import.meta.env.VITE_HOST_BASE_URL?.toString() ?? 'http://localhost:5173'
const AUDIENCE_BASE_URL =
  import.meta.env.VITE_AUDIENCE_BASE_URL?.toString() ?? window.location.origin

const upsertById = <T extends { id: string }>(items: T[], item: T) => {
  const index = items.findIndex((entry) => entry.id === item.id)
  if (index === -1) {
    return [item, ...items]
  }
  const updated = [...items]
  updated[index] = item
  return updated
}

const parseJoinCode = () => {
  const parts = window.location.pathname.split('/').filter(Boolean)
  if (parts[0] === 'join' && parts[1]) {
    return parts[1]
  }
  return ''
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [polls, setPolls] = useState<Poll[]>([])
  const [wordClouds, setWordClouds] = useState<WordCloud[]>([])
  const [joinError, setJoinError] = useState<string | null>(null)

  const handleEvent = useCallback((event: SessionEvent) => {
    if (event.type === 'session_snapshot') {
      const snapshot = event.payload.snapshot as SessionSnapshot
      setSession(snapshot.session)
      setQuestions(snapshot.questions)
      setPolls(snapshot.polls)
      setWordClouds(snapshot.word_clouds ?? [])
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
      return
    }

    if (event.payload.word_cloud) {
      const wordCloud = event.payload.word_cloud as WordCloud
      setWordClouds((prev) => upsertById(prev, wordCloud))
    }
  }, [])

  const socketStatus = useSessionSocket(session?.id ?? null, handleEvent)

  const joinSession = async (code: string) => {
    setJoinError(null)
    try {
      const sessionData = await api.getSessionByCode(code)
      setSession(sessionData)
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : 'Session not found')
    }
  }

  const submitQuestion = async (text: string) => {
    if (!session) {
      return
    }
    await api.submitQuestion(session.id, text, getClientId())
  }

  const voteQuestion = async (questionId: string) => {
    if (!session) {
      return
    }
    await api.voteQuestion(session.id, questionId, getClientId())
  }

  const votePoll = async (pollId: string, optionId: string) => {
    if (!session) {
      return
    }
    await api.votePoll(session.id, pollId, optionId, getClientId())
  }

  const voteWordCloud = async (wordCloudId: string, wordId: string) => {
    if (!session) {
      return
    }
    await api.voteWordCloud(session.id, wordCloudId, wordId, getClientId())
  }

  const pendingCount = useMemo(
    () => questions.filter((question) => question.status === 'pending').length,
    [questions]
  )

  const approvedQuestions = useMemo(
    () =>
      questions
        .filter((question) => question.status === 'approved')
        .sort((a, b) => b.votes - a.votes),
    [questions]
  )

  const joinCode = parseJoinCode()
  const joinLink = session?.join_url ?? `${AUDIENCE_BASE_URL}/`

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">Prezo</span>
          <span className="brand-subtitle">Live sessions</span>
        </div>
        <nav className="nav">
          <a className="nav-link" href={HOST_BASE_URL}>
            Host
          </a>
          <a className="nav-link active" href={joinLink}>
            Join
          </a>
        </nav>
        <div className="status">
          <span className={`dot ${session ? socketStatus : 'disconnected'}`}></span>
          <span className="muted">{session ? socketStatus : 'not connected'}</span>
        </div>
      </header>

      <div className="page-heading">
        <h1>Join a session</h1>
        <p className="muted">Ask questions, vote, and respond to live polls.</p>
      </div>

      {!session ? (
        <JoinPanel defaultCode={joinCode} onJoin={joinSession} error={joinError} />
      ) : (
        <div className="grid">
          <div className="panel hero">
            <h2>{session.title ?? 'Prezo session'}</h2>
            <p className="muted">Code: {session.code}</p>
            <p className="muted">Stay tuned for real-time updates.</p>
          </div>
          {session.qna_open ? (
            <QuestionComposer onSubmit={submitQuestion} />
          ) : (
            <div className="panel">
              <h2>Q&amp;A closed</h2>
              <p className="muted">
                The host hasn&apos;t opened Q&amp;A yet. Check back once it goes live.
              </p>
            </div>
          )}
          <QuestionFeed
            approved={approvedQuestions}
            pendingCount={pendingCount}
            onVote={voteQuestion}
          />
          <PollsPanel polls={polls} onVote={votePoll} />
          <WordCloudsPanel wordClouds={wordClouds} onVote={voteWordCloud} />
        </div>
      )}
    </div>
  )
}
