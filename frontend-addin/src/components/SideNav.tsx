import { PrezoWordmark } from './PrezoWordmark'
import { ProfileAvatar } from './ProfileAvatar'

/** Primary areas while hosting a live session (sidebar replaces legacy items). */
export type WorkspaceNavId = 'dashboard' | 'polls' | 'discussion' | 'qna'

interface SideNavProps {
  onLogout: () => void
  editorLink: string | null
  isAddinHost: boolean
  displayName: string
  avatarUrl: string | null
  /** When set, "My Sessions" returns to the all-sessions list (host console). */
  onMySessions?: () => void
  /** True while a live session is open — highlights My Sessions and enables navigation back to the list. */
  hasLiveSession?: boolean
  /** Opens the new-session modal (same as the top bar “Start a new session” action). */
  onCreateSession?: () => void
  /** True while the new-session modal is open — highlights “Create a session” in the nav. */
  createSessionModalOpen?: boolean
  /** Opens join-by-code modal (same pattern as Start a new session). */
  onJoinSession?: () => void
  /** True while join-by-code modal is open — highlights "Join a session" in the nav. */
  joinSessionModalOpen?: boolean
  /** Which primary area is shown — drives sidebar highlight. */
  activeSection?: 'sessions' | 'settings'
  /** Opens full-page settings (host profile, account). */
  onOpenSettings?: () => void
  /**
   * When true (user has a live session open in the host console), show Dashboard / Polls /
   * Open discussion / Q&A instead of My Sessions / Join / Team / Analytics / Integrations.
   */
  workspaceMode?: boolean
  activeWorkspaceNav?: WorkspaceNavId
  onWorkspaceNav?: (id: WorkspaceNavId) => void
}

const MY_SESSIONS_ITEM = { icon: 'layers', label: 'My Sessions' }

const NAV_ITEMS_LEGACY = [
  { icon: 'group', label: 'Team' },
  { icon: 'analytics', label: 'Analytics' },
  { icon: 'extension', label: 'Integrations' }
]

const WORKSPACE_NAV_ITEMS: { id: WorkspaceNavId; icon: string; label: string }[] = [
  { id: 'dashboard', icon: 'dashboard', label: 'Dashboard' },
  { id: 'polls', icon: 'bar_chart', label: 'Polls' },
  { id: 'discussion', icon: 'forum', label: 'Open discussion' },
  { id: 'qna', icon: 'chat_bubble', label: 'Q&A' }
]

