interface SideNavProps {
  onLogout: () => void
  editorLink: string | null
  joinLink: string
  isAddinHost: boolean
}

const NAV_ITEMS = [
  { icon: 'layers', label: 'My Sessions', active: true },
  { icon: 'group', label: 'Team' },
  { icon: 'analytics', label: 'Analytics' },
  { icon: 'extension', label: 'Integrations' }
]

export function SideNav({ onLogout, editorLink, joinLink, isAddinHost }: SideNavProps) {
  return (
    <aside className="fixed left-0 top-0 h-full flex flex-col bg-surface-2 h-screen w-64 border-r border-border font-sans antialiased tracking-tight z-50">
      <div className="p-8 pb-10">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-white">
            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>layers</span>
          </div>
          <span className="text-xl font-bold tracking-tighter text-slate-900">Prezo</span>
        </div>
        <p className="text-[0.7rem] uppercase tracking-widest text-muted/60 font-medium">Live Sessions</p>
      </div>

      <nav className="flex-1 px-4 space-y-1">
        {NAV_ITEMS.map((item) => (
          <a
            key={item.label}
            href="#"
            className={
              item.active
                ? 'flex items-center gap-3 px-4 py-3 bg-white text-primary border-l-4 border-primary transition-all duration-200 ease-in-out'
                : 'flex items-center gap-3 px-4 py-3 text-slate-900/70 hover:bg-slate-200 transition-all duration-200 ease-in-out'
            }
          >
            <span className="material-symbols-outlined text-[1.25rem]">{item.icon}</span>
            <span className={item.active ? 'font-medium' : ''}>{item.label}</span>
          </a>
        ))}
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
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
            <span className="material-symbols-outlined">person</span>
          </div>
          <div className="overflow-hidden flex-1">
            <p className="text-sm font-semibold truncate text-slate-900">Host</p>
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
