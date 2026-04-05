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
import { fetchHostProfile, type HostProfile } from './auth/profile'
import { LoginPage } from './components/LoginPage'
import { PollManager } from './components/PollManager'
import { PromptManager } from './components/PromptManager'
import { HostSearchBar } from './components/HostSearchBar'
import { HostStatsCards } from './components/HostStatsCards'
import { PrezoWordmark } from './components/PrezoWordmark'
import { PrezoLogo } from './components/PrezoLogo'
import { HostConsoleBootstrap } from './components/HostConsoleBootstrap'
import { OnboardingModal } from './components/OnboardingModal'
import { SessionDashboardPage } from './components/session-dashboard'
import { SessionSetup } from './components/SessionSetup'
import { SettingsPage } from './components/settings'
import { SideNav, type WorkspaceNavId } from './components/SideNav'
import { useDebouncedValue } from './hooks/useDebouncedValue'
import { useHostSearchSnapshotCache } from './hooks/useHostSearchSnapshotCache'
import { useSessionSocket } from './hooks/useSessionSocket'
import { clearLibrarySyncBridge, writeLibrarySyncBridge } from './office/librarySyncBridge'
import { readSessionBinding, writeSessionBinding } from './office/sessionBinding'
import {
  setDiscussionWidgetBinding,
  setPollWidgetBinding,
  setQnaWidgetBinding,
  updateDiscussionWidget,
  updatePollWidget,
  updateQnaWidget
} from './office/widgetShapes'
import { buildEditingStationUrl } from './utils/editingStationUrl'
import { buildEventHits, matchesSessionTitleOrCode } from './utils/hostSearch'
import { isPowerPointAddinHost } from './utils/officeHost'

const HOST_SESSION_STORAGE_ID = 'prezo.hostActiveSessionId'
const HOST_WORKSPACE_NAV_KEY = 'prezo.hostWorkspaceNav'

const WORKSPACE_NAV_IDS: WorkspaceNavId[] = ['dashboard', 'polls', 'discussion', 'qna']

function parseWorkspaceNav(value: string | null): WorkspaceNavId {
  if (value && WORKSPACE_NAV_IDS.includes(value as WorkspaceNavId)) {
    return value as WorkspaceNavId
  }
  return 'dashboard'
}

function readStoredHostSession(): { sessionId: string; workspaceNav: WorkspaceNavId } | null {
  try {
    const id = sessionStorage.getItem(HOST_SESSION_STORAGE_ID)
    if (!id) {
      return null
    }
    return {
      sessionId: id,
      workspaceNav: parseWorkspaceNav(sessionStorage.getItem(HOST_WORKSPACE_NAV_KEY))
    }
  } catch {
    return null
  }
}

function persistHostSession(sessionId: string | null, workspaceNav: WorkspaceNavId) {
  try {
    if (sessionId) {
      sessionStorage.setItem(HOST_SESSION_STORAGE_ID, sessionId)
      sessionStorage.setItem(HOST_WORKSPACE_NAV_KEY, workspaceNav)
    } else {
      sessionStorage.removeItem(HOST_SESSION_STORAGE_ID)
      sessionStorage.removeItem(HOST_WORKSPACE_NAV_KEY)
    }
  } catch {
    /* ignore quota / private mode */
  }
}

/** Office / embedded WebViews sometimes omit History API methods; guard every use. */
function safeHistoryState(): unknown {
  try {
    if (typeof window === 'undefined') {
      return null
    }
    return window.history.state
  } catch {
    return null
  }
}

function safePushState(data: unknown): void {
  if (typeof window === 'undefined' || typeof window.history?.pushState !== 'function') {
    return
  }
  try {
    window.history.pushState(data, '', '')
  } catch {
    /* ignore */
  }
}

function safeReplaceState(data: unknown): void {
  if (typeof window === 'undefined' || typeof window.history?.replaceState !== 'function') {
    return
  }
  try {
    window.history.replaceState(data, '', '')
  } catch {
    /* ignore */
  }
}

