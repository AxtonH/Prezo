import { PrezoLogo } from './PrezoLogo'
import { PrezoWordmark } from './PrezoWordmark'
import { ProfileAvatar } from './ProfileAvatar'

/** Primary areas while hosting a live session (sidebar replaces legacy items). */
export type WorkspaceNavId = 'dashboard' | 'polls' | 'discussion' | 'qna' | 'editor'

interface SideNavProps {
  onLogout: () => void
  /** @deprecated Kept for optional fallback; workspace Editor uses `onOpenEditorInline`. */
  editorLink: string | null
  /** Opens the Prezo Editor in the session workspace (in-app), e.g. from the footer while Settings is open. */
  onOpenEditorInline?: () => void
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
  activeSection?: 'sessions' | 'settings' | 'brandIdentities'
  /** Opens full-page settings (host profile, account). */
  onOpenSettings?: () => void
  /** Opens brand identity library (saved profiles + upload). */
  onBrandIdentities?: () => void
  /**
   * When true (user has a live session open in the host console), show Dashboard / Polls /
   * Open discussion / Q&A instead of My Sessions / Join / Brand identity / Analytics / Integrations.
   */
  workspaceMode?: boolean
  activeWorkspaceNav?: WorkspaceNavId
  onWorkspaceNav?: (id: WorkspaceNavId) => void
  /** When true, the nav is a narrow icon rail (labels hidden; still clickable). */
  collapsed?: boolean
  /** Toggles sidebar visibility (replaces the Help control in the footer when set). */
  onToggleSidebarCollapse?: () => void
}

const MY_SESSIONS_ITEM = { icon: 'layers', label: 'My Sessions' }

const NAV_ITEMS_LEGACY = [
  { icon: 'analytics', label: 'Analytics' },
  { icon: 'extension', label: 'Integrations' }
]

const WORKSPACE_NAV_ITEMS: { id: WorkspaceNavId; icon: string; label: string }[] = [
  { id: 'dashboard', icon: 'dashboard', label: 'Dashboard' },
  { id: 'polls', icon: 'bar_chart', label: 'Polls' },
  { id: 'discussion', icon: 'forum', label: 'Open discussion' },
  { id: 'qna', icon: 'chat_bubble', label: 'Q&A' },
  { id: 'editor', icon: 'edit', label: 'Editor' }
]

