import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { HostProfile } from '../../auth/profile'
import { updateHostProfile } from '../../auth/profile'
import { ProfileAvatar } from '../ProfileAvatar'

type ProfileSettingsPanelProps = {
  profile: HostProfile
  onProfileSaved: (next: HostProfile) => void
}

export function ProfileSettingsPanel({
  profile,
  onProfileSaved
}: ProfileSettingsPanelProps) {
  const [displayName, setDisplayName] = useState(profile.display_name ?? '')
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [removeAvatar, setRemoveAvatar] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedFlash, setSavedFlash] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setDisplayName(profile.display_name ?? '')
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
    const nameChanged = displayName.trim() !== (profile.display_name ?? '').trim()
    const avatarChanged = Boolean(avatarFile) || removeAvatar
    return nameChanged || avatarChanged
  }, [
    displayName,
    profile.display_name,
    avatarFile,
    removeAvatar
  ])

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

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-start gap-8">
        <div className="flex flex-col items-center sm:items-start gap-3">
          <ProfileAvatar
            avatarUrl={effectiveAvatarUrl}
            displayName={displayName.trim() || profile.display_name?.trim() || 'Host'}
            sizeClass="w-28 h-28"
          />
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
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
              className="!inline-flex !items-center !gap-1.5 !px-3 !py-2 !rounded-lg !text-sm !font-semibold !bg-white !border !border-slate-200 !text-slate-800 hover:!bg-slate-50 !shadow-none"
            >
              <span className="material-symbols-outlined text-lg">photo_camera</span>
              Change photo
            </button>
            {showRemovePhoto ? (
              <button
                type="button"
                onClick={handleRemovePhoto}
                className="!inline-flex !items-center !gap-1 !px-3 !py-2 !rounded-lg !text-sm !font-semibold !bg-transparent !text-muted hover:!text-danger !border-0 !shadow-none"
              >
                Remove
              </button>
            ) : null}
          </div>
          <p className="text-xs text-muted text-center sm:text-left max-w-[14rem] leading-snug">
            JPG, PNG, GIF or WebP. Max 2&nbsp;MB. Shown to you in the host console and on session tools.
          </p>
        </div>

        <div className="flex-1 space-y-5 min-w-0 w-full">
          <div>
            <label
              htmlFor="settings-display-name"
              className="block text-[0.65rem] font-bold uppercase tracking-widest text-muted mb-2"
            >
              Display name
            </label>
            <input
              id="settings-display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              autoComplete="name"
              className="!w-full !max-w-md !rounded-xl !border !border-slate-200 !bg-slate-50 !px-4 !py-3 !text-[15px] focus:!border-primary focus:!ring-2 focus:!ring-primary/20 !outline-none !transition-all"
              placeholder="Your name"
            />
          </div>

          <div>
            <span className="block text-[0.65rem] font-bold uppercase tracking-widest text-muted mb-2">
              Email
            </span>
            <p className="text-[15px] text-slate-900 font-medium">
              {profile.email ?? '—'}
            </p>
            <p className="text-xs text-muted mt-1.5 max-w-md leading-relaxed">
              Email is tied to your sign-in account. To change it, use your identity provider or contact support.
            </p>
          </div>
        </div>
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

      <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving || !dirty || !displayName.trim()}
          className="!inline-flex !items-center !justify-center !min-w-[7.5rem] !px-5 !py-2.5 !rounded-xl !text-sm !font-bold !bg-primary !text-white hover:!bg-primary-dark disabled:!opacity-50 disabled:!cursor-not-allowed !border-0 !shadow-sm"
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        {dirty ? (
          <span className="text-xs text-muted">You have unsaved changes.</span>
        ) : null}
      </div>
    </div>
  )
}
