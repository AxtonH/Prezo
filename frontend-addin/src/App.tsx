import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { api } from './api/client'
import type {
  Poll,
  QnaPrompt,
  Question,
  Session,
  SessionActivity,
  SessionSessionStats,
  SessionSnapshot
} from './api/types'
import { getSession, onAuthStateChange, signOut } from './auth/auth'
import { fetchHostProfile, type HostProfile } from './auth/profile'
import { LoginPage } from './components/LoginPage'
import { HostSearchBar } from './components/HostSearchBar'
import { PrezoWordmark } from './components/PrezoWordmark'
import { PrezoLogo } from './components/PrezoLogo'
import { HostConsoleBootstrap } from './components/HostConsoleBootstrap'
import { JoinSessionModal } from './components/JoinSessionModal'
import { OnboardingModal } from './components/OnboardingModal'
import {
  SessionDashboardPage,
  SessionDiscussionDashboardPage,
  SessionEditorEmbed,
  SessionPollsDashboardPage
} from './components/session-dashboard'
import { SessionSetup } from './components/SessionSetup'
import { BrandIdentitiesPage } from './components/brand-identities'
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
  updateDiscussionWidget,
  updatePollWidget,
  updateQnaWidget
} from './office/widgetShapes'
import {
  clearAllAudienceQnaOpenedAt,
  clearAudienceQnaOpenedAt,
  setAudienceQnaOpenedAt
} from './utils/audienceQnaOpenedAtStorage'
import {
  clearAllHostQnaInactiveFlags,
  clearHostQnaSessionFlags,
  setHostQnaEngaged
} from './utils/hostQnaInactiveStorage'
import { buildEditingStationUrl } from './utils/editingStationUrl'
import { buildActivityHits, matchesSessionTitleOrCode } from './utils/hostSearch'
import { isPowerPointAddinHost } from './utils/officeHost'

const HOST_SESSION_STORAGE_ID = 'prezo.hostActiveSessionId'
const HOST_WORKSPACE_NAV_KEY = 'prezo.hostWorkspaceNav'
const HOST_SIDENAV_COLLAPSED_KEY = 'prezo.hostSideNavCollapsed.v1'

/**
 * Module-level prefetch: starts the network request the instant this JS module
 * is parsed — well before React mounts any component.
 * The resolved result is cached so the component can read it synchronously.
 */
interface PrefetchResult {
  sessions: Session[]
  statsMap: Partial<Record<string, SessionSessionStats | null>>
}

let _prefetchCache: PrefetchResult | null = null

const sessionsPrefetchPromise: Promise<PrefetchResult | null> = (async () => {
  try {
    const sessions = await api.listSessions('active', 100)
    let statsMap: Partial<Record<string, SessionSessionStats | null>> = {}
    if (sessions.length > 0) {
      const ids = sessions.map((s) => s.id)
      try {
        const batchResult = await api.batchSessionStats(ids)
        for (const id of ids) {
          statsMap[id] = batchResult[id] ?? null
        }
      } catch {
        const results = await Promise.all(
          ids.map(async (id) => {
            try {
              const st = await api.getSessionSessionStats(id)
              return [id, st] as const
            } catch {
              return [id, null] as const
            }
          })
        )
        statsMap = Object.fromEntries(results)
      }
    }
    _prefetchCache = { sessions, statsMap }
    return _prefetchCache
  } catch {
    return null
  }
})()

