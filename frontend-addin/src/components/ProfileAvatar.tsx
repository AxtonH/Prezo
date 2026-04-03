import { useEffect, useState } from 'react'

/** Rounded avatar: remote image or placeholder person icon. */
export function ProfileAvatar(props: {
  avatarUrl: string | null
  /** Display name for alt text (not shown when decorative). */
  displayName: string
  sizeClass?: string
}) {
  const { avatarUrl, displayName, sizeClass = 'w-10 h-10' } = props
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
  }, [avatarUrl])

  if (avatarUrl && !failed) {
    return (
      <img
        src={avatarUrl}
        alt={displayName ? `${displayName} profile photo` : 'Profile'}
        className={`${sizeClass} rounded-full object-cover bg-slate-100`}
        onError={() => setFailed(true)}
      />
    )
  }

  return (
    <div
      className={`${sizeClass} rounded-full bg-primary/10 flex items-center justify-center text-primary flex-shrink-0`}
      aria-hidden
    >
      <span className="material-symbols-outlined">person</span>
    </div>
  )
}
