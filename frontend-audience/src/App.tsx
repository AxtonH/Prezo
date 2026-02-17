import { useCallback, useMemo, useState } from 'react'

import { api } from './api/client'
import type {
  Poll,
  QnaPrompt,
  Question,
  Session,
  SessionEvent,
  SessionSnapshot
} from './api/types'
import { JoinPanel } from './components/JoinPanel'
import { PollsPanel } from './components/PollsPanel'
import { QuestionComposer } from './components/QuestionComposer'
import { QuestionFeed } from './components/QuestionFeed'
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
  const [prompts, setPrompts] = useState<QnaPrompt[]>([])
  const [promptDrafts, setPromptDrafts] = useState<Record<string, string>>({})
  const [promptStatus, setPromptStatus] = useState<Record<string, string>>({})
  const [joinError, setJoinError] = useState<string | null>(null)

  const handleEvent = useCallback((event: SessionEvent) => {
    if (event.type === 'session_snapshot') {
      const snapshot = event.payload.snapshot as SessionSnapshot
      setSession(snapshot.session)
      setQuestions(snapshot.questions)
      setPolls(snapshot.polls)
      setPrompts(snapshot.prompts ?? [])
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

    if (event.payload.prompt) {
      const prompt = event.payload.prompt as QnaPrompt
      setPrompts((prev) => upsertById(prev, prompt))
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

  const submitPromptAnswer = async (promptId: string) => {
    if (!session) {
      return
    }
    const draft = promptDrafts[promptId]?.trim()
    if (!draft) {
      return
    }
    await api.submitQuestion(session.id, draft, getClientId(), promptId)
    setPromptDrafts((prev) => ({ ...prev, [promptId]: '' }))
    setPromptStatus((prev) => ({ ...prev, [promptId]: 'Answer submitted for moderation.' }))
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

  const pendingCount = useMemo(
    () =>
      questions.filter((question) => question.status === 'pending' && !question.prompt_id)
        .length,
    [questions]
  )

  const approvedQuestions = useMemo(
    () =>
      questions
        .filter((question) => question.status === 'approved' && !question.prompt_id)
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
            <QuestionComposer
              onSubmit={submitQuestion}
              mode="audience"
              prompt={null}
            />
          ) : (
            <div className="panel">
              <h2>Q&amp;A closed</h2>
              <p className="muted">
                The host hasn&apos;t opened Q&amp;A yet. Check back once it goes live.
              </p>
            </div>
          )}
          {prompts.length > 0 ? (
            <div className="panel">
              <h2>Prompt questions</h2>
              <p className="muted">Share your thoughts on each prompt below.</p>
              <div className="prompt-list">
                {prompts.map((prompt) => (
                  <div key={prompt.id} className="prompt-entry">
                    <div>
                      <h3>{prompt.prompt}</h3>
                      <span className="muted">
                        {prompt.status === 'open' ? 'Open' : 'Closed'}
                      </span>
                    </div>
                    {prompt.status === 'open' ? (
                      <div className="prompt-input">
                        <input
                          value={promptDrafts[prompt.id] ?? ''}
                          onChange={(event) =>
                            setPromptDrafts((prev) => ({
                              ...prev,
                              [prompt.id]: event.target.value
                            }))
                          }
                          placeholder="Type your answer"
                        />
                        <button onClick={() => submitPromptAnswer(prompt.id)}>
                          Send
                        </button>
                      </div>
                    ) : (
                      <p className="muted">Prompt closed.</p>
                    )}
                    {promptStatus[prompt.id] ? (
                      <p className="muted">{promptStatus[prompt.id]}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <QuestionFeed
            approved={approvedQuestions}
            pendingCount={pendingCount}
            onVote={voteQuestion}
            mode="audience"
          />
          <PollsPanel polls={polls} onVote={votePoll} />
        </div>
      )}
    </div>
  )
}