export function SideNav({
  onLogout,
  editorLink,
  onOpenEditorInline,
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
  onBrandIdentities,
  workspaceMode = false,
  activeWorkspaceNav = 'dashboard',
  onWorkspaceNav,
  collapsed = false,
  onToggleSidebarCollapse
}: SideNavProps) {
  const joinModalOpen = joinSessionModalOpen
  const createModalOpen = createSessionModalOpen
  const sessionsNavActive =
    activeSection === 'sessions' && !joinModalOpen && !createModalOpen
  const settingsNavActive = activeSection === 'settings' && !joinModalOpen && !createModalOpen
  const brandIdentitiesNavActive =
    activeSection === 'brandIdentities' && !joinModalOpen && !createModalOpen
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

  function workspaceBtnClass(id: WorkspaceNavId): string {
    const active = workspaceItemActive(id)
    if (collapsed) {
      return active
        ? 'w-full flex justify-center items-center px-2 py-2.5 rounded-lg transition-all duration-200 bg-white text-primary shadow-sm ring-1 ring-primary/20'
        : 'w-full flex justify-center items-center px-2 py-2.5 rounded-lg transition-all duration-200 text-slate-900/70 hover:bg-slate-200'
    }
    return active
      ? `${workspaceSubmenuBase} bg-white text-primary border-l-4 border-primary`
      : `${workspaceSubmenuBase} text-slate-900/70 hover:bg-slate-200 border-l-2 border-slate-300/80`
  }

  const sessionNavBtn = (active: boolean) =>
    collapsed
      ? `w-full flex justify-center items-center px-2 py-3 rounded-lg transition-all duration-200 ${
          active
            ? 'bg-white text-primary ring-1 ring-primary/20 border-l-0'
            : 'text-slate-900/70 hover:bg-slate-200'
        }`
      : active
        ? navActiveClass
        : navIdleClass

  return (
    <aside
      id="host-sidenav"
      className={`fixed left-0 top-0 z-50 flex h-screen shrink-0 flex-col overflow-hidden border-r border-border bg-surface-2 font-sans antialiased tracking-tight transition-[width] duration-200 ease-out ${
        collapsed ? 'w-16' : 'w-64'
      }`}
    >
      <div className={`${collapsed ? 'px-2 pb-4 pt-6' : 'p-8 pb-10'}`}>
        <div className={`mb-1 flex ${collapsed ? 'justify-center' : ''}`}>
          {collapsed ? (
            <PrezoLogo size={28} decorative />
          ) : (
            <PrezoWordmark
              logoSize={24}
              textClassName="text-xl font-bold tracking-tighter text-[#004080]"
            />
          )}
        </div>
        {!collapsed ? (
          <p className="text-[0.7rem] font-medium uppercase tracking-widest text-muted/60">Live Sessions</p>
        ) : null}
      </div>

      <nav
        className={`min-h-0 min-w-0 flex-1 space-y-1 overflow-x-hidden overflow-y-auto ${collapsed ? 'px-1.5' : 'px-4'}`}
      >
        {!workspaceMode ? (
          <>
            {onMySessions ? (
              <button
                type="button"
                onClick={onMySessions}
                className={sessionNavBtn(sessionsNavActive)}
                title={
                  collapsed
                    ? hasLiveSession
                      ? 'Back to all sessions'
                      : 'My Sessions'
                    : hasLiveSession
                      ? 'Back to all sessions'
                      : undefined
                }
              >
                <span className="material-symbols-outlined text-[1.25rem]">{MY_SESSIONS_ITEM.icon}</span>
                {!collapsed ? (
                  <span className={sessionsNavActive ? 'font-medium' : ''}>{MY_SESSIONS_ITEM.label}</span>
                ) : null}
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
                className={sessionNavBtn(createNavActive)}
                title={collapsed ? 'Create a new session' : undefined}
              >
                <span className="material-symbols-outlined text-[1.25rem]">add</span>
                {!collapsed ? (
                  <span className={createNavActive ? 'font-medium' : ''}>Create a session</span>
                ) : null}
              </button>
            ) : null}

            {!isAddinHost && onJoinSession ? (
              <button
                type="button"
                onClick={onJoinSession}
                className={sessionNavBtn(joinNavActive)}
                title={collapsed ? 'Join a session' : undefined}
              >
                <span className="material-symbols-outlined text-[1.25rem]">login</span>
                {!collapsed ? (
                  <span className={joinNavActive ? 'font-medium' : ''}>Join a session</span>
                ) : null}
              </button>
            ) : null}

            {onBrandIdentities ? (
              <button
                type="button"
                onClick={onBrandIdentities}
                className={sessionNavBtn(brandIdentitiesNavActive)}
                title={collapsed ? 'Brand identity' : undefined}
              >
                <span className="material-symbols-outlined text-[1.25rem]">palette</span>
                {!collapsed ? (
                  <span className={brandIdentitiesNavActive ? 'font-medium' : ''}>Brand identity</span>
                ) : null}
              </button>
            ) : null}

            {NAV_ITEMS_LEGACY.map((item) => (
              <a
                key={item.label}
                href="#"
                className={
                  collapsed
                    ? 'flex items-center justify-center px-2 py-3 text-slate-900/70 transition-all duration-200 hover:bg-slate-200 rounded-lg'
                    : 'flex items-center gap-3 px-4 py-3 text-slate-900/70 transition-all duration-200 ease-in-out hover:bg-slate-200'
                }
                title={collapsed ? item.label : undefined}
                onClick={(e) => e.preventDefault()}
              >
                <span className="material-symbols-outlined text-[1.25rem]">{item.icon}</span>
                {!collapsed ? <span>{item.label}</span> : null}
              </a>
            ))}
          </>
        ) : (
          <>
            {onMySessions ? (
              <button
                type="button"
                onClick={onMySessions}
                className={
                  collapsed
                    ? 'flex w-full items-center justify-center rounded-lg px-2 py-3 text-slate-900/70 transition-all duration-200 hover:bg-slate-200'
                    : navIdleClass
                }
                title="Back to all sessions"
                aria-label="Back to all sessions"
              >
                <span
                  className="material-symbols-outlined inline-block -rotate-90 text-[1.25rem]"
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
                className={workspaceBtnClass(item.id)}
                title={collapsed ? item.label : undefined}
              >
                <span className="material-symbols-outlined shrink-0 text-[1.25rem]">{item.icon}</span>
                {!collapsed ? (
                  <span className={workspaceItemActive(item.id) ? 'font-medium' : ''}>{item.label}</span>
                ) : null}
              </button>
            ))}
          </>
        )}
      </nav>

      <div
        className={`mt-auto flex flex-col border-t border-border/30 ${collapsed ? 'p-2' : 'p-4'}`}
      >
        {editorLink && !workspaceMode ? (
          onOpenEditorInline ? (
            <button
              type="button"
              onClick={onOpenEditorInline}
              className={
                collapsed
                  ? 'mb-1 flex w-full items-center justify-center rounded-lg px-2 py-3 text-slate-900/70 transition-all duration-200 hover:bg-slate-200'
                  : 'mb-1 flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left text-slate-900/70 transition-all duration-200 ease-in-out hover:bg-slate-200'
              }
              title={collapsed ? 'Editor' : undefined}
            >
              <span className="material-symbols-outlined text-[1.25rem]">edit</span>
              {!collapsed ? <span>Editor</span> : null}
            </button>
          ) : (
            <a
              href={editorLink}
              target="_blank"
              rel="noopener noreferrer"
              className={
                collapsed
                  ? 'mb-1 flex items-center justify-center rounded-lg px-2 py-3 text-slate-900/70 transition-all duration-200 hover:bg-slate-200'
                  : 'mb-1 flex items-center gap-3 rounded-lg px-4 py-3 text-slate-900/70 transition-all duration-200 ease-in-out hover:bg-slate-200'
              }
              title={collapsed ? 'Editor' : undefined}
            >
              <span className="material-symbols-outlined text-[1.25rem]">edit</span>
              {!collapsed ? <span>Editor</span> : null}
            </a>
          )
        ) : null}

        <div className="mt-1 space-y-1">
          {onOpenSettings ? (
            <button
              type="button"
              onClick={onOpenSettings}
              className={sessionNavBtn(settingsNavActive)}
              title={collapsed ? 'Settings' : undefined}
            >
              <span className="material-symbols-outlined text-[1.25rem]">settings</span>
              {!collapsed ? (
                <span className={settingsNavActive ? 'font-medium' : ''}>Settings</span>
              ) : null}
            </button>
          ) : (
            <a
              href="#"
              className="flex items-center gap-3 rounded-lg px-4 py-2.5 text-slate-900/70 transition-all duration-200 ease-in-out hover:bg-slate-200"
              onClick={(e) => e.preventDefault()}
            >
              <span className="material-symbols-outlined text-[1.25rem]">settings</span>
              <span>Settings</span>
            </a>
          )}
          {onToggleSidebarCollapse ? (
            collapsed ? (
              <button
                type="button"
                onClick={onToggleSidebarCollapse}
                className="flex w-full items-center justify-center rounded-lg px-2 py-2.5 text-slate-900/70 transition-all duration-200 hover:bg-slate-200"
                aria-expanded="false"
                aria-controls="host-sidenav"
                title="Expand sidebar"
              >
                <span className="material-symbols-outlined text-[1.25rem]" aria-hidden>
                  right_panel_open
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onToggleSidebarCollapse}
                className="flex w-full items-center gap-3 rounded-lg px-4 py-2.5 text-left text-slate-900/70 transition-all duration-200 ease-in-out hover:bg-slate-200"
                aria-expanded="true"
                aria-controls="host-sidenav"
                title="Collapse sidebar"
              >
                <span className="material-symbols-outlined text-[1.25rem]" aria-hidden>
                  left_panel_close
                </span>
                <span>Collapse sidebar</span>
              </button>
            )
          ) : (
            <a
              href="#"
              className="flex items-center gap-3 rounded-lg px-4 py-2.5 text-slate-900/70 transition-all duration-200 ease-in-out hover:bg-slate-200"
              onClick={(e) => e.preventDefault()}
            >
              <span className="material-symbols-outlined text-[1.25rem]">help</span>
              <span>Help</span>
            </a>
          )}
        </div>

        <div
          className={`mt-3 flex items-center rounded-xl bg-slate-100/50 ${
            collapsed ? 'flex-col gap-2 px-1 py-3' : 'gap-3 px-4 py-4'
          }`}
        >
          <ProfileAvatar avatarUrl={avatarUrl} displayName={displayName} />
          {!collapsed ? (
            <div className="min-w-0 flex-1 overflow-hidden">
              <p className="truncate text-sm font-semibold text-slate-900">{displayName}</p>
              <p className="text-muted truncate text-xs">Prezo Workspace</p>
            </div>
          ) : null}
          <button
            type="button"
            onClick={onLogout}
            className="!border-0 !bg-transparent !p-1 !shadow-none text-muted transition-colors hover:text-danger"
            title="Sign out"
          >
            <span className="material-symbols-outlined text-[1.25rem]">logout</span>
          </button>
        </div>
      </div>
    </aside>
  )
}
