import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { HostProfile } from '../../auth/profile'
import { updateHostProfile } from '../../auth/profile'
import { ProfileAvatar } from '../ProfileAvatar'

type ProfileSettingsPanelProps = {
  profile: HostProfile
  onProfileSaved: (next: HostProfile) => void
}

function splitDisplayName(name: string | null): { first: string; last: string } {
  const t = (name ?? '').trim()
  if (!t) {
    return { first: '', last: '' }
  }
  const i = t.indexOf(' ')
  if (i === -1) {
    return { first: t, last: '' }
  }
  return { first: t.slice(0, i).trim(), last: t.slice(i + 1).trim() }
}

function joinDisplayName(first: string, last: string): string {
  return [first.trim(), last.trim()].filter(Boolean).join(' ')
}

const cardClass =
  'rounded-2xl border border-border bg-surface shadow-sm overflow-hidden'

export function ProfileSettingsPanel({
  profile,
  onProfileSaved
}: ProfileSettingsPanelProps) {
  const [firstName, setFirstName] = useState(() => splitDisplayName(profile.display_name).first)
  const [lastName, setLastName] = useState(() => splitDisplayName(profile.display_name).last)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [removeAvatar, setRemoveAvatar] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedFlash, setSavedFlash] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const { first, last } = splitDisplayName(profile.display_name)
    setFirstName(first)
    setLastName(last)
    setAvatarFile(null)
    setRemoveAvatar(false)
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
    setError(null)
  }, [profile.id, profile.display_name, profile.avatar_url, profile.email])

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  const displayName = useMemo(
    () => joinDisplayName(firstName, lastName),
    [firstName, lastName]
  )

  const onPickFile = useCallback((list: FileList | null) => {
    const next = list?.[0] ?? null
    setAvatarFile(next)
    setRemoveAvatar(false)
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return next ? URL.createObjectURL(next) : null
    })
  }, [])

  const effectiveAvatarUrl = removeAvatar
    ? null
    : previewUrl ?? profile.avatar_url

  const dirty = useMemo(() => {
    const nameChanged =
      displayName.trim() !== (profile.display_name ?? '').trim()
    const avatarChanged = Boolean(avatarFile) || removeAvatar
    return nameChanged || avatarChanged
  }, [displayName, profile.display_name, avatarFile, removeAvatar])

  const handleSave = async () => {
    setError(null)
    setSaving(true)
    try {
      const next = await updateHostProfile({
        displayName,
        avatarFile: avatarFile ?? null,
        removeAvatar: removeAvatar && !avatarFile
      })
      onProfileSaved(next)
      setAvatarFile(null)
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return null
      })
      setRemoveAvatar(false)
      setSavedFlash(true)
      window.setTimeout(() => setSavedFlash(false), 2500)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save profile')
    } finally {
      setSaving(false)
    }
  }

  const handleRemovePhoto = () => {
    setAvatarFile(null)
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
    setRemoveAvatar(true)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const showRemovePhoto =
    !removeAvatar && (Boolean(profile.avatar_url) || Boolean(avatarFile))

  const inputClass =
    '!w-full !rounded-xl !border !border-border !bg-surface-2 !px-4 !py-3 !text-[15px] !text-slate-900 focus:!border-primary focus:!ring-2 focus:!ring-primary/20 !outline-none !transition-all placeholder:!text-slate-400'

  return (
    <section id="profile" className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-stretch lg:gap-6">
        {/* Left: profile picture (~30%) */}
        <div className={`${cardClass} lg:col-span-4 flex flex-col`}>
          <div className="px-6 pt-6 pb-2">
            <h2 className="text-base font-bold text-slate-900 tracking-tight">
              Profile Picture
            </h2>
          </div>
          <div className="flex flex-col items-center px-6 pb-8 pt-2 flex-1">
            <ProfileAvatar
              avatarUrl={effectiveAvatarUrl}
              displayName={
                displayName.trim() || profile.display_name?.trim() || 'Host'
              }
              sizeClass="w-32 h-32"
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              className="sr-only"
              onChange={(e) => onPickFile(e.target.files)}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="mt-5 !inline-flex !items-center !justify-center !px-7 !py-2.5 !rounded-full !text-sm !font-bold !bg-primary !text-white hover:!bg-primary-dark active:!scale-[0.99] !transition-all !border-0 !shadow-sm"
            >
              Upload a new one
            </button>
            {showRemovePhoto ? (
              <button
                type="button"
                onClick={handleRemovePhoto}
                className="mt-3 !bg-transparent !border-0 !p-0 !shadow-none !text-sm !font-semibold !text-danger hover:!text-red-700 hover:!underline"
              >
                Remove photo
              </button>
            ) : null}
            <p className="text-xs text-muted text-center mt-4 max-w-[12rem] leading-snug">
              JPG, PNG, GIF or WebP. Max 2&nbsp;MB.
            </p>
          </div>
        </div>

        {/* Right: basic information (~70%) */}
        <div className={`${cardClass} lg:col-span-8 flex flex-col`}>
          <div className="px-6 pt-6 pb-2">
            <h2 className="text-base font-bold text-slate-900 tracking-tight">
              Basic Information
            </h2>
          </div>
          <div className="px-6 pb-6 pt-2 flex flex-col flex-1 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
              <div>
                <label
                  htmlFor="settings-first-name"
                  className="block text-sm font-semibold text-slate-800 mb-2"
                >
                  First name
                </label>
                <input
                  id="settings-first-name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  autoComplete="given-name"
                  className={inputClass}
                  placeholder="First name"
                />
              </div>
              <div>
                <label
                  htmlFor="settings-last-name"
                  className="block text-sm font-semibold text-slate-800 mb-2"
                >
                  Last name
                </label>
                <input
                  id="settings-last-name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  autoComplete="family-name"
                  className={inputClass}
                  placeholder="Last name"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="settings-email-readonly"
                className="block text-sm font-semibold text-slate-800 mb-2"
              >
                E-mail
              </label>
              <input
                id="settings-email-readonly"
                readOnly
                value={profile.email ?? ''}
                placeholder="—"
                className={`${inputClass} !bg-slate-50/90 !cursor-default`}
                aria-label="E-mail (read only)"
              />
              <p className="text-xs text-muted mt-2 leading-relaxed">
                This email is tied to your sign-in account. To change it contact
                support.
              </p>
            </div>

            {error ? (
              <p className="text-sm text-danger" role="alert">
                {error}
              </p>
            ) : null}
            {savedFlash ? (
              <p className="text-sm text-emerald-700 font-medium" role="status">
                Profile saved.
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-3 pt-4 mt-auto border-t border-border/80">
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving || !dirty || !displayName.trim()}
                className="!inline-flex !items-center !justify-center !min-w-[7.5rem] !px-5 !py-2.5 !rounded-xl !text-sm !font-bold !bg-primary !text-white hover:!bg-primary-dark disabled:!opacity-50 disabled:!cursor-not-allowed !border-0 !shadow-sm"
              >
                {saving ? 'Saving…' : 'Save changes'}
              </button>
              {dirty ? (
                <span className="text-xs text-muted">
                  You have unsaved changes.
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
