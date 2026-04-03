import type { ReactNode } from 'react'

type SettingsSectionProps = {
  id?: string
  title: string
  description?: string
  icon?: string
  children: ReactNode
  className?: string
}

/**
 * Card-style section for settings pages: title, optional description, content.
 */
export function SettingsSection({
  id,
  title,
  description,
  icon,
  children,
  className = ''
}: SettingsSectionProps) {
  return (
    <section
      id={id}
      className={`rounded-2xl border border-slate-200/90 bg-white shadow-sm overflow-hidden ${className}`.trim()}
    >
      <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/60">
        <div className="flex items-start gap-3">
          {icon ? (
            <span className="material-symbols-outlined text-primary text-2xl flex-shrink-0 mt-0.5" aria-hidden>
              {icon}
            </span>
          ) : null}
          <div className="min-w-0">
            <h2 className="text-base font-bold text-slate-900 tracking-tight">{title}</h2>
            {description ? (
              <p className="text-sm text-muted mt-1 leading-relaxed">{description}</p>
            ) : null}
          </div>
        </div>
      </div>
      <div className="px-6 py-6">{children}</div>
    </section>
  )
}