function safeHistoryBack(): void {
  if (typeof window === 'undefined' || typeof window.history?.back !== 'function') {
    return
  }
  try {
    window.history.back()
  } catch {
    /* ignore */
  }
}

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
  const [hostProfile, setHostProfile] = useState<HostProfile | null>(null)
  const [profileReady, setProfileReady] = useState(false)

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
    if (!authSession?.user) {
      setHostProfile(null)
      setProfileReady(true)
      return
    }
    let cancelled = false
    setProfileReady(false)
    fetchHostProfile()
      .then((p) => {
        if (!cancelled) {
          setHostProfile(p)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHostProfile(null)
        }
      })
      .finally(() => {
        if (!cancelled) {
          setProfileReady(true)
        }
      })
    return () => {
      cancelled = true
    }
  }, [authSession?.user?.id])

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
    persistHostSession(null, 'dashboard')
    void signOut()
  }

  const isBootstrapping =
    !authReady || (Boolean(authSession?.user) && !profileReady)

  if (isBootstrapping) {
    return <HostConsoleBootstrap />
  }

  if (!authSession?.user) {
    return <LoginPage />
  }

  const resolvedProfile: HostProfile =
    hostProfile ??
    ({
      id: authSession.user.id,
      email: authSession.user.email ?? null,
      display_name: null,
      avatar_url: null,
      onboarding_completed: true
    } satisfies HostProfile)

  return (
    <>
      <HostConsole
        onLogout={handleLogout}
        hostProfile={resolvedProfile}
        onHostProfileChange={setHostProfile}
      />
      {!resolvedProfile.onboarding_completed ? (
        <OnboardingModal
          onCompleted={(next) => {
            setHostProfile(next)
          }}
        />
      ) : null}
    </>
  )
}

