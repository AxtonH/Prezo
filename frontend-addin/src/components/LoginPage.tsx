import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { signIn, signUp } from '../auth/auth'
import { PrezoWordmark } from './PrezoWordmark'
import { isPowerPointAddinHost } from '../utils/officeHost'

const AUDIENCE_BASE_URL =
  import.meta.env.VITE_AUDIENCE_BASE_URL?.toString() ?? 'http://localhost:5174'

// A production build with VITE_AUDIENCE_BASE_URL unset would otherwise ship a
// dead localhost guest link; hide the guest path instead of breaking it.
const GUEST_LINK_USABLE =
  !import.meta.env.PROD || !/^https?:\/\/(localhost|127\.0\.0\.1)/i.test(AUDIENCE_BASE_URL)

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface LoginPageProps {
  onLogin?: () => void
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [loadingAction, setLoadingAction] = useState<'sign-in' | 'sign-up' | null>(null)
  const isLoading = loadingAction !== null
  const isPowerPointHost =
    isPowerPointAddinHost() ||
    new URLSearchParams(window.location.search).has('_host_Info')

  useEffect(() => {
    // Applied in the PowerPoint host too: the app shell locks document scroll
    // (#root overflow hidden), so without this class a short taskpane or high
    // zoom clips the form with no way to reach the Sign In button.
    document.body.classList.add('login-view')
    return () => {
      document.body.classList.remove('login-view')
    }
  }, [])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setInfo(null)
    if (!email.trim() || !password) {
      setError('Enter your email and password to sign in.')
      return
    }
    setLoadingAction('sign-in')
    try {
      await signIn(email, password)
      onLogin?.()
      // Stay in the pending state: the auth listener swaps the view, and
      // resetting here re-enables the form for a few frames first.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in')
      setLoadingAction(null)
    }
  }

  const handleSignUp = async () => {
    setError(null)
    setInfo(null)
    if (!email || !password) {
      setError('Enter your email and password to sign up')
      return
    }
    // The button is type="button", so the browser's type="email" constraint
    // validation never runs for sign-up; check the basics before the network.
    if (!EMAIL_PATTERN.test(email.trim())) {
      setError('Enter a valid email address.')
      return
    }
    if (password.length < 6) {
      setError('Choose a password with at least 6 characters.')
      return
    }
    setLoadingAction('sign-up')
    try {
      await signUp(email, password)
      setInfo('Check your email to confirm your account before signing in.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign up')
    } finally {
      setLoadingAction(null)
    }
  }

  const form = (
    <form className="login-form" onSubmit={handleSubmit}>
      <div className="login-form-header">
        <h2>Welcome Back</h2>
        <p className="muted">Sign in to access your workspace</p>
      </div>

      <div className="field">
        <label htmlFor="login-email">Email</label>
        <input
          id="login-email"
          type="email"
          placeholder="Enter your email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          autoFocus
          required
        />
      </div>

      <div className="field">
        <label htmlFor="login-password">Password</label>
        <input
          id="login-password"
          type="password"
          placeholder="Enter your password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          minLength={6}
          required
        />
      </div>

      {/* Always-mounted live regions so inserted messages are announced. */}
      <div aria-live="assertive" role="alert">
        {error ? <p className="error">{error}</p> : null}
      </div>
      <div aria-live="polite" role="status">
        {info ? <p className="login-info">{info}</p> : null}
      </div>

      <button
        type="submit"
        className="login-btn"
        disabled={isLoading}
        aria-busy={loadingAction === 'sign-in' ? 'true' : 'false'}
      >
        {loadingAction === 'sign-in' ? (
          <>
            <span className="login-btn-spinner" aria-hidden="true" />
            Signing in...
          </>
        ) : (
          'Sign In'
        )}
      </button>

      <button
        type="button"
        className="login-signup-btn"
        disabled={isLoading}
        aria-busy={loadingAction === 'sign-up' ? 'true' : 'false'}
        onClick={handleSignUp}
      >
        {loadingAction === 'sign-up' ? (
          <>
            <span className="login-btn-spinner" aria-hidden="true" />
            Sending...
          </>
        ) : (
          'Sign Up'
        )}
      </button>

      {GUEST_LINK_USABLE ? (
        <>
          <div className="login-divider">
            <span>or</span>
          </div>

          <a
            href={AUDIENCE_BASE_URL}
            className="login-guest-btn"
            target="_blank"
            rel="noopener noreferrer"
          >
            Join as Guest
          </a>

          <div className="login-footer">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M8 14A6 6 0 108 2a6 6 0 000 12z"
                stroke="#64748b"
                strokeWidth="1.5"
                fill="none"
              />
              <path d="M8 5v3l2 1" stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <span className="muted">
              Guests can join live sessions but cannot host.
            </span>
          </div>
        </>
      ) : null}
    </form>
  )

  return (
    <div className={`login-page${isPowerPointHost ? ' ppt' : ''}`}>
      <div className="login-left">
        <div className="login-brand">
          <div>
            <div className="login-brand-name login-brand-name--wordmark">
              <PrezoWordmark
                logoSize={32}
                textClassName="font-bold text-[22px] text-white tracking-tight"
              />
            </div>
            <div className="login-brand-tag">Live Presentation Platform</div>
          </div>
        </div>

        {isPowerPointHost ? (
          form
        ) : (
          <>
            <h1 className="login-headline">Transform Your Presentations with Action</h1>
            <p className="login-desc">
              Add fully editable, interactive elements while maintaining a seamless presentation experience
            </p>

            <div className="login-features">
              <div className="feature-card">
                <div className="feature-icon">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                    <rect x="2" y="10" width="4" height="8" rx="1" fill="#60a5fa" />
                    <rect x="8" y="6" width="4" height="12" rx="1" fill="#60a5fa" />
                    <rect x="14" y="2" width="4" height="16" rx="1" fill="#60a5fa" />
                  </svg>
                </div>
                <div>
                  <div className="feature-title">Strategic Analysis</div>
                  <div className="feature-desc">Deep narrative and flow analysis</div>
                </div>
              </div>

              <div className="feature-card">
                <div className="feature-icon">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                    <path
                      d="M10 2l2.5 5 5.5.8-4 3.9.9 5.3L10 14.5 5.1 17l.9-5.3-4-3.9 5.5-.8L10 2z"
                      fill="#60a5fa"
                    />
                  </svg>
                </div>
                <div>
                  <div className="feature-title">Fully Integrated</div>
                  <div className="feature-desc">Bring your PowerPoint to life</div>
                </div>
              </div>

              <div className="feature-card">
                <div className="feature-icon">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                    <path
                      d="M10 18a8 8 0 100-16 8 8 0 000 16z"
                      stroke="#60a5fa"
                      strokeWidth="2"
                      fill="none"
                    />
                    <path d="M7 10l2 2 4-4" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div>
                  <div className="feature-title">Quality Assurance</div>
                  <div className="feature-desc">Precision comparison tools</div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {!isPowerPointHost ? <div className="login-right">{form}</div> : null}
    </div>
  )
}
