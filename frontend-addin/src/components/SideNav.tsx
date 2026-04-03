import { PrezoWordmark } from './PrezoWordmark'
import { ProfileAvatar } from './ProfileAvatar'

interface SideNavProps {
  onLogout: () => void
  editorLink: string | null
  joinLink: string
  isAddinHost: boolean
  displayName: string
  avatarUrl: string | null
  /** When set, "My Sessions" returns to the all-sessions list (host console). */
  onMySessions?: () => void
  /** True while a live session is open — highlights My Sessions and enables navigation back to the list. */
  hasLiveSession?: boolean
}

const NAV_ITEMS = [
  { icon: 'layers', label: 'My Sessions', active: true },
  { icon: 'group', label: 'Team' },
  { icon: 'analytics', label: 'Analytics' },
  { icon: 'extension', label: 'Integrations' }
]

export function SideNav({
  onLogout,
  editorLink,
  joinLink,
  isAddinHost,
  displayName,
  avatarUrl,
  onMySessions,
  hasLiveSession = false
}: SideNavProps) {
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

      <nav className="flex-1 px-4 space-y-1">
        {NAV_ITEMS.map((item) =>
          item.label === 'My Sessions' && onMySessions ? (
            <button
              key={item.label}
              type="button"
              onClick={onMySessions}
              className={
                item.active
                  ? 'w-full text-left flex items-center gap-3 px-4 py-3 bg-white text-primary border-l-4 border-primary transition-all duration-200 ease-in-out'
                  : 'w-full text-left flex items-center gap-3 px-4 py-3 text-slate-900/70 hover:bg-slate-200 transition-all duration-200 ease-in-out'
              }
              title={hasLiveSession ? 'Back to all sessions' : undefined}
            >
              <span className="material-symbols-outlined text-[1.25rem]">{item.icon}</span>
              <span className={item.active ? 'font-medium' : ''}>{item.label}</span>
            </button>
          ) : (
            <a
              key={item.label}
              href="#"
              className={
                item.active
                  ? 'flex items-center gap-3 px-4 py-3 bg-white text-primary border-l-4 border-primary transition-all duration-200 ease-in-out'
                  : 'flex items-center gap-3 px-4 py-3 text-slate-900/70 hover:bg-slate-200 transition-all duration-200 ease-in-out'
              }
              onClick={(e) => e.preventDefault()}
            >
              <span className="material-symbols-outlined text-[1.25rem]">{item.icon}</span>
              <span className={item.active ? 'font-medium' : ''}>{item.label}</span>
            </a>
          )
        )}
      </nav>

      <div className="mt-auto p-4 border-t border-border/30">
        {editorLink ? (
          <a
            href={editorLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-4 py-3 text-slate-900/70 hover:bg-slate-200 transition-all duration-200 ease-in-out mb-1"
          >
            <span className="material-symbols-outlined text-[1.25rem]">edit</span>
            <span>Editor</span>
          </a>
        ) : null}
        {!isAddinHost ? (
          <a
            href={joinLink}
            className="flex items-center gap-3 px-4 py-3 text-slate-900/70 hover:bg-slate-200 transition-all duration-200 ease-in-out mb-1"
          >
            <span className="material-symbols-outlined text-[1.25rem]">login</span>
            <span>Join</span>
          </a>
        ) : null}
        <a
          href="#"
          className="flex items-center gap-3 px-4 py-3 text-slate-900/70 hover:bg-slate-200 transition-all duration-200 ease-in-out mb-1"
        >
          <span className="material-symbols-outlined text-[1.25rem]">settings</span>
          <span>Settings</span>
        </a>
        <a
          href="#"
          className="flex items-center gap-3 px-4 py-3 text-slate-900/70 hover:bg-slate-200 transition-all duration-200 ease-in-out"
        >
          <span className="material-symbols-outlined text-[1.25rem]">help</span>
          <span>Help</span>
        </a>
        <div className="mt-6 px-4 py-4 bg-slate-100/50 rounded-xl flex items-center gap-3">
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