export function SideNav({
  onLogout,
  editorLink,
  isAddinHost,
  displayName,
  avatarUrl,
  onMySessions,
  hasLiveSession = false,
  onCreateSession,
  createSessionModalOpen = false,
  onJoinSession,
  joinSessionModalOpen = false,
  activeSection = 'sessions',
  onOpenSettings,
  workspaceMode = false,
  activeWorkspaceNav = 'dashboard',
  onWorkspaceNav
}: SideNavProps) {
  const joinModalOpen = joinSessionModalOpen
  const createModalOpen = createSessionModalOpen
  const sessionsNavActive =
    activeSection === 'sessions' && !joinModalOpen && !createModalOpen
  const settingsNavActive = activeSection === 'settings' && !joinModalOpen && !createModalOpen
  const joinNavActive = joinModalOpen && !createModalOpen
  const createNavActive = createModalOpen
  const navActiveClass =
    'w-full text-left flex items-center gap-3 px-4 py-3 bg-white text-primary border-l-4 border-primary transition-all duration-200 ease-in-out'
  const navIdleClass =
    'w-full text-left flex items-center gap-3 px-4 py-3 text-slate-900/70 hover:bg-slate-200 transition-all duration-200 ease-in-out'

  const workspaceItemActive = (id: WorkspaceNavId) =>
    workspaceMode &&
    activeSection === 'sessions' &&
    !joinModalOpen &&
    !createModalOpen &&
    activeWorkspaceNav === id

  /** In workspace mode, submenu items sit under the session icon with inset + left rail. */
  const workspaceSubmenuBase =
    'w-full text-left flex items-center gap-3 pl-8 pr-4 py-3 ml-4 border-l-2 transition-all duration-200 ease-in-out'

  return (
    <aside className="fixed left-0 top-0 h-full flex flex-col bg-surface-2 h-screen w-64 border-r border-border font-sans antialiased tracking-tight z-50">
      <div className="p-8 pb-10">
        <div className="mb-1">
          <PrezoWordmark
            logoSize={24}
            textClassName="text-xl font-bold tracking-tighter text-[#004080]"
          />
        </div>
        <p className="text-[0.7rem] uppercase tracking-widest text-muted/60 font-medium">Live Sessions</p>
      </div>

      <nav className="flex-1 px-4 space-y-1 min-h-0">
        {!workspaceMode ? (
          <>
            {onMySessions ? (
              <button
                type="button"
                onClick={onMySessions}
                className={sessionsNavActive ? navActiveClass : navIdleClass}
                title={hasLiveSession ? 'Back to all sessions' : undefined}
              >
                <span className="material-symbols-outlined text-[1.25rem]">{MY_SESSIONS_ITEM.icon}</span>
                <span className={sessionsNavActive ? 'font-medium' : ''}>{MY_SESSIONS_ITEM.label}</span>
              </button>
            ) : (
              <a
                href="#"
                className="flex items-center gap-3 px-4 py-3 bg-white text-primary border-l-4 border-primary transition-all duration-200 ease-in-out"
                onClick={(e) => e.preventDefault()}
              >
                <span className="material-symbols-outlined text-[1.25rem]">{MY_SESSIONS_ITEM.icon}</span>
                <span className="font-medium">{MY_SESSIONS_ITEM.label}</span>
              </a>
            )}

            {onCreateSession ? (
              <button
                type="button"
                onClick={onCreateSession}
                className={createNavActive ? navActiveClass : navIdleClass}
                title="Create a new session"
              >
                <span className="material-symbols-outlined text-[1.25rem]">add</span>
                <span className={createNavActive ? 'font-medium' : ''}>Create a session</span>
              </button>
            ) : null}

            {!isAddinHost && onJoinSession ? (
              <button
                type="button"
                onClick={onJoinSession}
                className={joinNavActive ? navActiveClass : navIdleClass}
              >
                <span className="material-symbols-outlined text-[1.25rem]">login</span>
                <span className={joinNavActive ? 'font-medium' : ''}>Join a session</span>
              </button>
            ) : null}

            {NAV_ITEMS_LEGACY.map((item) => (
              <a
                key={item.label}
                href="#"
                className="flex items-center gap-3 px-4 py-3 text-slate-900/70 hover:bg-slate-200 transition-all duration-200 ease-in-out"
                onClick={(e) => e.preventDefault()}
              >
                <span className="material-symbols-outlined text-[1.25rem]">{item.icon}</span>
                <span>{item.label}</span>
              </a>
            ))}
          </>
        ) : (
          <>
            {onMySessions ? (
              <button
                type="button"
                onClick={onMySessions}
                className={navIdleClass}
                title="Back to all sessions"
                aria-label="Back to all sessions"
              >
                <span
                  className="material-symbols-outlined text-[1.25rem] inline-block -rotate-90"
                  aria-hidden
                >
                  {MY_SESSIONS_ITEM.icon}
                </span>
              </button>
            ) : null}
            {WORKSPACE_NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onWorkspaceNav?.(item.id)}
                className={
                  workspaceItemActive(item.id)
                    ? `${workspaceSubmenuBase} bg-white text-primary border-l-4 border-primary`
                    : `${workspaceSubmenuBase} text-slate-900/70 hover:bg-slate-200 border-l-2 border-slate-300/80`
                }
              >
                <span className="material-symbols-outlined text-[1.25rem] shrink-0">{item.icon}</span>
                <span className={workspaceItemActive(item.id) ? 'font-medium' : ''}>{item.label}</span>
              </button>
            ))}
          </>
        )}
      </nav>

      <div className="mt-auto p-4 border-t border-border/30 flex flex-col">
        {editorLink ? (
          <a
            href={editorLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-4 py-3 text-slate-900/70 hover:bg-slate-200 transition-all duration-200 ease-in-out rounded-lg mb-1"
          >
            <span className="material-symbols-outlined text-[1.25rem]">edit</span>
            <span>Editor</span>
          </a>
        ) : null}

        <div className="space-y-1 mt-1">
          {onOpenSettings ? (
            <button
              type="button"
              onClick={onOpenSettings}
              className={settingsNavActive ? navActiveClass : navIdleClass}
            >
              <span className="material-symbols-outlined text-[1.25rem]">settings</span>
              <span className={settingsNavActive ? 'font-medium' : ''}>Settings</span>
            </button>
          ) : (
            <a
              href="#"
              className="flex items-center gap-3 px-4 py-2.5 text-slate-900/70 hover:bg-slate-200 transition-all duration-200 ease-in-out rounded-lg"
              onClick={(e) => e.preventDefault()}
            >
              <span className="material-symbols-outlined text-[1.25rem]">settings</span>
              <span>Settings</span>
            </a>
          )}
          <a
            href="#"
            className="flex items-center gap-3 px-4 py-2.5 text-slate-900/70 hover:bg-slate-200 transition-all duration-200 ease-in-out rounded-lg"
            onClick={(e) => e.preventDefault()}
          >
            <span className="material-symbols-outlined text-[1.25rem]">help</span>
            <span>Help</span>
          </a>
        </div>

        <div className="mt-3 px-4 py-4 bg-slate-100/50 rounded-xl flex items-center gap-3">
          <ProfileAvatar avatarUrl={avatarUrl} displayName={displayName} />
          <div className="overflow-hidden flex-1 min-w-0">
            <p className="text-sm font-semibold truncate text-slate-900">{displayName}</p>
            <p className="text-xs text-muted truncate">Prezo Workspace</p>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="!bg-transparent !border-0 !p-1 !shadow-none text-muted hover:text-danger transition-colors"
            title="Sign out"
          >
            <span className="material-symbols-outlined text-[1.25rem]">logout</span>
          </button>
        </div>
      </div>
    </aside>
  )
}
