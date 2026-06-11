import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { updatePassword } from '../auth/auth'
import { PrezoWordmark } from './PrezoWordmark'

interface SetNewPasswordPageProps {
  /** Email of the recovery session's user, shown for context. */
  email: string | null
  /** Called when the password was updated, or the user chose to skip. */
  onDone: () => void
}

/**
 * Shown when the app is opened through a Supabase password-recovery link
 * (App.tsx flips this on for the PASSWORD_RECOVERY auth event). The user
 * already holds a recovery session, so skipping just continues signed in.
 */
export function SetNewPasswordPage({ email, onDone }: SetNewPasswordPageProps) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    // Same full-page scroll behavior as the login page.
    document.body.classList.add('login-view')
    return () => {
      document.body.classList.remove('login-view')
    }
  }, [])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (password.length < 6) {
      setError('Choose a password with at least 6 characters.')
      return
    }
    if (password !== confirm) {
      setError("The passwords don't match. Type the same password in both fields.")
      return
    }
    setSaving(true)
    try {
      await updatePassword(password)
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update your password')
      setSaving(false)
    }
  }

  return (
    <div className="login-page ppt">
      <div className="login-left">
        <div className="login-brand">
          <div>
            <div className="login-brand-name login-brand-name--wordmark">
              <PrezoWordmark
                logoSize={32}
                textClassName="font-bold text-[22px] text-white tracking-tight"
              />
            </div>
            <div className="login-brand-tag">Live Interaction for PowerPoint</div>
          </div>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="login-form-header">
            <h2>Set a new password</h2>
            <p className="muted">
              {email ? `You're signed in as ${email}.` : 'You followed a password reset link.'}
            </p>
          </div>

          <div className="field">
            <label htmlFor="new-password">New password</label>
            <input
              id="new-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              aria-describedby="new-password-hint"
              minLength={6}
              autoFocus
              required
            />
            <span id="new-password-hint" className="muted field-hint">
              At least 6 characters
            </span>
          </div>

          <div className="field">
            <label htmlFor="confirm-password">Confirm new password</label>
            <input
              id="confirm-password"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              minLength={6}
              required
            />
          </div>

          <div aria-live="assertive" role="alert">
            {error ? <p className="error">{error}</p> : null}
          </div>

          <button
            type="submit"
            className="login-btn"
            disabled={saving}
            {...(saving ? { 'aria-busy': true } : {})}
          >
            {saving ? (
              <>
                <span className="login-btn-spinner" aria-hidden="true" />
                Updating…
              </>
            ) : (
              'Update password'
            )}
          </button>

          <p className="login-toggle-row">
            <button type="button" className="login-link" disabled={saving} onClick={onDone}>
              Skip for now
            </button>
          </p>
        </form>
      </div>
    </div>
  )
}