function HostConsole({
  onLogout,
  hostProfile,
  onHostProfileChange
}: {
  onLogout: () => void
  hostProfile: HostProfile
  onHostProfileChange: (profile: HostProfile) => void
}) {
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
  const [showJoinByCodeForm, setShowJoinByCodeForm] = useState(false)
  const [joinCodeInput, setJoinCodeInput] = useState('')
  const [isJoiningByCode, setIsJoiningByCode] = useState(false)
  const [joinByCodeError, setJoinByCodeError] = useState<string | null>(null)
  /** `'host'` = sessions dashboard; `'settings'` = full-page settings. */
  const [hostConsoleView, setHostConsoleView] = useState<'host' | 'settings'>('host')
  /** Primary area while hosting a live session (sidebar workspace tabs). */
  const [workspaceNav, setWorkspaceNav] = useState<WorkspaceNavId>('dashboard')
  /** False until we finish trying to restore the last open session (e.g. after browser refresh). */
  const [hostRestoreComplete, setHostRestoreComplete] = useState(false)

  useEffect(() => {
    if (!session) {
      setWorkspaceNav('dashboard')
    }
  }, [session])

  /** Remember active session + tab so refresh / task-pane reload returns to the same place. */
  useEffect(() => {
    if (!session?.id) {
      return
    }
    persistHostSession(session.id, workspaceNav)
  }, [session?.id, workspaceNav])

  useEffect(() => {
    let cancelled = false
    const finish = () => {
      if (!cancelled) {
        setHostRestoreComplete(true)
      }
    }

    const applySnapshot = (snapshot: SessionSnapshot, nav: WorkspaceNavId) => {
      setSession((previous) =>
        withPreservedHostRole(snapshot.session, previous ?? undefined)
      )
      setQuestions(snapshot.questions)
      setPolls(snapshot.polls)
      setPrompts(snapshot.prompts ?? [])
      setShowPolls(snapshot.polls.length > 0)
      setWorkspaceNav(nav)
    }

    const tryRestore = async () => {
      if (typeof window === 'undefined') {
        return
      }

      const stored = readStoredHostSession()
      if (stored) {
        try {
          setError(null)
          const snapshot = await api.getSnapshot(stored.sessionId)
          if (!cancelled) {
            applySnapshot(snapshot, stored.workspaceNav)
          }
        } catch {
          persistHostSession(null, 'dashboard')
        }
        return
      }

      const binding = await readSessionBinding()
      if (!binding?.sessionId || cancelled) {
        return
      }
      try {
        setError(null)
        const snapshot = await api.getSnapshot(binding.sessionId)
        if (!cancelled) {
          applySnapshot(snapshot, 'dashboard')
        }
      } catch {
        /* binding may be stale */
      }
    }

    void tryRestore().finally(finish)

    return () => {
      cancelled = true
    }
  }, [])
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

  type HostHistoryState = { prezoHost?: 'list' | 'session'; sessionId?: string }

  const clearLiveSessionState = useCallback(() => {
    persistHostSession(null, 'dashboard')
    setSession(null)
    setQuestions([])
    setPolls([])
    setPrompts([])
    setShowPolls(false)
    setError(null)
  }, [])

  const prevSessionIdForHistoryRef = useRef<string | null>(null)
  useEffect(() => {
    const id = session?.id ?? null
    const prev = prevSessionIdForHistoryRef.current
    if (id && !prev) {
      const st = safeHistoryState() as HostHistoryState | null
      /** Forward navigation already left us on the session entry — do not push again. */
      if (st?.prezoHost === 'session' && st.sessionId === id) {
        prevSessionIdForHistoryRef.current = id
        return
      }
      safePushState({ prezoHost: 'session', sessionId: id } as HostHistoryState)
    }
    prevSessionIdForHistoryRef.current = id
  }, [session?.id])

  useEffect(() => {
    const onPop = (event: PopStateEvent) => {
      const st = event.state as HostHistoryState | null
      if (st?.prezoHost === 'session' && st.sessionId) {
        const sessionId = st.sessionId
        void (async () => {
          try {
            setError(null)
            const snapshot = await api.getSnapshot(sessionId)
            setSession((previous) =>
              withPreservedHostRole(snapshot.session, previous ?? undefined)
            )
            setQuestions(snapshot.questions)
            setPolls(snapshot.polls)
            setPrompts(snapshot.prompts ?? [])
            setShowPolls(snapshot.polls.length > 0)
          } catch (err) {
            setError(
              err instanceof Error ? err.message : 'Failed to restore session'
            )
            safeReplaceState({ prezoHost: 'list' } as HostHistoryState)
            clearLiveSessionState()
          }
        })()
        return
      }
      /** Back from a live session usually lands on null state or explicit list — always leave live mode. */
      clearLiveSessionState()
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [clearLiveSessionState])

  const goToAllSessions = useCallback(() => {
    if (!session) {
      return
    }
    const st = safeHistoryState() as HostHistoryState | null
    if (
      st?.prezoHost === 'session' &&
      typeof window.history?.back === 'function'
    ) {
      safeHistoryBack()
      return
    }
    clearLiveSessionState()
    safeReplaceState({ prezoHost: 'list' } as HostHistoryState)
  }, [session, clearLiveSessionState])

  const navigateToSessionsHome = useCallback(() => {
    setHostConsoleView('host')
    setWorkspaceNav('dashboard')
    if (session) {
      goToAllSessions()
    }
  }, [session, goToAllSessions])

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

  /** Load list + dashboard together; do not key dashboard on session-list length (that refetched stats when sessions arrived and felt out of sync). */
  useEffect(() => {
    if (session) {
      return
    }
    if (!hostRestoreComplete) {
      return
    }
    void Promise.all([
      loadSessions(maxSessionsLimit),
      loadDashboardStats(),
    ])
  }, [session, hostRestoreComplete, loadSessions, loadDashboardStats, maxSessionsLimit])

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

  const joinSessionByCode = async (
    code: string,
    options?: { setPageError?: boolean }
  ) => {
    const setPageError = options?.setPageError !== false
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
      if (setPageError) {
        setError(message)
      }
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
      void loadDashboardStats()
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

  const isAddinHost = isPowerPointAddinHost()
  const editorLink = session
    ? buildEditingStationUrl({ sessionId: session.id, code: session.code })
    : null
  const [sessionSearchQuery, setSessionSearchQuery] = useState('')
  const [sessionFilter, setSessionFilter] = useState<
    'active' | 'host' | 'cohost'
  >('active')
  const debouncedSearch = useDebouncedValue(sessionSearchQuery, 320)
  const { getSnapshot, loading: searchEventsLoading } = useHostSearchSnapshotCache(
    recentSessions,
    debouncedSearch
  )

  const eventHits = useMemo(
    () => buildEventHits(recentSessions, debouncedSearch, getSnapshot),
    [recentSessions, debouncedSearch, getSnapshot]
  )

  const filteredRecentSessions = useMemo(() => {
    return recentSessions.filter((s) => {
      if (sessionFilter === 'active') {
        if (s.status !== 'active') {
          return false
        }
      } else if (sessionFilter === 'host') {
        if (s.is_original_host === false) {
          return false
        }
      } else if (s.is_original_host !== false) {
        return false
      }
      return matchesSessionTitleOrCode(s, sessionSearchQuery)
    })
  }, [recentSessions, sessionFilter, sessionSearchQuery])

  /**
   * While a session restore may still complete, avoid painting the All Sessions list (flash on refresh).
   * Web: only when we have a persisted session id. Add-in: always wait — binding may restore without storage.
   */
  const hostRestoreInProgress =
    !session &&
    !hostRestoreComplete &&
    (readStoredHostSession() !== null || isAddinHost)

  return (
    <div className="flex h-screen overflow-hidden font-sans">
      {!isAddinHost && !hostRestoreInProgress ? (
        <SideNav
          onLogout={onLogout}
          editorLink={editorLink}
          isAddinHost={isAddinHost}
          displayName={hostProfile.display_name?.trim() || 'Host'}
          avatarUrl={hostProfile.avatar_url}
          onMySessions={navigateToSessionsHome}
          hasLiveSession={Boolean(session)}
          activeSection={hostConsoleView === 'settings' ? 'settings' : 'sessions'}
          onOpenSettings={() => setHostConsoleView('settings')}
          joinSessionModalOpen={showJoinByCodeForm}
          onJoinSession={() => {
            setJoinByCodeError(null)
            setJoinCodeInput('')
            setShowJoinByCodeForm(true)
          }}
          workspaceMode={Boolean(session) && hostConsoleView === 'host'}
          activeWorkspaceNav={workspaceNav}
          onWorkspaceNav={setWorkspaceNav}
        />
      ) : null}

      <main
        className={`flex-1 min-h-0 overflow-y-auto bg-white ${isAddinHost || hostRestoreInProgress ? '' : 'ml-64'}`}
      >
        {/* Top App Bar */}
        <header className={`flex items-center justify-between w-full h-16 sticky top-0 z-40 bg-white/85 backdrop-blur-xl border-b border-slate-100 gap-4 ${isAddinHost ? 'px-5' : 'px-12'}`}>
          {hostRestoreInProgress && hostConsoleView === 'host' ? (
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <PrezoWordmark
                logoSize={isAddinHost ? 20 : 24}
                textClassName={`${isAddinHost ? 'text-base' : 'text-lg'} font-bold tracking-tight text-[#004080]`}
                className="min-w-0 truncate"
              />
            </div>
          ) : isAddinHost ? (
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {hostConsoleView === 'settings' ? (
                <button
                  type="button"
                  onClick={() => setHostConsoleView('host')}
                  className="!inline-flex !items-center !gap-1 !shrink-0 !bg-transparent !border-0 !p-1 !mr-1 !rounded-lg !text-primary hover:!bg-primary/10 !shadow-none"
                  title="Back to workspace"
                  aria-label="Back to workspace"
                >
                  <span className="material-symbols-outlined text-xl">arrow_back</span>
                </button>
              ) : session ? (
                <button
                  type="button"
                  onClick={goToAllSessions}
                  className="!inline-flex !items-center !gap-1 !shrink-0 !bg-transparent !border-0 !p-1 !mr-1 !rounded-lg !text-primary hover:!bg-primary/10 !shadow-none"
                  title="Back to all sessions"
                  aria-label="Back to all sessions"
                >
                  <span className="material-symbols-outlined text-xl">arrow_back</span>
                </button>
              ) : null}
              <PrezoWordmark
                logoSize={20}
                textClassName="text-base font-bold tracking-tight text-[#004080]"
                className="min-w-0 truncate"
              />
              {hostConsoleView === 'host' ? (
                <button
                  type="button"
                  onClick={() => setHostConsoleView('settings')}
                  className="!inline-flex !items-center !gap-1 !ml-auto !shrink-0 !bg-transparent !border-0 !p-1.5 !rounded-lg !text-slate-600 hover:!bg-slate-100 hover:!text-primary !shadow-none"
                  title="Settings"
                  aria-label="Settings"
                >
                  <span className="material-symbols-outlined text-xl">settings</span>
                </button>
              ) : null}
            </div>
          ) : (
            <div className="flex items-center gap-3 flex-1 min-w-0 max-w-xl">
              {hostConsoleView === 'settings' ? (
                <button
                  type="button"
                  onClick={() => setHostConsoleView('host')}
                  className="!inline-flex !items-center !gap-2 !shrink-0 !bg-transparent !border-0 !p-0 !shadow-none !text-primary !font-semibold !text-sm"
                >
                  <span className="material-symbols-outlined text-xl">arrow_back</span>
                  Workspace
                </button>
              ) : (
                <HostSearchBar
                  value={sessionSearchQuery}
                  onChange={setSessionSearchQuery}
                  sessionMatches={filteredRecentSessions}
                  eventHits={eventHits}
                  eventsLoading={searchEventsLoading}
                  debouncedQuery={debouncedSearch}
                  onSelectSession={(selected) => void resumeSession(selected)}
                />
              )}
            </div>
          )}
          <div className="flex items-center gap-3 flex-shrink-0">
            {!session && hostConsoleView !== 'settings' && !hostRestoreInProgress ? (
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
          {hostConsoleView === 'settings' ? (
            <SettingsPage
              profile={hostProfile}
              onBack={() => setHostConsoleView('host')}
              onProfileSaved={onHostProfileChange}
              onSignOut={onLogout}
            />
          ) : hostRestoreInProgress ? (
            <div
              className="flex min-h-[min(60vh,28rem)] flex-col items-center justify-center gap-5 py-20"
              aria-busy="true"
              aria-live="polite"
            >
              <div className="animate-pulse">
                <PrezoLogo size={40} decorative />
              </div>
              <p className="text-sm text-muted">Restoring your session…</p>
              <span className="sr-only">Loading session</span>
            </div>
          ) : (
            <>
              {/* Page header: list + live-session sub-pages (not the session Dashboard — that uses SessionDashboardPage) */}
              {!(session && workspaceNav === 'dashboard') ? (
                <div className="mb-8">
                  <h1 className={`${isAddinHost ? 'text-2xl' : 'text-[2.5rem]'} font-extrabold tracking-tight text-slate-900 mb-2`}>
                    {!session
                      ? 'All Sessions'
                      : workspaceNav === 'polls'
                        ? 'Polls'
                        : workspaceNav === 'discussion'
                          ? 'Open discussion'
                          : 'Q&A'}
                  </h1>
                  {!session ? null : workspaceNav === 'polls' ? (
                    <p className="text-muted max-w-3xl leading-relaxed text-sm">
                      Set up and launch polls for this session. Full layout is coming next.
                    </p>
                  ) : workspaceNav === 'discussion' ? (
                    <p className="text-muted max-w-3xl leading-relaxed text-sm">
                      Run open discussions and monitor the thread. Coming soon.
                    </p>
                  ) : (
                    <p className="text-muted max-w-3xl leading-relaxed text-sm">
                      Open Q&amp;A, moderate questions, and keep the conversation on track. Coming soon.
                    </p>
                  )}
                </div>
              ) : null}

              {!session ? (
                <HostStatsCards stats={dashboardStats} isLoading={dashboardStatsLoading} />
              ) : null}

              {/* Filter Tabs (all-sessions list only) */}
              {!session ? (
                <div className="flex gap-8 mb-6 border-b border-slate-100">
                  {(
                    [
                      { id: 'active' as const, label: 'Active' },
                      { id: 'host' as const, label: 'Host' },
                      { id: 'cohost' as const, label: 'Co-Host' }
                    ] as const
                  ).map(({ id, label }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setSessionFilter(id)}
                      className={`!bg-transparent !border-0 !border-b-2 !rounded-none !shadow-none !pb-3 !px-0 !text-sm !font-bold !uppercase !tracking-widest !transition-colors ${
                        sessionFilter === id
                          ? '!text-primary !border-primary'
                          : '!text-muted/50 hover:!text-slate-900 !border-transparent'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              ) : null}

              {error ? <p className="text-danger text-sm mb-4">{error}</p> : null}

              {/* All-sessions list: always show SessionSetup (no session). Live session: show SessionSetup + panels only on Dashboard; other tabs are placeholders. */}
              {!session ? (
                <SessionSetup
                  session={session}
                  onCreate={createSession}
                  onJoinByCode={joinSessionByCode}
                  onSetHostJoinAccess={setHostJoinAccess}
                  recentSessions={filteredRecentSessions}
                  emptyListMessage={
                    sessionSearchQuery.trim()
                      ? 'No sessions match your search in this tab. Try another keyword or clear the search.'
                      : sessionFilter === 'active'
                        ? 'No active sessions right now. Start a new session or join one with a code.'
                        : sessionFilter === 'host'
                          ? 'You don\'t have any sessions you own yet. Click "Start a new session" to create one.'
                          : 'You\'re not a co-host on any sessions yet. Join a session with a code to appear here.'
                  }
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
              ) : workspaceNav !== 'dashboard' ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-8 py-16 text-center">
                  <span className="material-symbols-outlined text-4xl text-slate-300 mb-3 block">
                    {workspaceNav === 'polls'
                      ? 'bar_chart'
                      : workspaceNav === 'discussion'
                        ? 'forum'
                        : 'question_answer'}
                  </span>
                  <p className="text-slate-600 font-medium mb-1">This area is under construction</p>
                  <p className="text-muted text-sm max-w-md mx-auto">
                    We&apos;ll wire this up in a follow-up step. Use{' '}
                    <strong className="text-slate-700">Dashboard</strong> in the sidebar for the live session overview.
                  </p>
                </div>
              ) : (
                <SessionDashboardPage
                  session={session}
                  hostDisplayName={hostProfile.display_name?.trim() || 'Host'}
                  hostAvatarUrl={hostProfile.avatar_url}
                  participantCount={null}
                  polls={polls}
                  prompts={prompts}
                  questions={questions}
                  audienceQuestions={questions.filter((q) => !q.prompt_id)}
                  onSetHostJoinAccess={setHostJoinAccess}
                  onConfigurePoll={(_pollId) => setShowPolls(true)}
                  onStopPoll={(pollId) => closePoll(pollId)}
                  onStopQna={() => void closeQna()}
                  onStopDiscussion={(promptId) => void closePrompt(promptId)}
                />
              )}
            </>
          )}

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

          {showJoinByCodeForm ? (
            <div
              className="fixed inset-0 z-[100] flex items-center justify-center"
              onClick={(e) => {
                if (e.target === e.currentTarget) {
                  setShowJoinByCodeForm(false)
                  setJoinCodeInput('')
                  setJoinByCodeError(null)
                }
              }}
            >
              <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />
              <div className="relative bg-white rounded-2xl shadow-[0_24px_60px_rgba(15,23,42,0.18)] w-full max-w-md mx-4 overflow-hidden">
                <div className="px-7 pt-7 pb-2">
                  <div className="flex items-center gap-3 mb-1">
                    <div className="w-9 h-9 bg-primary/10 rounded-xl flex items-center justify-center">
                      <span className="material-symbols-outlined text-primary text-xl">login</span>
                    </div>
                    <h2 className="text-lg font-bold text-slate-900 !m-0">Join a session</h2>
                  </div>
                  <p className="text-sm text-muted mt-2 leading-relaxed !m-0">
                    Enter the Prezo session code the host shared with you. You will connect as a co-host.
                  </p>
                </div>
                <div className="px-7 py-5 space-y-4">
                  <input
                    autoFocus
                    value={joinCodeInput}
                    onChange={(e) => {
                      setJoinCodeInput(e.target.value.toUpperCase())
                      setJoinByCodeError(null)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !isJoiningByCode && joinCodeInput.trim()) {
                        setIsJoiningByCode(true)
                        setJoinByCodeError(null)
                        void joinSessionByCode(joinCodeInput, { setPageError: false })
                          .then(() => {
                            setJoinCodeInput('')
                            setShowJoinByCodeForm(false)
                          })
                          .catch((err) => {
                            setJoinByCodeError(
                              err instanceof Error ? err.message : 'Failed to join session'
                            )
                          })
                          .finally(() => setIsJoiningByCode(false))
                      }
                      if (e.key === 'Escape') {
                        setShowJoinByCodeForm(false)
                        setJoinCodeInput('')
                        setJoinByCodeError(null)
                      }
                    }}
                    placeholder="e.g. ABC123"
                    className="!w-full !rounded-xl !border !border-slate-200 !bg-slate-50 !px-4 !py-3 !text-[15px] font-mono tracking-widest focus:!border-primary focus:!ring-2 focus:!ring-primary/20 !outline-none !transition-all placeholder:!text-slate-400"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  {joinByCodeError ? (
                    <p className="text-danger text-sm !m-0">{joinByCodeError}</p>
                  ) : null}
                </div>
                <div className="px-7 pb-7 flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      if (!joinCodeInput.trim()) {
                        return
                      }
                      setIsJoiningByCode(true)
                      setJoinByCodeError(null)
                      void joinSessionByCode(joinCodeInput, { setPageError: false })
                        .then(() => {
                          setJoinCodeInput('')
                          setShowJoinByCodeForm(false)
                        })
                        .catch((err) => {
                          setJoinByCodeError(
                            err instanceof Error ? err.message : 'Failed to join session'
                          )
                        })
                        .finally(() => setIsJoiningByCode(false))
                    }}
                    disabled={isJoiningByCode || !joinCodeInput.trim()}
                    className="!flex-1 !bg-primary !text-white !py-3 !rounded-xl !text-sm !font-bold hover:!bg-primary-dark active:!scale-[0.98] !transition-all !shadow-sm !border-0 disabled:!opacity-50 disabled:!cursor-not-allowed"
                  >
                    {isJoiningByCode ? 'Joining…' : 'Join session'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowJoinByCodeForm(false)
                      setJoinCodeInput('')
                      setJoinByCodeError(null)
                    }}
                    className="!bg-transparent !border !border-slate-200 !text-slate-600 !px-5 !py-3 !rounded-xl !text-sm !font-semibold hover:!bg-slate-50 !transition-all !shadow-none"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {/* Q&A, Prompts, Polls — live session Dashboard tab only */}
          {session && hostConsoleView === 'host' && workspaceNav === 'dashboard' ? (
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
