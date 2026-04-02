import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { api } from './api/client'
import type {
  HostDashboardStats,
  Poll,
  QnaPrompt,
  Question,
  Session,
  SessionEvent,
  SessionSnapshot
} from './api/types'
import { getSession, onAuthStateChange, signOut } from './auth/auth'
import { LoginPage } from './components/LoginPage'
import { PollManager } from './components/PollManager'
import { PromptManager } from './components/PromptManager'
import { HostStatsCards } from './components/HostStatsCards'
import { SessionSetup } from './components/SessionSetup'
import { SideNav } from './components/SideNav'
import { useSessionSocket } from './hooks/useSessionSocket'
import { clearLibrarySyncBridge, writeLibrarySyncBridge } from './office/librarySyncBridge'
import { writeSessionBinding } from './office/sessionBinding'
import {
  setDiscussionWidgetBinding,
  setPollWidgetBinding,
  setQnaWidgetBinding,
  updateDiscussionWidget,
  updatePollWidget,
  updateQnaWidget
} from './office/widgetShapes'
import { buildEditingStationUrl } from './utils/editingStationUrl'
import { AUDIENCE_BASE_URL, resolveJoinUrl } from './utils/joinUrl'

const upsertById = <T extends { id: string }>(items: T[], item: T) => {
  const index = items.findIndex((entry) => entry.id === item.id)
  if (index === -1) {
    return [item, ...items]
  }
  const updated = [...items]
  updated[index] = item
  return updated
}

const withPreservedHostRole = (
  next: Session,
  fallback?: Session | null
): Session => {
  if (next.is_original_host === true || next.is_original_host === false) {
    return next
  }
  if (!fallback) {
    return next
  }
  return {
    ...next,
    is_original_host: fallback.is_original_host
  }
}

export default function App() {
  const [authSession, setAuthSession] = useState<Awaited<ReturnType<typeof getSession>>>(null)
  const [authReady, setAuthReady] = useState(false)

  useEffect(() => {
    let active = true
    getSession()
      .then((session) => {
        if (!active) {
          return
        }
        setAuthSession(session)
        setAuthReady(true)
      })
      .catch(() => {
        if (!active) {
          return
        }
        setAuthSession(null)
        setAuthReady(true)
      })

    const { data } = onAuthStateChange((_event, session) => {
      setAuthSession(session)
    })

    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    let active = true

    const syncLibraryBridge = async () => {
      if (!authSession?.access_token) {
        await clearLibrarySyncBridge()
        return
      }
      try {
        const syncToken = await api.createLibrarySyncToken()
        if (!active) {
          return
        }
        await writeLibrarySyncBridge({
          token: syncToken.token,
          expiresAt: syncToken.expires_at
        })
      } catch (error) {
        if (!active) {
          return
        }
        console.warn('Failed to refresh Prezo library sync bridge', error)
      }
    }

    void syncLibraryBridge()

    return () => {
      active = false
    }
  }, [authSession?.access_token])

  const handleLogout = () => {
    void signOut()
  }

  if (!authReady) {
    return (
      <div className="app">
        <p className="muted">Loading...</p>
      </div>
    )
  }

  if (!authSession) {
    return <LoginPage />
  }

  return <HostConsole onLogout={handleLogout} />
}