function readStoredHostSideNavCollapsed(): boolean {
  try {
    if (typeof window === 'undefined') {
      return false
    }
    return window.localStorage.getItem(HOST_SIDENAV_COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

const WORKSPACE_NAV_IDS: WorkspaceNavId[] = ['dashboard', 'polls', 'discussion', 'qna', 'editor']

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
    clearAllHostQnaInactiveFlags()
    clearAllAudienceQnaOpenedAt()
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
  const [recentSessions, setRecentSessions] = useState<Session[]>(
    () => _prefetchCache?.sessions ?? []
  )
  // true once the first fetch (prefetch or loadSessions) has completed
  const [sessionsReady, setSessionsReady] = useState(() => _prefetchCache !== null)
  const [sessionsLoading, setSessionsLoading] = useState(false)
  const [sessionsError, setSessionsError] = useState<string | null>(null)
  const [sessionStatsBySessionId, setSessionStatsBySessionId] = useState<
    Partial<Record<string, SessionSessionStats | null>>
  >(() => _prefetchCache?.statsMap ?? {})
  const sessionsPrefetchedRef = useRef(_prefetchCache !== null)
  const [sessionSessionStats, setSessionSessionStats] = useState<SessionSessionStats | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newSessionTitle, setNewSessionTitle] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [showJoinByCodeForm, setShowJoinByCodeForm] = useState(false)
  const [isJoiningByCode, setIsJoiningByCode] = useState(false)
  const [joinByCodeError, setJoinByCodeError] = useState<string | null>(null)
  /** `'host'` = sessions dashboard; `'settings'` / `'brandIdentities'` = full-page views. */
  const [hostConsoleView, setHostConsoleView] = useState<'host' | 'settings' | 'brandIdentities'>(
    'host'
  )
  /** Primary area while hosting a live session (sidebar workspace tabs). */
  const [workspaceNav, setWorkspaceNav] = useState<WorkspaceNavId>('dashboard')
  /** When opening the in-app editor from “Configure poll”, pass `pollId` into the iframe URL. */
  const [editorFocusPollId, setEditorFocusPollId] = useState<string | null>(null)
  /** False until we finish trying to restore the last open session (e.g. after browser refresh). */
  const [hostRestoreComplete, setHostRestoreComplete] = useState(false)
  /** Bumped after a successful audience Q&A delete so the dashboard can clear the “inactive Q&A” ref. */
  const [qnaDeletedEpoch, setQnaDeletedEpoch] = useState(0)
  /** Web host console: hide the fixed left nav to give the main column more room (persisted). */
  const [hostSideNavCollapsed, setHostSideNavCollapsed] = useState(() => readStoredHostSideNavCollapsed())

  useEffect(() => {
    setQnaDeletedEpoch(0)
  }, [session?.id])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    try {
      window.localStorage.setItem(HOST_SIDENAV_COLLAPSED_KEY, hostSideNavCollapsed ? '1' : '0')
    } catch {
      /* ignore quota / private mode */
    }
  }, [hostSideNavCollapsed])

  const prevWorkspaceNavRef = useRef<WorkspaceNavId>(workspaceNav)
  useEffect(() => {
    const prev = prevWorkspaceNavRef.current
    prevWorkspaceNavRef.current = workspaceNav
    if (prev === 'editor' && workspaceNav !== 'editor') {
      setEditorFocusPollId(null)
    }
  }, [workspaceNav])

  /** Embedded Prezo editor (poll-game-poc) asks to return to the session dashboard. */
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) {
        return
      }
      const data = event.data as { type?: string } | null
      if (data?.type === 'prezo:editor-exit') {
        setWorkspaceNav('dashboard')
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  useEffect(() => {
    if (!session?.id) {
      setSessionSessionStats(null)
      return
    }
    const id = session.id
    let cancelled = false
    void api
      .getSessionSessionStats(id)
      .then((stats) => {
        if (cancelled) {
          return
        }
        setSessionSessionStats(stats)
      })
      .catch(() => {
        if (cancelled) {
          return
        }
        setSessionSessionStats(null)
      })
    return () => {
      cancelled = true
    }
  }, [session?.id])

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

    // Wait for both restore AND prefetch before marking complete,
    // so we never flash "Loading..." when data is almost ready
    void Promise.all([
      tryRestore(),
      sessionsPrefetchPromise.then((prefetched) => {
        if (!cancelled && prefetched) {
          setRecentSessions(prefetched.sessions)
          setSessionStatsBySessionId(prefetched.statsMap)
          setSessionsReady(true)
          sessionsPrefetchedRef.current = true
        }
      })
    ]).finally(finish)

    return () => {
      cancelled = true
    }
  }, [])
  /** Rows visible before scrolling; API fetch size so the list can scroll for older sessions. */
  const maxSessionsLimit = 100
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null)
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
    /** Keep hostQnaEngaged in sessionStorage so the inactive Q&A row returns after list → session. */
    persistHostSession(null, 'dashboard')
    setSession(null)
    setQuestions([])
    setPolls([])
    setPrompts([])
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

  /** Persist “Q&A used” so the inactive card survives reloads when Q&A is closed. */
  useEffect(() => {
    if (session?.id && session.qna_open) {
      setHostQnaEngaged(session.id)
    }
  }, [session?.id, session?.qna_open])

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

  /** Explicit “all sessions” — do not use history.back(): the stack may contain another session entry, and popstate would re-hydrate it (user stuck on session dashboard). */
  const goToAllSessions = useCallback(() => {
    if (!session) {
      return
    }
    clearLiveSessionState()
    safeReplaceState({ prezoHost: 'list' } as HostHistoryState)
  }, [session, clearLiveSessionState])

  const navigateToSessionsHome = useCallback(() => {
    setHostConsoleView('host')
    if (session) {
      goToAllSessions()
    } else {
      setWorkspaceNav('dashboard')
    }
  }, [session, goToAllSessions])

  const handleSessionActivity = useCallback((activity: SessionActivity) => {
    const sid = latestSessionRef.current?.id
    if (sid) {
      const shouldRefreshSessionStats =
        activity.type === 'session_snapshot' ||
        Boolean(activity.payload.poll) ||
        Boolean(activity.payload.question) ||
        activity.type === 'audience_questions_deleted' ||
        activity.type === 'poll_deleted' ||
        activity.type === 'qna_prompt_deleted'
      if (shouldRefreshSessionStats) {
        void api
          .getSessionSessionStats(sid)
          .then((stats) => {
            if (latestSessionRef.current?.id !== sid) {
              return
            }
            setSessionSessionStats(stats)
          })
          .catch(() => {})
      }
    }

    if (activity.type === 'session_snapshot') {
      const snapshot = activity.payload.snapshot as SessionSnapshot
      setSession((previous) => withPreservedHostRole(snapshot.session, previous))
      setQuestions(snapshot.questions)
      setPolls(snapshot.polls)
      setPrompts(snapshot.prompts ?? [])
      return
    }

    if (activity.type === 'poll_deleted' && typeof activity.payload.poll_id === 'string') {
      const pollId = activity.payload.poll_id as string
      setPolls((prev) => prev.filter((p) => p.id !== pollId))
      return
    }

    if (activity.type === 'qna_prompt_deleted' && typeof activity.payload.prompt_id === 'string') {
      const promptId = activity.payload.prompt_id as string
      setPrompts((prev) => prev.filter((p) => p.id !== promptId))
      setQuestions((prev) => prev.filter((q) => q.prompt_id !== promptId))
      return
    }

    if (activity.type === 'audience_questions_deleted' && Array.isArray(activity.payload.question_ids)) {
      const ids = new Set(activity.payload.question_ids as string[])
      if (ids.size > 0) {
        setQuestions((prev) =>
          prev.filter((q) => Boolean(q.prompt_id) || !ids.has(q.id))
        )
      }
      return
    }

    if (activity.payload.session) {
      const updated = activity.payload.session as Session
      setSession((previous) => withPreservedHostRole(updated, previous))
      return
    }

    if (activity.payload.question) {
      const question = activity.payload.question as Question
      setQuestions((prev) => upsertById(prev, question))
      return
    }

    if (activity.payload.poll) {
      const poll = activity.payload.poll as Poll
      setPolls((prev) => upsertById(prev, poll))
    }

    if (activity.payload.prompt) {
      const prompt = activity.payload.prompt as QnaPrompt
      setPrompts((prev) => upsertById(prev, prompt))
    }
  }, [])

  const socketStatus = useSessionSocket(session?.id ?? null, handleSessionActivity)

  /** Sync before paint so async stats/snapshot completions can reject stale session ids. */
  useLayoutEffect(() => {
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
      const targetId = session.id
      void api
        .getSnapshot(targetId)
        .then((snapshot) => {
          if (latestSessionRef.current?.id !== targetId) {
            return
          }
          setSession((previous) => withPreservedHostRole(snapshot.session, previous))
          setQuestions(snapshot.questions)
          setPolls(snapshot.polls)
          setPrompts(snapshot.prompts ?? [])
          void api
            .getSessionSessionStats(targetId)
            .then((stats) => {
              if (latestSessionRef.current?.id !== targetId) {
                return
              }
              setSessionSessionStats(stats)
            })
            .catch(() => {})
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

      // Fetch stats before rendering cards so data arrives together
      let statsMap: Partial<Record<string, SessionSessionStats | null>> = {}
      if (sessions.length > 0) {
        const ids = sessions.map((s) => s.id)
        try {
          const batchResult = await api.batchSessionStats(ids)
          for (const id of ids) {
            statsMap[id] = batchResult[id] ?? null
          }
        } catch {
          const results = await Promise.all(
            ids.map(async (id) => {
              try {
                const st = await api.getSessionSessionStats(id)
                return [id, st] as const
              } catch {
                return [id, null] as const
              }
            })
          )
          statsMap = Object.fromEntries(results)
        }
      }

      // Set both at the same time so cards render with their data
      setRecentSessions(sessions)
      setSessionStatsBySessionId(statsMap)
      setSessionsReady(true)
    } catch (err) {
      setSessionsError(err instanceof Error ? err.message : 'Failed to load sessions')
      setSessionsReady(true)
    } finally {
      setSessionsLoading(false)
    }
  }, [])

  /** Load session list when viewing all sessions (after host restore completes). */
  useEffect(() => {
    if (session) {
      return
    }
    if (!hostRestoreComplete) {
      return
    }
    // Skip if prefetch already loaded the sessions list
    if (sessionsPrefetchedRef.current) {
      sessionsPrefetchedRef.current = false // allow future manual refreshes
      return
    }
    void loadSessions(maxSessionsLimit)
  }, [session, hostRestoreComplete, loadSessions, maxSessionsLimit])

  useEffect(() => {
    if (!showJoinByCodeForm) {
      return
    }
    void loadSessions(maxSessionsLimit)
  }, [showJoinByCodeForm, loadSessions, maxSessionsLimit])

  const hydrateSession = async (selected: Session) => {
    const snapshot = await api.getSnapshot(selected.id)
    setSession((previous) =>
      withPreservedHostRole(snapshot.session, previous ?? selected)
    )
    setQuestions(snapshot.questions)
    setPolls(snapshot.polls)
    setPrompts(snapshot.prompts ?? [])
  }

  const createSession = async (title: string) => {
    setError(null)
    const created = await api.createSession(title || undefined)
    setSession((previous) => withPreservedHostRole(created, previous))
    setQuestions([])
    setPolls([])
    setPrompts([])
    setHostConsoleView('host')
    setWorkspaceNav('dashboard')
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

  const clearJoinByCodeError = useCallback(() => setJoinByCodeError(null), [])

  const handleJoinWithSessionFromModal = async (selected: Session) => {
    setIsJoiningByCode(true)
    setJoinByCodeError(null)
    setError(null)
    setQuestions([])
    setPolls([])
    setPrompts([])
    try {
      await hydrateSession(selected)
      setHostConsoleView('host')
      setWorkspaceNav('dashboard')
      setShowJoinByCodeForm(false)
    } catch (err) {
      setJoinByCodeError(err instanceof Error ? err.message : 'Failed to load session')
    } finally {
      setIsJoiningByCode(false)
    }
  }

  const handleJoinWithCodeFromModal = async (code: string) => {
    setIsJoiningByCode(true)
    setJoinByCodeError(null)
    try {
      await joinSessionByCode(code, { setPageError: false })
      setHostConsoleView('host')
      setWorkspaceNav('dashboard')
      setShowJoinByCodeForm(false)
    } catch (err) {
      setJoinByCodeError(err instanceof Error ? err.message : 'Failed to join session')
    } finally {
      setIsJoiningByCode(false)
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
      throw new Error('Session not available. Try again.')
    }
    const updated = await api.openQna(session.id)
    setAudienceQnaOpenedAt(session.id)
    setHostQnaEngaged(session.id)
    setSession((previous) => withPreservedHostRole(updated, previous))
  }

  const closeQna = async () => {
    if (!session) {
      return
    }
    const updated = await api.closeQna(session.id)
    setHostQnaEngaged(session.id)
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
      throw new Error('Session not available. Try again.')
    }
    setError(null)
    try {
      const created = await api.createPoll(
        session.id,
        questionText,
        options,
        allowMultiple
      )
      await api.openPoll(session.id, created.id)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create poll'
      setError(message)
      throw new Error(message)
    }
  }

  const createDiscussionPrompt = async (promptText: string) => {
    if (!session) {
      throw new Error('Session not available. Try again.')
    }
    setError(null)
    try {
      const created = await api.createQnaPrompt(session.id, promptText.trim())
      await api.openQnaPrompt(session.id, created.id)
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to create discussion'
      setError(message)
      throw new Error(message)
    }
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

  const deletePoll = async (pollId: string) => {
    if (!session) {
      return
    }
    try {
      await api.deletePoll(session.id, pollId)
      setError(null)
      setPolls((prev) => prev.filter((p) => p.id !== pollId))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete poll'
      setError(message)
      throw new Error(message)
    }
  }

  const deleteDiscussionPrompt = async (promptId: string) => {
    if (!session) {
      return
    }
    try {
      await api.deleteQnaPrompt(session.id, promptId)
      setError(null)
      setPrompts((prev) => prev.filter((p) => p.id !== promptId))
      setQuestions((prev) => prev.filter((q) => q.prompt_id !== promptId))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete discussion'
      setError(message)
      throw new Error(message)
    }
  }

  const deleteQnaPanel = async () => {
    if (!session) {
      return
    }
    try {
      await api.deleteAudienceQuestions(session.id)
      /** Drop audience-only rows locally; discussion prompts keep their thread questions. */
      setQuestions((prev) => prev.filter((q) => Boolean(q.prompt_id)))
      if (session.qna_open) {
        const updated = await api.closeQna(session.id)
        setSession((previous) => withPreservedHostRole(updated, previous))
      }
      clearHostQnaSessionFlags(session.id)
      clearAudienceQnaOpenedAt(session.id)
      setQnaDeletedEpoch((e) => e + 1)
      setError(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete Q&A'
      setError(message)
      throw new Error(message)
    }
  }

  const isAddinHost = isPowerPointAddinHost()
  const editorLink = session
    ? buildEditingStationUrl({
        sessionId: session.id,
        code: session.code,
        parentOrigin: typeof window !== 'undefined' ? window.location.origin : null
      })
    : null

  const goToEmbeddedEditor = useCallback((pollId?: string | null) => {
    if (pollId) {
      setEditorFocusPollId(pollId)
    }
    setWorkspaceNav('editor')
  }, [])

  const handleBindPollWidget = useCallback(
    async (pollId: string) => {
      if (!session) {
        return
      }
      await setPollWidgetBinding(session.id, pollId)
      try {
        await updatePollWidget(session.id, session.code, polls)
      } catch (err) {
        const message =
          err instanceof Error && err.message
            ? err.message
            : 'PowerPoint could not refresh the poll widget. Select the slide with the widget and try again.'
        throw new Error(message)
      }
    },
    [session, polls]
  )

  const handleBindDiscussionWidget = useCallback(
    async (promptId: string) => {
      if (!session) {
        return
      }
      await setDiscussionWidgetBinding(session.id, promptId)
      try {
        await updateDiscussionWidget(session.id, session.code, questions, prompts)
      } catch (err) {
        const message =
          err instanceof Error && err.message
            ? err.message
            : 'PowerPoint could not refresh the discussion widget. Select the slide with the widget and try again.'
        throw new Error(message)
      }
    },
    [session, questions, prompts]
  )
  const [sessionSearchQuery, setSessionSearchQuery] = useState('')
  const [sessionFilter, setSessionFilter] = useState<
    'active' | 'host' | 'cohost'
  >('active')
  const debouncedSearch = useDebouncedValue(sessionSearchQuery, 320)
  const { getSnapshot, loading: searchActivitiesLoading } = useHostSearchSnapshotCache(
    recentSessions,
    debouncedSearch
  )

  const activityHits = useMemo(
    () => buildActivityHits(recentSessions, debouncedSearch, getSnapshot),
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
    <div className="flex h-screen min-h-0 w-full overflow-hidden font-sans">
      {!isAddinHost && !hostRestoreInProgress ? (
        <SideNav
          onLogout={onLogout}
          editorLink={editorLink}
          onOpenEditorInline={() => {
            setHostConsoleView('host')
            setWorkspaceNav('editor')
          }}
          collapsed={hostSideNavCollapsed}
          isAddinHost={isAddinHost}
          displayName={hostProfile.display_name?.trim() || 'Host'}
          avatarUrl={hostProfile.avatar_url}
          onMySessions={navigateToSessionsHome}
          hasLiveSession={Boolean(session)}
          activeSection={
            hostConsoleView === 'settings'
              ? 'settings'
              : hostConsoleView === 'brandIdentities'
                ? 'brandIdentities'
                : 'sessions'
          }
          onOpenSettings={() => setHostConsoleView('settings')}
          onBrandIdentities={() => setHostConsoleView('brandIdentities')}
          createSessionModalOpen={showCreateForm}
          onCreateSession={() => {
            setShowJoinByCodeForm(false)
            setJoinByCodeError(null)
            setShowCreateForm(true)
          }}
          joinSessionModalOpen={showJoinByCodeForm}
          onJoinSession={() => {
            setJoinByCodeError(null)
            setShowCreateForm(false)
            setShowJoinByCodeForm(true)
          }}
          workspaceMode={Boolean(session) && hostConsoleView === 'host'}
          activeWorkspaceNav={workspaceNav}
          onWorkspaceNav={setWorkspaceNav}
          onToggleSidebarCollapse={() => setHostSideNavCollapsed((c) => !c)}
        />
      ) : null}

      <main
        className={`flex-1 min-h-0 min-w-0 ${
          session && workspaceNav === 'editor'
            ? 'flex flex-col overflow-hidden'
            : 'overflow-x-hidden overflow-y-auto'
        } ${
          hostConsoleView === 'brandIdentities' && !isAddinHost ? 'bg-slate-50' : 'bg-white'
        } ${
          isAddinHost || hostRestoreInProgress
            ? ''
            : hostSideNavCollapsed
              ? 'ml-16'
              : 'ml-64'
        }`}
      >
        {/* Web Brand identity: full-width page next to SideNav only — no session search bar / duplicate shell */}
        {!(hostConsoleView === 'brandIdentities' && !isAddinHost) &&
        !(session && !isAddinHost && hostConsoleView === 'host') ? (
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
                ) : hostConsoleView !== 'brandIdentities' && session ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (workspaceNav === 'editor') {
                        setWorkspaceNav('dashboard')
                      } else {
                        goToAllSessions()
                      }
                    }}
                    className="!inline-flex !items-center !gap-1 !shrink-0 !bg-transparent !border-0 !p-1 !mr-1 !rounded-lg !text-primary hover:!bg-primary/10 !shadow-none"
                    title={
                      workspaceNav === 'editor' ? 'Back to session overview' : 'Back to all sessions'
                    }
                    aria-label={
                      workspaceNav === 'editor' ? 'Back to session overview' : 'Back to all sessions'
                    }
                  >
                    <span className="material-symbols-outlined text-xl">arrow_back</span>
                  </button>
                ) : null}
                <PrezoWordmark
                  logoSize={20}
                  textClassName="text-base font-bold tracking-tight text-[#004080]"
                  className="min-w-0 truncate flex-1"
                />
                <div className="flex shrink-0 items-center gap-0.5 ml-auto">
                  {!isAddinHost && hostConsoleView === 'host' && session && workspaceNav !== 'editor' ? (
                    <button
                      type="button"
                      onClick={() => setWorkspaceNav('editor')}
                      className="!inline-flex !items-center !gap-1 !bg-transparent !border-0 !px-2 !py-1.5 !rounded-lg !text-slate-700 hover:!bg-slate-100 !text-xs !font-bold !uppercase !tracking-wide"
                      title="Open Prezo Editor"
                      aria-label="Open Prezo Editor"
                    >
                      <span className="material-symbols-outlined text-xl">edit</span>
                      <span className="max-[380px]:hidden">Editor</span>
                    </button>
                  ) : null}
                  {!isAddinHost && hostConsoleView === 'host' ? (
                    <button
                      type="button"
                      onClick={() => setHostConsoleView('settings')}
                      className="!inline-flex !items-center !gap-1 !shrink-0 !bg-transparent !border-0 !p-1.5 !rounded-lg !text-slate-600 hover:!bg-slate-100 hover:!text-primary !shadow-none"
                      title="Settings"
                      aria-label="Settings"
                    >
                      <span className="material-symbols-outlined text-xl">settings</span>
                    </button>
                  ) : null}
                </div>
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
                  <div className="min-w-0 flex-1">
                    <HostSearchBar
                      value={sessionSearchQuery}
                      onChange={setSessionSearchQuery}
                      sessionMatches={filteredRecentSessions}
                      activityHits={activityHits}
                      activitiesLoading={searchActivitiesLoading}
                      debouncedQuery={debouncedSearch}
                      onSelectSession={(selected) => void resumeSession(selected)}
                    />
                  </div>
                )}
              </div>
            )}
            <div className="flex items-center gap-3 flex-shrink-0">
              {isAddinHost &&
              !session &&
              hostConsoleView === 'host' &&
              !hostRestoreInProgress ? (
                <button
                  type="button"
                  onClick={() => {
                    setShowJoinByCodeForm(false)
                    setJoinByCodeError(null)
                    setShowCreateForm(true)
                  }}
                  className="!inline-flex !items-center !gap-1.5 !bg-primary !text-white !rounded-xl !font-bold !shadow-sm !border-0 hover:!bg-primary-dark active:!scale-[0.98] !transition-all !px-2.5 !py-1.5 !text-xs"
                >
                  <span className="material-symbols-outlined text-lg">add</span>
                  <span className="max-[380px]:hidden">Start a new session</span>
                  <span className="hidden max-[380px]:inline">New session</span>
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
        ) : null}

        {/* Content */}
        <div
          className={
            hostConsoleView === 'brandIdentities' && !isAddinHost
              ? 'mx-auto w-full max-w-none px-0 py-0'
              : session && workspaceNav === 'editor'
                ? 'flex min-h-0 flex-1 flex-col w-full max-w-none px-0 py-0'
                : session && workspaceNav === 'dashboard'
                  ? `mx-auto w-full max-w-7xl ${isAddinHost ? 'px-5 py-8 pb-10 sm:px-6' : 'px-6 py-10 pb-14 sm:px-8 sm:py-12'}`
                  : `mx-auto w-full max-w-[min(96rem,calc(100vw-1.5rem))] ${isAddinHost ? 'px-5 py-6' : 'px-12 py-10'}`
          }
        >
          {hostConsoleView === 'settings' ? (
            <SettingsPage
              profile={hostProfile}
              onBack={() => setHostConsoleView('host')}
              onProfileSaved={onHostProfileChange}
              onSignOut={onLogout}
            />
          ) : hostConsoleView === 'brandIdentities' ? (
            <BrandIdentitiesPage />
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
              {!(
                session &&
                (workspaceNav === 'dashboard' ||
                  workspaceNav === 'polls' ||
                  workspaceNav === 'discussion' ||
                  workspaceNav === 'editor')
              ) ? (
                <div className="mb-8">
                  {!session ? (
                    <>
                      <h1
                        className={`${isAddinHost ? 'text-2xl' : 'text-[2.5rem]'} font-extrabold tracking-tight text-slate-900 mb-2`}
                      >
                        Your Sessions
                      </h1>
                      <p className="text-muted max-w-3xl leading-relaxed text-sm">
                        Create and manage interactive experiences for your presentations
                      </p>
                    </>
                  ) : (
                    <>
                      <h1
                        className={`${isAddinHost ? 'text-2xl' : 'text-[2.5rem]'} font-extrabold tracking-tight text-slate-900 mb-2`}
                      >
                        {workspaceNav === 'polls'
                          ? 'Polls'
                          : workspaceNav === 'discussion'
                            ? 'Open discussion'
                            : 'Q&A'}
                      </h1>
                    </>
                  )}
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

              {error ? <p className="text-danger text-sm mb-4">{error}</p> : null}

              {/* All-sessions list: always show SessionSetup (no session). Live session: show SessionSetup + panels only on Dashboard; other tabs are placeholders. */}
              {!session ? (
                <SessionSetup
                  session={session}
                  onCreate={createSession}
                  onJoinByCode={joinSessionByCode}
                  onSetHostJoinAccess={setHostJoinAccess}
                  onOpenCreateSession={() => {
                    setShowJoinByCodeForm(false)
                    setJoinByCodeError(null)
                    setShowCreateForm(true)
                  }}
                  sessionListFilter={sessionFilter}
                  onSessionListFilterChange={setSessionFilter}
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
                  statsBySessionId={sessionStatsBySessionId}
                  isLoading={sessionsLoading || !sessionsReady}
                  loadError={sessionsError}
                  onResume={resumeSession}
                  onDelete={deleteSession}
                  deletingSessionId={deletingSessionId}
                  onRefresh={() => {
                    void loadSessions(maxSessionsLimit)
                  }}
                  isCompact={isAddinHost}
                  listMaxHeightClass={
                    isAddinHost
                      ? undefined
                      : 'max-h-[min(30.875rem,calc(100vh-10rem))]'
                  }
                />
              ) : workspaceNav === 'editor' ? (
                <SessionEditorEmbed
                  sessionId={session.id}
                  code={session.code}
                  focusPollId={editorFocusPollId}
                />
              ) : workspaceNav === 'polls' ? (
                <SessionPollsDashboardPage
                  session={session}
                  hostDisplayName={hostProfile.display_name?.trim() || 'Host'}
                  polls={polls}
                  onConfigurePoll={(pollId) => {
                    if (!session) {
                      return
                    }
                    goToEmbeddedEditor(pollId)
                  }}
                  onStopPoll={(pollId) => closePoll(pollId)}
                  onResumePoll={(pollId) => void openPoll(pollId)}
                  onDeletePoll={deletePoll}
                  onCreatePoll={createPoll}
                  onBindPollWidget={isAddinHost ? handleBindPollWidget : undefined}
                />
              ) : workspaceNav === 'discussion' ? (
                <SessionDiscussionDashboardPage
                  session={session}
                  hostDisplayName={hostProfile.display_name?.trim() || 'Host'}
                  prompts={prompts}
                  questions={questions}
                  onStopDiscussion={(promptId) => void closePrompt(promptId)}
                  onResumeDiscussion={(promptId) => void openPrompt(promptId)}
                  onDeleteDiscussion={deleteDiscussionPrompt}
                  onApproveDiscussionQuestion={approveQuestion}
                  onHideDiscussionQuestion={hideQuestion}
                  onCreateDiscussion={createDiscussionPrompt}
                  onBindDiscussionWidget={isAddinHost ? handleBindDiscussionWidget : undefined}
                />
              ) : workspaceNav !== 'dashboard' ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-8 py-16 text-center">
                  <span className="material-symbols-outlined text-4xl text-slate-300 mb-3 block">
                    question_answer
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
                  qnaDeletedEpoch={qnaDeletedEpoch}
                  hostDisplayName={hostProfile.display_name?.trim() || 'Host'}
                  sessionStats={sessionSessionStats}
                  polls={polls}
                  prompts={prompts}
                  questions={questions}
                  audienceQuestions={questions.filter((q) => !q.prompt_id)}
                  onSetHostJoinAccess={setHostJoinAccess}
                  onConfigurePoll={(pollId) => {
                    if (!session) {
                      return
                    }
                    goToEmbeddedEditor(pollId)
                  }}
                  onStopPoll={(pollId) => closePoll(pollId)}
                  onStopQna={() => void closeQna()}
                  onStopDiscussion={(promptId) => void closePrompt(promptId)}
                  onResumePoll={(pollId) => void openPoll(pollId)}
                  onResumeQna={() =>
                    void openQna().catch((err) =>
                      setError(err instanceof Error ? err.message : 'Failed to open Q&A')
                    )
                  }
                  onResumeDiscussion={(promptId) => void openPrompt(promptId)}
                  onDeletePoll={deletePoll}
                  onDeleteQna={deleteQnaPanel}
                  onDeleteDiscussion={deleteDiscussionPrompt}
                  onApproveDiscussionQuestion={approveQuestion}
                  onHideDiscussionQuestion={hideQuestion}
                  onApproveAudienceQuestion={approveQuestion}
                  onHideAudienceQuestion={hideQuestion}
                  onCreatePoll={createPoll}
                  onOpenAudienceQna={async () => {
                    await openQna()
                  }}
                  onCreateDiscussionPrompt={async (prompt) => {
                    await createDiscussionPrompt(prompt)
                  }}
                  onBindPollWidget={isAddinHost ? handleBindPollWidget : undefined}
                  onBindDiscussionWidget={isAddinHost ? handleBindDiscussionWidget : undefined}
                />
              )}
            </>
          )}

          {createPortal(
            <>
              {showCreateForm ? (
                <div
                  className="fixed inset-0 z-[200] flex items-center justify-center"
                  onClick={(e) => {
                    if (e.target === e.currentTarget) {
                      setShowCreateForm(false)
                      setNewSessionTitle('')
                    }
                  }}
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
                            void createSession(newSessionTitle.trim())
                              .then(() => {
                                setNewSessionTitle('')
                                setShowCreateForm(false)
                              })
                              .finally(() => setIsCreating(false))
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
                          void createSession(newSessionTitle.trim())
                            .then(() => {
                              setNewSessionTitle('')
                              setShowCreateForm(false)
                            })
                            .finally(() => setIsCreating(false))
                        }}
                        disabled={isCreating}
                        className="!flex-1 !bg-primary !text-white !py-3 !rounded-xl !text-sm !font-bold hover:!bg-primary-dark active:!scale-[0.98] !transition-all !shadow-sm !border-0"
                      >
                        {isCreating ? 'Starting...' : 'Start session'}
                      </button>
                      <button
                        onClick={() => {
                          setShowCreateForm(false)
                          setNewSessionTitle('')
                        }}
                        className="!bg-transparent !border !border-slate-200 !text-slate-600 !px-5 !py-3 !rounded-xl !text-sm !font-semibold hover:!bg-slate-50 !transition-all !shadow-none"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              <JoinSessionModal
                open={showJoinByCodeForm}
                onClose={() => {
                  setShowJoinByCodeForm(false)
                  setJoinByCodeError(null)
                }}
                sessions={recentSessions}
                sessionsLoading={sessionsLoading}
                isBusy={isJoiningByCode}
                error={joinByCodeError}
                onClearError={clearJoinByCodeError}
                onJoinWithSession={handleJoinWithSessionFromModal}
                onJoinWithCode={handleJoinWithCodeFromModal}
              />
            </>,
            document.body
          )}
        </div>
      </main>
    </div>
  )
}
