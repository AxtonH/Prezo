import { ProfileAvatar } from '../ProfileAvatar'

interface SessionParticipantsCardProps {
  /** When null, show an em dash (live per-session count not yet available). */
  activeParticipantCount: number | null
  hostDisplayName: string
  hostAvatarUrl: string | null
}

const PLACEHOLDER_RINGS: { bg: string; z: string }[] = [
  { bg: 'bg-slate-200', z: 'z-[25]' },
  { bg: 'bg-slate-300', z: 'z-[20]' },
  { bg: 'bg-slate-200', z: 'z-[15]' }
]

export function SessionParticipantsCard({
  activeParticipantCount,
  hostDisplayName,
  hostAvatarUrl
}: SessionParticipantsCardProps) {
  const countLabel =
    activeParticipantCount === null ? '—' : String(activeParticipantCount)

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-card">
      <div className="flex items-center justify-between gap-3 mb-4">
        <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted">Participants</p>
        <span className="text-lg font-bold text-primary tabular-nums">{countLabel}</span>
      </div>
      <p className="text-xs text-muted mb-4">
        {activeParticipantCount === null
          ? 'Live audience count will appear here when available.'
          : 'Active participants in this session.'}
      </p>
      <div className="flex items-center -space-x-2">
        <div className="relative z-[30] ring-2 ring-white rounded-full" title={hostDisplayName}>
          <ProfileAvatar avatarUrl={hostAvatarUrl} displayName={hostDisplayName} sizeClass="w-9 h-9" />
        </div>
        {PLACEHOLDER_RINGS.map(({ bg, z }, i) => (
          <div
            key={i}
            className={`relative ${z} h-9 w-9 rounded-full ${bg} ring-2 ring-white`}
            aria-hidden
          />
        ))}
        {typeof activeParticipantCount === 'number' && activeParticipantCount > 4 ? (
          <div
            className="relative z-0 flex h-9 min-w-[2.25rem] items-center justify-center rounded-full bg-primary text-[0.65rem] font-bold text-white ring-2 ring-white px-1.5"
            title="Additional participants"
          >
            +{activeParticipantCount - 4}
          </div>
        ) : null}
      </div>
    </div>
  )
}