function HostConsole({ onLogout }: { onLogout: () => void }) {
  const [session, setSession] = useState<Session | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [polls, setPolls] = useState<Poll[]>([])
  const [prompts, setPrompts] = useState<QnaPrompt[]>([])
  const [error, setError] = useState<string | null>(null)
  const [recentSessions, setRecentSessions] = useState<Session[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(false)
  const [sessionsError, setSessionsError] = useState<string | null>(null)
  const [dashboardStats, setDashboardStats] = useState<HostDashboardStats | null>(null)
  const [dashboardStatsLoading, setDashboardStatsLoading] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newSessionTitle, setNewSessionTitle] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  /** Rows visible before scrolling; API fetch size so the list can scroll for older sessions. */
  const maxSessionsLimit = 100
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null)
  const [showPolls, setShowPolls] = useState(false)
  const [isQnaCollapsed, setIsQnaCollapsed] = useState(true)
  const [isPollsCollapsed, setIsPollsCollapsed] = useState(true)
  const [qnaWidgetStatus, setQnaWidgetStatus] = useState<string | null>(null)
  const [qnaWidgetError, setQnaWidgetError] = useState<string | null>(null)
  const latestSessionRef = useRef<Session | null>(null)
  const latestQuestionsRef = useRef<Question[]>([])
  const latestPollsRef = useRef<Poll[]>([])
  const latestPromptsRef = useRef<QnaPrompt[]>([])
  const pollWidgetUpdateRef = useRef<{
    inFlight: boolean
    queued: boolean
    sessionId: string | null
    code: string | null
    polls: Poll[]
  }>({
    inFlight: false,
    queued: false,
    sessionId: null,
    code: null,
    polls: []
  })

  const handleEvent = useCallback((event: SessionEvent) => {
    if (event.type === 'session_snapshot') {
      const snapshot = event.payload.snapshot as SessionSnapshot
      setSession((previous) => withPreservedHostRole(snapshot.session, previous))
      setQuestions(snapshot.questions)
      setPolls(snapshot.polls)
      setPrompts(snapshot.prompts ?? [])
      return
    }

    if (event.payload.session) {
      const updated = event.payload.session as Session
      setSession((previous) => withPreservedHostRole(updated, previous))
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
    latestPromptsRef.current = prompts
  }, [prompts])

  useEffect(() => {
    if (polls.length > 0) {
      setShowPolls(true)
    }
  }, [polls.length])

  useEffect(() => {
    if (!session) {
      return
    }
    void writeSessionBinding({ sessionId: session.id, code: session.code })
  }, [session?.id, session?.code])

  useEffect(() => {
    if (!session?.id || socketStatus === 'connected') {
      return
    }
    const refreshSnapshot = () => {
      void api
        .getSnapshot(session.id)
        .then((snapshot) => {
          setSession((previous) => withPreservedHostRole(snapshot.session, previous))
          setQuestions(snapshot.questions)
          setPolls(snapshot.polls)
          setPrompts(snapshot.prompts ?? [])
        })
        .catch(() => {})
    }
    refreshSnapshot()
    const interval = window.setInterval(() => {
      refreshSnapshot()
    }, 10000)

    return () => {
      window.clearInterval(interval)
    }
  }, [session?.id, socketStatus])

  useEffect(() => {
    if (!session) {
      return
    }
    void updateQnaWidget(
      session.id,
      session.code,
      questions,
      prompts
    ).catch((err) =>
      console.warn('Failed to update widget shapes', err)
    )
    void updateDiscussionWidget(
      session.id,
      session.code,
      questions,
      prompts
    ).catch((err) =>
      console.warn('Failed to update open discussion widget shapes', err)
    )
  }, [session?.id, session?.code, questions, prompts])

  const schedulePollWidgetUpdate = useCallback(
    (sessionId: string, code: string | null, nextPolls: Poll[]) => {
      const state = pollWidgetUpdateRef.current
      state.sessionId = sessionId
      state.code = code
      state.polls = nextPolls
      if (state.inFlight) {
        state.queued = true
        return
      }

      const runUpdate = async () => {
        const current = pollWidgetUpdateRef.current
        if (!current.sessionId) {
          return
        }
        current.inFlight = true
        try {
          await updatePollWidget(current.sessionId, current.code, current.polls)
        } catch (err) {
          console.warn('Failed to update poll widget shapes', err)
        } finally {
          current.inFlight = false
          if (current.queued) {
            current.queued = false
            runUpdate()
          }
        }
      }

      runUpdate()
    },
    []
  )

  useEffect(() => {
    if (!session) {
      return
    }
    schedulePollWidgetUpdate(session.id, session.code, polls)
  }, [session?.id, session?.code, polls, schedulePollWidgetUpdate])

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
        latestQuestionsRef.current,
        latestPromptsRef.current
      ).catch((err) => console.warn('Failed to refresh Q&A widget shapes', err))
      void updateDiscussionWidget(
        currentSession.id,
        currentSession.code,
        latestQuestionsRef.current,
        latestPromptsRef.current
      ).catch((err) =>
        console.warn('Failed to refresh open discussion widget shapes', err)
      )
      schedulePollWidgetUpdate(
        currentSession.id,
        currentSession.code,
        latestPollsRef.current
      )
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

  const loadSessions = useCallback(async (limit: number) => {
    setSessionsError(null)
    setSessionsLoading(true)
    try {
      const sessions = await api.listSessions('active', limit)
      setRecentSessions(sessions)
    } catch (err) {
      setSessionsError(err instanceof Error ? err.message : 'Failed to load sessions')
    } finally {
      setSessionsLoading(false)
    }
  }, [])

  const loadDashboardStats = useCallback(async () => {
    setDashboardStatsLoading(true)
    try {
      setDashboardStats(await api.getHostDashboardStats())
    } catch {
      setDashboardStats(null)
    } finally {
      setDashboardStatsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadSessions(maxSessionsLimit)
  }, [loadSessions])

  useEffect(() => {
    if (session) {
      return
    }
    void loadDashboardStats()
  }, [session, loadDashboardStats, recentSessions.length])

  const hydrateSession = async (selected: Session) => {
    const snapshot = await api.getSnapshot(selected.id)
    setSession((previous) =>
      withPreservedHostRole(snapshot.session, previous ?? selected)
    )
    setQuestions(snapshot.questions)
    setPolls(snapshot.polls)
    setPrompts(snapshot.prompts ?? [])
    setShowPolls(snapshot.polls.length > 0)
  }

  const createSession = async (title: string) => {
    setError(null)
    const created = await api.createSession(title || undefined)
    setSession((previous) => withPreservedHostRole(created, previous))
    setQuestions([])
    setPolls([])
    setPrompts([])
    setShowPolls(false)
    setRecentSessions((prev) => {
      const next = upsertById(prev, created)
      const keep = prev.length || maxSessionsLimit
      return next.slice(0, keep)
    })
  }

  const joinSessionByCode = async (code: string) => {
    setError(null)
    try {
      const joined = await api.joinSessionAsHost(code.trim().toUpperCase())
      await hydrateSession(joined)
      setRecentSessions((prev) => {
        const next = upsertById(prev, joined)
        const keep = prev.length || maxSessionsLimit
        return next.slice(0, keep)
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to join session'
      setError(message)
      throw new Error(message)
    }
  }

  const setHostJoinAccess = async (allowHostJoin: boolean) => {
    if (!session) {
      return
    }
    setError(null)
    try {
      const updated = await api.updateHostAccess(session.id, allowHostJoin)
      setSession((previous) => withPreservedHostRole(updated, previous))
      setRecentSessions((prev) => upsertById(prev, updated))
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to update host join access'
      setError(message)
      throw new Error(message)
    }
  }

  const resumeSession = async (selected: Session) => {
    setError(null)
    setQuestions([])
    setPolls([])
    setPrompts([])
    setShowPolls(false)
    try {
      await hydrateSession(selected)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load session')
    }
  }

  const deleteSession = async (selected: Session) => {
    setSessionsError(null)
    setDeletingSessionId(selected.id)
    try {
      await api.deleteSession(selected.id)
      setRecentSessions((prev) => prev.filter((entry) => entry.id !== selected.id))
    } catch (err) {
      setSessionsError(err instanceof Error ? err.message : 'Failed to delete session')
    } finally {
      setDeletingSessionId(null)
    }
  }

  const openQna = async () => {
    if (!session) {
      return
    }
    const updated = await api.openQna(session.id)
    setSession((previous) => withPreservedHostRole(updated, previous))
  }

  const closeQna = async () => {
    if (!session) {
      return
    }
    const updated = await api.closeQna(session.id)
    setSession((previous) => withPreservedHostRole(updated, previous))
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

  const createPrompt = async (promptText: string) => {
    if (!session) {
      return
    }
    const created = await api.createQnaPrompt(session.id, promptText)
    await api.openQnaPrompt(session.id, created.id)
  }

  const openPrompt = async (promptId: string) => {
    if (!session) {
      return
    }
    await api.openQnaPrompt(session.id, promptId)
  }

  const closePrompt = async (promptId: string) => {
    if (!session) {
      return
    }
    await api.closeQnaPrompt(session.id, promptId)
  }

  const bindPollWidget = async (pollId: string | null) => {
    if (!session) {
      return
    }
    await setPollWidgetBinding(session.id, pollId)
    schedulePollWidgetUpdate(session.id, session.code, polls)
  }

  const bindQnaWidget = async (promptId: string | null) => {
    if (!session) {
      return
    }
    setQnaWidgetStatus(null)
    setQnaWidgetError(null)
    try {
      await setQnaWidgetBinding(session.id, promptId)
      await updateQnaWidget(session.id, session.code, questions, prompts)
      setQnaWidgetStatus(
        promptId
          ? 'Q&A widget bound to the selected prompt.'
          : 'Q&A widget bound to audience Q&A.'
      )
    } catch (err) {
      setQnaWidgetError(
        err instanceof Error ? err.message : 'Failed to update Q&A widget binding.'
      )
    }
  }

  const bindDiscussionWidget = async (promptId: string | null) => {
    if (!session) {
      return
    }
    await setDiscussionWidgetBinding(session.id, promptId)
    await updateDiscussionWidget(session.id, session.code, questions, prompts)
  }

  const audiencePending = useMemo(
    () =>
      questions.filter(
        (question) => !question.prompt_id && question.status === 'pending'
      ),
    [questions]
  )
  const audienceApproved = useMemo(
    () =>
      questions.filter(
        (question) => !question.prompt_id && question.status === 'approved'
      ),
    [questions]
  )
  const openPollCount = useMemo(
    () => polls.filter((poll) => poll.status === 'open').length,
    [polls]
  )
  const qnaStatusLabel = session?.qna_open ? 'Active 1' : 'Inactive'
  const pollStatusLabel = openPollCount > 0 ? `Active ${openPollCount}` : 'Inactive'

  const renderQuestionList = (
    items: Question[],
    emptyMessage: string,
    renderActions: (question: Question) => JSX.Element
  ) => {
    if (items.length === 0) {
      return <p className="muted">{emptyMessage}</p>
    }
    return (
      <ul className="list">
        {items.map((question) => (
          <li key={question.id} className="list-item">
            <div>
              <p>{question.text}</p>
              <span className="muted">{question.votes} votes</span>
            </div>
            <div className="actions">{renderActions(question)}</div>
          </li>
        ))}
      </ul>
    )
  }

  const isAddinHost = window.Office?.context?.host === window.Office?.HostType?.PowerPoint
  const joinLink = resolveJoinUrl(session) || `${AUDIENCE_BASE_URL}/`
  const editorLink = session
    ? buildEditingStationUrl({ sessionId: session.id, code: session.code })
    : null
  const [sessionFilter, setSessionFilter] = useState<'active' | 'upcoming' | 'past'>('active')

  return (
    <div className="flex h-screen overflow-hidden font-sans">
      {!isAddinHost ? (
        <SideNav
          onLogout={onLogout}
          editorLink={editorLink}
          joinLink={joinLink}
          isAddinHost={isAddinHost}
        />
      ) : null}

      <main className={`flex-1 overflow-y-auto bg-white min-h-screen ${isAddinHost ? '' : 'ml-64'}`}>
        {/* Top App Bar */}
        <header className={`flex items-center justify-between w-full h-16 sticky top-0 z-40 bg-white/85 backdrop-blur-xl border-b border-slate-100 gap-4 ${isAddinHost ? 'px-5' : 'px-12'}`}>
          {isAddinHost ? (
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 bg-primary rounded-lg flex items-center justify-center text-white flex-shrink-0">
                <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: "'FILL' 1" }}>layers</span>
              </div>
              <span className="text-base font-bold tracking-tight text-slate-900 truncate">Prezo</span>
            </div>
          ) : (
            <div className="flex items-center gap-3 flex-1 min-w-0 max-w-xl">
              <span className="material-symbols-outlined text-muted flex-shrink-0">search</span>
              <input
                className="!bg-transparent !border-none !shadow-none focus:!ring-0 !text-sm !w-full !font-medium !tracking-tight !p-0"
                placeholder="Search sessions or events..."
                type="text"
              />
            </div>
          )}
          <div className="flex items-center gap-3 flex-shrink-0">
            {!session ? (
              <button
                type="button"
                onClick={() => setShowCreateForm(true)}
                className={`!inline-flex !items-center !gap-1.5 !bg-primary !text-white !rounded-xl !font-bold !shadow-sm !border-0 hover:!bg-primary-dark active:!scale-[0.98] !transition-all ${
                  isAddinHost ? '!px-2.5 !py-1.5 !text-xs' : '!px-4 !py-2 !text-sm'
                }`}
              >
                <span className="material-symbols-outlined text-lg">add</span>
                {isAddinHost ? (
                  <span className="max-[380px]:hidden">Start a new session</span>
                ) : (
                  <span>Start a new session</span>
                )}
                {isAddinHost ? <span className="hidden max-[380px]:inline">New session</span> : null}
              </button>
            ) : null}
            {isAddinHost ? (
              <button
                type="button"
                onClick={onLogout}
                className="!bg-transparent !border !border-slate-200 !text-slate-600 !px-3 !py-1.5 !rounded-lg !text-xs !font-semibold hover:!border-slate-300 !transition-all !shadow-none"
              >
                Sign out
              </button>
            ) : null}
          </div>
        </header>

        {/* Content */}
        <div className={`${isAddinHost ? 'px-5 py-6' : 'px-12 py-10'} w-full max-w-[min(96rem,calc(100vw-1.5rem))] mx-auto`}>
          {/* Page Header */}
          <div className="mb-8">
            <h1 className={`${isAddinHost ? 'text-2xl' : 'text-[2.5rem]'} font-extrabold tracking-tight text-slate-900 mb-2`}>
              {session ? 'Active Session' : 'All Sessions'}
            </h1>
            <p className="text-muted max-w-3xl leading-relaxed text-sm">
              {session
                ? 'Your session is live. Share the join code with your audience and manage interactions below.'
                : 'Manage your interactive sessions. Create new rooms, view engagement, and run live Q&A and polls.'}
            </p>
          </div>

          {!session ? (
            <HostStatsCards stats={dashboardStats} isLoading={dashboardStatsLoading} />
          ) : null}

          {/* Filter Tabs (only when no active session) */}
          {!session ? (
            <div className="flex gap-8 mb-6 border-b border-slate-100">
              {(['active', 'upcoming', 'past'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setSessionFilter(tab)}
                  className={`!bg-transparent !border-0 !border-b-2 !rounded-none !shadow-none !pb-3 !px-0 !text-sm !font-bold !uppercase !tracking-widest !transition-colors ${
                    sessionFilter === tab
                      ? '!text-primary !border-primary'
                      : '!text-muted/50 hover:!text-slate-900 !border-transparent'
                  }`}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>
          ) : null}

          {error ? <p className="text-danger text-sm mb-4">{error}</p> : null}

          {/* Session Setup (list or live session) */}
          <SessionSetup
            session={session}
            onCreate={createSession}
            onJoinByCode={joinSessionByCode}
            onSetHostJoinAccess={setHostJoinAccess}
            recentSessions={recentSessions}
            isLoading={sessionsLoading}
            loadError={sessionsError}
            onResume={resumeSession}
            onDelete={deleteSession}
            deletingSessionId={deletingSessionId}
            onRefresh={() => {
              void loadSessions(maxSessionsLimit)
              void loadDashboardStats()
            }}
            isCompact={isAddinHost}
            listMaxHeightClass={
              isAddinHost
                ? undefined
                : 'max-h-[min(30.875rem,calc(100vh-10rem))]'
            }
          />

          {showCreateForm ? (
            <div
              className="fixed inset-0 z-[100] flex items-center justify-center"
              onClick={(e) => { if (e.target === e.currentTarget) { setShowCreateForm(false); setNewSessionTitle('') } }}
            >
              <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />
              <div className="relative bg-white rounded-2xl shadow-[0_24px_60px_rgba(15,23,42,0.18)] w-full max-w-md mx-4 overflow-hidden">
                <div className="px-7 pt-7 pb-2">
                  <div className="flex items-center gap-3 mb-1">
                    <div className="w-9 h-9 bg-primary/10 rounded-xl flex items-center justify-center">
                      <span className="material-symbols-outlined text-primary text-xl">add_circle</span>
                    </div>
                    <h2 className="text-lg font-bold text-slate-900 !m-0">New Session</h2>
                  </div>
                  <p className="text-sm text-muted mt-2 leading-relaxed !m-0">
                    Give your session a name so participants know what it's about.
                  </p>
                </div>
                <div className="px-7 py-5 space-y-4">
                  <input
                    autoFocus
                    value={newSessionTitle}
                    onChange={(e) => setNewSessionTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !isCreating) {
                        setIsCreating(true)
                        void createSession(newSessionTitle.trim()).then(() => {
                          setNewSessionTitle('')
                          setShowCreateForm(false)
                        }).finally(() => setIsCreating(false))
                      }
                      if (e.key === 'Escape') {
                        setShowCreateForm(false)
                        setNewSessionTitle('')
                      }
                    }}
                    placeholder="Session name"
                    className="!w-full !rounded-xl !border !border-slate-200 !bg-slate-50 !px-4 !py-3 !text-[15px] focus:!border-primary focus:!ring-2 focus:!ring-primary/20 !outline-none !transition-all placeholder:!text-slate-400"
                  />
                </div>
                <div className="px-7 pb-7 flex gap-3">
                  <button
                    onClick={() => {
                      setIsCreating(true)
                      void createSession(newSessionTitle.trim()).then(() => {
                        setNewSessionTitle('')
                        setShowCreateForm(false)
                      }).finally(() => setIsCreating(false))
                    }}
                    disabled={isCreating}
                    className="!flex-1 !bg-primary !text-white !py-3 !rounded-xl !text-sm !font-bold hover:!bg-primary-dark active:!scale-[0.98] !transition-all !shadow-sm !border-0"
                  >
                    {isCreating ? 'Starting...' : 'Start session'}
                  </button>
                  <button
                    onClick={() => { setShowCreateForm(false); setNewSessionTitle('') }}
                    className="!bg-transparent !border !border-slate-200 !text-slate-600 !px-5 !py-3 !rounded-xl !text-sm !font-semibold hover:!bg-slate-50 !transition-all !shadow-none"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {/* Q&A, Prompts, Polls — kept with existing styles via .grid/.panel */}
          {session ? (
            <div className="grid gap-5 mt-6">
              <div className="panel">
                <div className="panel-header">
                  <div className="panel-title">
                    <button
                      type="button"
                      className={`collapse-toggle${isQnaCollapsed ? '' : ' is-expanded'}`}
                      aria-label={isQnaCollapsed ? 'Expand Q&A section' : 'Collapse Q&A section'}
                      onClick={() => setIsQnaCollapsed((prev) => !prev)}
                    />
                    <h2>Q&amp;A</h2>
                  </div>
                  <div className="actions">
                    {isQnaCollapsed ? (
                      <span className="badge">{qnaStatusLabel}</span>
                    ) : session?.qna_open ? (
                      <button className="ghost" onClick={closeQna}>Close Q&amp;A</button>
                    ) : (
                      <button onClick={openQna} disabled={!session}>Open Q&amp;A</button>
                    )}
                  </div>
                </div>
                {isQnaCollapsed ? null : (
                  <div className="panel-body">
                    <p className="muted">Open Q&amp;A to collect and moderate questions.</p>
                    {session.qna_open ? (
                      <p className="muted">Q&amp;A is open. New questions will appear below.</p>
                    ) : (
                      <p className="muted">Q&amp;A is closed. Open it to start collecting questions.</p>
                    )}
                    <div className="moderation-block">
                      <div className="panel-header">
                        <h3>Audience Q&amp;A</h3>
                        <span className="badge">Pending {audiencePending.length}</span>
                      </div>
                      <div className="moderation-columns">
                        <div>
                          <div className="section-label">Pending</div>
                          {renderQuestionList(audiencePending, 'No questions waiting for approval.', (question) => (
                            <>
                              <button onClick={() => approveQuestion(question.id)}>Approve</button>
                              <button className="ghost" onClick={() => hideQuestion(question.id)}>Hide</button>
                            </>
                          ))}
                        </div>
                        <div>
                          <div className="section-label">Approved</div>
                          {renderQuestionList(audienceApproved, 'Approved questions will appear here.', (question) => (
                            <button className="ghost" onClick={() => hideQuestion(question.id)}>Hide</button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="widget-binding">
                      <div className="actions">
                        <button className="ghost" onClick={() => bindQnaWidget(null)}>Bind to audience Q&amp;A</button>
                      </div>
                      {qnaWidgetStatus ? <p className="muted">{qnaWidgetStatus}</p> : null}
                      {qnaWidgetError ? <p className="error">{qnaWidgetError}</p> : null}
                    </div>
                  </div>
                )}
              </div>

              <PromptManager
                prompts={prompts}
                questions={questions}
                onCreate={createPrompt}
                onOpen={openPrompt}
                onClose={closePrompt}
                onApprove={approveQuestion}
                onHide={hideQuestion}
                onBindDiscussionWidget={bindDiscussionWidget}
              />

              {!showPolls ? (
                <div className="panel">
                  <div className="panel-header">
                    <div className="panel-title">
                      <button
                        type="button"
                        className={`collapse-toggle${isPollsCollapsed ? '' : ' is-expanded'}`}
                        aria-label={isPollsCollapsed ? 'Expand polls section' : 'Collapse polls section'}
                        onClick={() => setIsPollsCollapsed((prev) => !prev)}
                      />
                      <h2>Polls</h2>
                    </div>
                    <span className="badge">{pollStatusLabel}</span>
                  </div>
                  {isPollsCollapsed ? null : (
                    <div className="panel-body">
                      <p className="muted">Launch a poll and share it instantly with your audience.</p>
                      <button className="primary full-width" onClick={() => setShowPolls(true)} disabled={!session}>
                        Start poll
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <PollManager
                  polls={polls}
                  onCreate={createPoll}
                  onOpen={openPoll}
                  onClose={closePoll}
                  onBindWidget={bindPollWidget}
                  sessionId={session.id}
                  sessionCode={session.code}
                />
              )}
            </div>
          ) : null}
        </div>
      </main>
    </div>
  )
}
