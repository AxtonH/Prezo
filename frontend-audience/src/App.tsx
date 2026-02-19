import { useCallback, useMemo, useRef, useState } from 'react'

import { api, API_BASE_URL } from './api/client'
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
  const [debugEnabled] = useState(() => {
    if (typeof window === 'undefined') {
      return false
    }
    const params = new URLSearchParams(window.location.search)
    return params.has('debug') || window.localStorage.getItem('prezo-debug') === '1'
  })
  const [debugInfo, setDebugInfo] = useState<{
    lastPollVote: string | null
  }>({
    lastPollVote: null
  })
  const [session, setSession] = useState<Session | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [polls, setPolls] = useState<Poll[]>([])
  const [prompts, setPrompts] = useState<QnaPrompt[]>([])
  const [promptDrafts, setPromptDrafts] = useState<Record<string, string>>({})
  const [promptStatus, setPromptStatus] = useState<Record<string, string>>({})
  const [joinError, setJoinError] = useState<string | null>(null)
  const pollVoteHistoryRef = useRef<Record<string, Set<string>>>({})
  const pollVotePendingRef = useRef<
    Record<string, { inFlight: boolean; queuedOptionId: string | null }>
  >({})
  const questionVoteHistoryRef = useRef<Set<string>>(new Set())

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
      pollVoteHistoryRef.current = {}
      pollVotePendingRef.current = {}
      questionVoteHistoryRef.current = new Set()
      setSession(sessionData)
      const snapshot = await api.getSnapshot(sessionData.id)
      setQuestions(snapshot.questions)
      setPolls(snapshot.polls)
      setPrompts(snapshot.prompts ?? [])
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

  const logPollDebug = (message: string, isError = false) => {
    if (!debugEnabled) {
      return
    }
    const entry = `${new Date().toISOString()} ${message}`
    if (isError) {
      console.error(entry)
    } else {
      console.info(entry)
    }
    setDebugInfo((prev) => ({ ...prev, lastPollVote: entry }))
  }

  const voteQuestion = async (questionId: string) => {
    if (!session || questionVoteHistoryRef.current.has(questionId)) {
      return
    }
    questionVoteHistoryRef.current.add(questionId)
    setQuestions((prev) =>
      prev.map((question) =>
        question.id === questionId
          ? { ...question, votes: question.votes + 1 }
          : question
      )
    )
    try {
      await api.voteQuestion(session.id, questionId, getClientId())
    } catch {
      questionVoteHistoryRef.current.delete(questionId)
      const snapshot = await api.getSnapshot(session.id).catch(() => null)
      if (snapshot) {
        setQuestions(snapshot.questions)
      }
    }
  }

  const votePoll = async (pollId: string, optionId: string) => {
    if (!session) {
      return
    }
    const poll = polls.find((entry) => entry.id === pollId)
    if (!poll) {
      logPollDebug(
        `votePoll ignored (poll not found in state) session=${session.id} poll=${pollId}`
      )
      return
    }
    logPollDebug(
      `votePoll attempt session=${session.id} poll=${pollId} option=${optionId} api=${API_BASE_URL}`
    )
    const allowMultiple = poll.allow_multiple
    const history = pollVoteHistoryRef.current[pollId] ?? new Set<string>()
    if (history.has(optionId)) {
      logPollDebug(
        `votePoll ignored (already selected) session=${session.id} poll=${pollId} option=${optionId}`
      )
      return
    }
    const nextHistory = new Set(history)
    let removeIds: string[] = []
    if (!allowMultiple && nextHistory.size > 0) {
      removeIds = Array.from(nextHistory)
      nextHistory.clear()
    }
    nextHistory.add(optionId)
    pollVoteHistoryRef.current[pollId] = nextHistory
    const removeSet = new Set(removeIds)
    setPolls((prev) =>
      prev.map((poll) => {
        if (poll.id !== pollId) {
          return poll
        }
        const nextOptions = poll.options.map((option) => {
          let votes = option.votes
          if (removeSet.has(option.id)) {
            votes = Math.max(0, votes - 1)
          }
          if (option.id === optionId) {
            votes += 1
          }
          return votes === option.votes ? option : { ...option, votes }
        })
        return { ...poll, options: nextOptions }
      })
    )

    if (allowMultiple) {
      try {
        await api.votePoll(session.id, pollId, optionId, getClientId())
        logPollDebug(
          `votePoll success session=${session.id} poll=${pollId} option=${optionId}`
        )
      } catch (err) {
        logPollDebug(
          `votePoll error session=${session.id} poll=${pollId} option=${optionId} error=${
            err instanceof Error ? err.message : String(err)
          }`,
          true
        )
        const snapshot = await api.getSnapshot(session.id).catch(() => null)
        if (snapshot) {
          setPolls(snapshot.polls)
        }
      }
      return
    }

    const pending = pollVotePendingRef.current[pollId]
    if (pending?.inFlight) {
      pollVotePendingRef.current[pollId] = {
        inFlight: true,
        queuedOptionId: optionId
      }
      return
    }

    const sendVote = async (targetOptionId: string) => {
      try {
        await api.votePoll(session.id, pollId, targetOptionId, getClientId())
        logPollDebug(
          `votePoll success session=${session.id} poll=${pollId} option=${targetOptionId}`
        )
      } catch (err) {
        logPollDebug(
          `votePoll error session=${session.id} poll=${pollId} option=${targetOptionId} error=${
            err instanceof Error ? err.message : String(err)
          }`,
          true
        )
        const snapshot = await api.getSnapshot(session.id).catch(() => null)
        if (snapshot) {
          setPolls(snapshot.polls)
        }
      }
    }

    pollVotePendingRef.current[pollId] = { inFlight: true, queuedOptionId: null }
    let currentOptionId = optionId
    await sendVote(currentOptionId)
    let queued = pollVotePendingRef.current[pollId]?.queuedOptionId
    while (queued && queued !== currentOptionId) {
      pollVotePendingRef.current[pollId] = { inFlight: true, queuedOptionId: null }
      await sendVote(queued)
      currentOptionId = queued
      queued = pollVotePendingRef.current[pollId]?.queuedOptionId
    }
    pollVotePendingRef.current[pollId] = { inFlight: false, queuedOptionId: null }
  }

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
              approvedQuestions={approvedQuestions}
              onUpvote={voteQuestion}
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
          <PollsPanel polls={polls} onVote={votePoll} />
        </div>
      )}
      {debugEnabled ? (
        <div className="panel debug-panel">
          <h2>Debug</h2>
          <p className="muted">API: {API_BASE_URL}</p>
          <p className="muted">Session: {session?.id ?? 'none'}</p>
          <p className="muted">Socket: {session ? socketStatus : 'disconnected'}</p>
          <p className="muted">Polls: {polls.length}</p>
          <p className="muted">Prompts: {prompts.length}</p>
          <p className="muted">Questions: {questions.length}</p>
          <p className="muted">Last poll vote: {debugInfo.lastPollVote ?? 'none'}</p>
        </div>
      ) : null}
    </div>
  )
}
