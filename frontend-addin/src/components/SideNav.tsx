import { PrezoWordmark } from './PrezoWordmark'
import { ProfileAvatar } from './ProfileAvatar'

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
  /** Opens join-by-code modal (same pattern as Start a new session). */
  onJoinSession?: () => void
  /** Which primary area is shown — drives sidebar highlight. */
  activeSection?: 'sessions' | 'settings'
  /** Opens full-page settings (host profile, account). */
  onOpenSettings?: () => void
}

const MY_SESSIONS_ITEM = { icon: 'layers', label: 'My Sessions' }

const NAV_ITEMS_BELOW = [
  { icon: 'group', label: 'Team' },
  { icon: 'analytics', label: 'Analytics' },
  { icon: 'extension', label: 'Integrations' }
]

export function SideNav({
  onLogout,
  editorLink,
  isAddinHost,
  displayName,
  avatarUrl,
  onMySessions,
  hasLiveSession = false,
  onJoinSession,
  activeSection = 'sessions',
  onOpenSettings
}: SideNavProps) {
  const sessionsActive = activeSection === 'sessions'
  const settingsActive = activeSection === 'settings'
  const navActiveClass =
    'w-full text-left flex items-center gap-3 px-4 py-3 bg-white text-primary border-l-4 border-primary transition-all duration-200 ease-in-out'
  const navIdleClass =
    'w-full text-left flex items-center gap-3 px-4 py-3 text-slate-900/70 hover:bg-slate-200 transition-all duration-200 ease-in-out'

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
        {onMySessions ? (
          <button
            type="button"
            onClick={onMySessions}
            className={sessionsActive ? navActiveClass : navIdleClass}
            title={hasLiveSession ? 'Back to all sessions' : undefined}
          >
            <span className="material-symbols-outlined text-[1.25rem]">{MY_SESSIONS_ITEM.icon}</span>
            <span className={sessionsActive ? 'font-medium' : ''}>{MY_SESSIONS_ITEM.label}</span>
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

        {!isAddinHost && onJoinSession ? (
          <button
            type="button"
            onClick={onJoinSession}
            className="w-full text-left flex items-center gap-3 px-4 py-3 text-slate-900/70 hover:bg-slate-200 transition-all duration-200 ease-in-out"
          >
            <span className="material-symbols-outlined text-[1.25rem]">login</span>
            <span>Join a session</span>
          </button>
        ) : null}

        {NAV_ITEMS_BELOW.map((item) => (
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
              className={`w-full text-left rounded-lg flex items-center gap-3 px-4 py-2.5 transition-all duration-200 ease-in-out ${
                settingsActive
                  ? 'bg-white text-primary border border-primary/30 shadow-sm'
                  : 'text-slate-900/70 hover:bg-slate-200'
              }`}
            >
              <span className="material-symbols-outlined text-[1.25rem]">settings</span>
              <span className={settingsActive ? 'font-medium' : ''}>Settings</span>
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
