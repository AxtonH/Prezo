import { useCallback, useEffect, useRef, useState } from 'react'

import type { HostProfile } from '../auth/profile'
import { completeHostOnboarding, skipHostOnboarding } from '../auth/profile'
import { ProfileAvatar } from './ProfileAvatar'

interface OnboardingModalProps {
  onCompleted: (profile: HostProfile) => void
}

export function OnboardingModal({ onCompleted }: OnboardingModalProps) {
  const [name, setName] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [savingAction, setSavingAction] = useState<'idle' | 'continue' | 'skip'>('idle')
  const saving = savingAction !== 'idle'
  const fileInputRef = useRef<HTMLInputElement>(null)

  const onPickFile = useCallback((list: FileList | null) => {
    const next = list?.[0] ?? null
    setFile(next)
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return next ? URL.createObjectURL(next) : null
    })
  }, [])

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  const handleSubmit = async () => {
    setError(null)
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Please enter your name')
      return
    }
    setSavingAction('continue')
    try {
      const profile = await completeHostOnboarding(trimmed, file)
      onCompleted(profile)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setSavingAction('idle')
    }
  }

  const handleSkip = async () => {
    setError(null)
    setSavingAction('skip')
    try {
      const profile = await skipHostOnboarding()
      onCompleted(profile)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setSavingAction('idle')
    }
  }

  const previewForAvatar = previewUrl

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/45 backdrop-blur-sm" aria-hidden />
      <div
        className="relative bg-white rounded-2xl shadow-[0_24px_60px_rgba(15,23,42,0.2)] w-full max-w-md overflow-hidden border border-slate-100"
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
      >
        <div className="px-7 pt-7 pb-2">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 bg-primary/10 rounded-xl flex items-center justify-center">
              <span className="material-symbols-outlined text-primary text-xl">person_add</span>
            </div>
            <h2 id="onboarding-title" className="text-lg font-bold text-slate-900 !m-0">
              Welcome to Prezo
            </h2>
          </div>
          <p className="text-sm text-muted mt-2 leading-relaxed !m-0">
            Add your name and an optional profile photo so your workspace feels like yours.
          </p>
        </div>

        <div className="px-7 py-5 space-y-5">
          <div>
            <label htmlFor="onboarding-name" className="block text-[0.65rem] font-bold uppercase tracking-widest text-muted mb-2">
              Name
            </label>
            <input
              id="onboarding-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !saving) void handleSubmit()
              }}
              placeholder="Your name"
              className="!w-full !rounded-xl !border !border-slate-200 !bg-slate-50 !px-4 !py-3 !text-[15px] focus:!border-primary focus:!ring-2 focus:!ring-primary/20 !outline-none !transition-all placeholder:!text-slate-400"
            />
          </div>

          <div>
            <p className="text-[0.65rem] font-bold uppercase tracking-widest text-muted mb-2">
              Profile picture
            </p>
            <div className="flex items-center gap-4">
              <ProfileAvatar
                avatarUrl={previewForAvatar}
                displayName={name.trim() || 'Host'}
                sizeClass="w-16 h-16"
              />
              <div className="flex flex-col gap-2 min-w-0">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  className="hidden"
                  onChange={(e) => onPickFile(e.target.files)}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="!self-start !bg-transparent !border !border-slate-200 !text-slate-700 !px-3 !py-1.5 !rounded-lg !text-sm !font-semibold hover:!bg-slate-50 !transition-all !shadow-none"
                >
                  Choose photo
                </button>
                {file ? (
                  <button
                    type="button"
                    onClick={() => onPickFile(null)}
                    className="!self-start !text-xs !text-muted !font-medium !underline !underline-offset-2 !bg-transparent !border-0 !p-0 !shadow-none"
                  >
                    Remove photo
                  </button>
                ) : (
                  <span className="text-xs text-muted">Optional — JPEG, PNG, GIF, or WebP, max 2 MB</span>
                )}
              </div>
            </div>
          </div>

          {error ? <p className="text-danger text-sm">{error}</p> : null}
        </div>

        <div className="px-7 pb-7 flex flex-col gap-3">
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={saving || !name.trim()}
            className="!w-full !bg-primary !text-white !py-3 !rounded-xl !text-sm !font-bold hover:!bg-primary-dark active:!scale-[0.98] !transition-all !shadow-sm !border-0 disabled:!opacity-50 disabled:!cursor-not-allowed"
          >
            {savingAction === 'continue' ? 'Saving…' : 'Continue'}
          </button>
          <button
            type="button"
            onClick={() => void handleSkip()}
            disabled={saving}
            className="!w-full !bg-transparent !border !border-slate-200 !text-slate-600 !py-3 !rounded-xl !text-sm !font-semibold hover:!bg-slate-50 !transition-all !shadow-none disabled:!opacity-50 disabled:!cursor-not-allowed"
          >
            {savingAction === 'skip' ? 'Skipping…' : 'Skip for now'}
          </button>
        </div>
      </div>
    </div>
  )
}
