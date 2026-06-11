import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { resendSignUpConfirmation, resetPassword, signIn, signUp } from '../auth/auth'
import { PrezoWordmark } from './PrezoWordmark'
import { isPowerPointAddinHost } from '../utils/officeHost'

const AUDIENCE_BASE_URL =
  import.meta.env.VITE_AUDIENCE_BASE_URL?.toString() ?? 'http://localhost:5174'

// A production build with VITE_AUDIENCE_BASE_URL unset would otherwise ship a
// dead localhost guest link; hide the guest path instead of breaking it.
const GUEST_LINK_USABLE =
  !import.meta.env.PROD || !/^https?:\/\/(localhost|127\.0\.0\.1)/i.test(AUDIENCE_BASE_URL)

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * sign-in / sign-up / forgot are form modes (the submit button does the
 * active intent, so Enter always does the right thing); the two *-sent
 * views replace the fields with a confirmation state and resend action.
 */
type LoginView = 'sign-in' | 'sign-up' | 'forgot' | 'sign-up-sent' | 'reset-sent'

type LoadingAction = 'submit' | 'resend' | 'confirm-sign-in' | null

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

export function LoginPage() {
  const [view, setView] = useState<LoginView>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [loadingAction, setLoadingAction] = useState<LoadingAction>(null)
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

  const switchView = (next: LoginView) => {
    setView(next)
    setError(null)
    setInfo(null)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setInfo(null)
    const trimmedEmail = email.trim()

    if (view === 'forgot') {
      if (!EMAIL_PATTERN.test(trimmedEmail)) {
        setError('Enter a valid email address.')
        return
      }
      setLoadingAction('submit')
      try {
        await resetPassword(trimmedEmail)
        switchView('reset-sent')
      } catch (err) {
        setError(errorMessage(err, 'Unable to send the reset email'))
      } finally {
        setLoadingAction(null)
      }
      return
    }

    if (!trimmedEmail || !password) {
      setError(
        view === 'sign-up'
          ? 'Enter your email and a password to create your account.'
          : 'Enter your email and password to sign in.'
      )
      return
    }

    if (view === 'sign-up') {
      if (!EMAIL_PATTERN.test(trimmedEmail)) {
        setError('Enter a valid email address.')
        return
      }
      if (password.length < 6) {
        setError('Choose a password with at least 6 characters.')
        return
      }
      setLoadingAction('submit')
      try {
        await signUp(email, password)
        switchView('sign-up-sent')
      } catch (err) {
        setError(errorMessage(err, 'Unable to create your account'))
      } finally {
        setLoadingAction(null)
      }
      return
    }

    setLoadingAction('submit')
    try {
      await signIn(email, password)
      // Stay in the pending state: the auth listener swaps the view, and
      // resetting here re-enables the form for a few frames first.
    } catch (err) {
      setError(errorMessage(err, 'Unable to sign in'))
      setLoadingAction(null)
    }
  }

  const handleResend = async () => {
    setError(null)
    setInfo(null)
    setLoadingAction('resend')
    try {
      if (view === 'sign-up-sent') {
        await resendSignUpConfirmation(email)
      } else {
        await resetPassword(email.trim())
      }
      setInfo('Email sent again. Give it a minute, and check your spam folder.')
    } catch (err) {
      setError(errorMessage(err, 'Unable to resend the email'))
    } finally {
      setLoadingAction(null)
    }
  }

  // One-click attempt from the "confirm your email" state, reusing the
  // credentials already in memory from sign-up.
  const handleConfirmedSignIn = async () => {
    setError(null)
    setInfo(null)
    if (!email.trim() || !password) {
      switchView('sign-in')
      return
    }
    setLoadingAction('confirm-sign-in')
    try {
      await signIn(email, password)
    } catch (err) {
      setError(errorMessage(err, 'Unable to sign in'))
      setLoadingAction(null)
    }
  }

  const isSentView = view === 'sign-up-sent' || view === 'reset-sent'
  const showFields = !isSentView
  const showPassword = view === 'sign-in' || view === 'sign-up'

  const header = {
    'sign-in': {
      title: 'Sign in to Prezo',
      subtitle: 'Host live polls and Q&A from your PowerPoint workspace'
    },
    'sign-up': {
      title: 'Create your Prezo account',
      subtitle: 'Host live polls and Q&A from your PowerPoint workspace'
    },
    forgot: {
      title: 'Reset your password',
      subtitle: "Enter your email and we'll send you a link to set a new one"
    },
    'sign-up-sent': {
      title: 'Confirm your email',
      subtitle: `We sent a confirmation link to ${email.trim()}. Open it in your browser, then come back here.`
    },
    'reset-sent': {
      title: 'Check your email',
      subtitle: `We sent a password reset link to ${email.trim()}. Open it in your browser to set a new password.`
    }
  }[view]

  const submitLabel = {
    'sign-in': { idle: 'Sign in', busy: 'Signing in…' },
    'sign-up': { idle: 'Create account', busy: 'Creating account…' },
    forgot: { idle: 'Send reset link', busy: 'Sending…' }
  }[view as 'sign-in' | 'sign-up' | 'forgot']

  const form = (
    <form className="login-form" onSubmit={handleSubmit}>
      <div className="login-form-header">
        {/* In the taskpane the form header is the page's top-level heading;
            the web variant's h1 is the marketing headline. */}
        {isPowerPointHost ? <h1>{header.title}</h1> : <h2>{header.title}</h2>}
        <p className="muted">{header.subtitle}</p>
      </div>

      {showFields ? (
        <div className="field">
          <label htmlFor="login-email">Email</label>
          <input
            id="login-email"
            type="email"
            placeholder="name@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            autoFocus
            required
          />
        </div>
      ) : null}

      {showPassword ? (
        <div className="field">
          <label htmlFor="login-password">Password</label>
          {/* autoComplete and aria-describedby via spread: the Edge Tools axe
              linter cannot evaluate JSX expressions in these attributes. */}
          <div className="password-field-wrap">
            <input
              id="login-password"
              type={passwordVisible ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              {...(view === 'sign-up'
                ? { autoComplete: 'new-password', 'aria-describedby': 'login-password-hint' }
                : { autoComplete: 'current-password' })}
              minLength={6}
              required
            />
            <button
              type="button"
              className="password-toggle"
              aria-label={passwordVisible ? 'Hide password' : 'Show password'}
              onClick={() => setPasswordVisible((value) => !value)}
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                {passwordVisible ? 'visibility_off' : 'visibility'}
              </span>
            </button>
          </div>
          {view === 'sign-up' ? (
            <span id="login-password-hint" className="muted field-hint">
              At least 6 characters
            </span>
          ) : null}
        </div>
      ) : null}

      {view === 'sign-in' ? (
        <div className="login-forgot-row">
          <button
            type="button"
            className="login-link"
            disabled={isLoading}
            onClick={() => switchView('forgot')}
          >
            Forgot password?
          </button>
        </div>
      ) : null}

      {/* Always-mounted live regions so inserted messages are announced. */}
      <div aria-live="assertive" role="alert">
        {error ? <p className="error">{error}</p> : null}
      </div>
      <div aria-live="polite" role="status">
        {info ? <p className="login-info">{info}</p> : null}
      </div>

      {!isSentView ? (
        /* aria-busy via spread: the Edge Tools axe linter cannot evaluate JSX
           expressions and flags any aria-* expression value as invalid. */
        <button
          type="submit"
          className="login-btn"
          disabled={isLoading}
          {...(loadingAction === 'submit' ? { 'aria-busy': true } : {})}
        >
          {loadingAction === 'submit' ? (
            <>
              <span className="login-btn-spinner" aria-hidden="true" />
              {submitLabel.busy}
            </>
          ) : (
            submitLabel.idle
          )}
        </button>
      ) : null}

      {view === 'sign-up-sent' ? (
        <button
          type="button"
          className="login-btn"
          disabled={isLoading}
          {...(loadingAction === 'confirm-sign-in' ? { 'aria-busy': true } : {})}
          onClick={handleConfirmedSignIn}
        >
          {loadingAction === 'confirm-sign-in' ? (
            <>
              <span className="login-btn-spinner" aria-hidden="true" />
              Signing in…
            </>
          ) : (
            "I've confirmed, sign me in"
          )}
        </button>
      ) : null}

      {isSentView ? (
        <button
          type="button"
          className="login-signup-btn"
          disabled={isLoading}
          {...(loadingAction === 'resend' ? { 'aria-busy': true } : {})}
          onClick={handleResend}
        >
          {loadingAction === 'resend' ? (
            <>
              <span className="login-btn-spinner" aria-hidden="true" />
              Resending…
            </>
          ) : (
            'Resend email'
          )}
        </button>
      ) : null}

      <p className="login-toggle-row">
        {view === 'sign-in' ? (
          <>
            New to Prezo?
            <button
              type="button"
              className="login-link"
              disabled={isLoading}
              onClick={() => switchView('sign-up')}
            >
              Create an account
            </button>
          </>
        ) : view === 'sign-up' ? (
          <>
            Already have an account?
            <button
              type="button"
              className="login-link"
              disabled={isLoading}
              onClick={() => switchView('sign-in')}
            >
              Sign in
            </button>
          </>
        ) : (
          <button
            type="button"
            className="login-link"
            disabled={isLoading}
            onClick={() => switchView('sign-in')}
          >
            Back to sign in
          </button>
        )}
      </p>

      {GUEST_LINK_USABLE && (view === 'sign-in' || view === 'sign-up') ? (
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
            Join as guest
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
              Guests can join and vote in live sessions. Hosting needs an account.
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
            <div className="login-brand-tag">Live Interaction for PowerPoint</div>
          </div>
        </div>

        {isPowerPointHost ? (
          form
        ) : (
          <>
            <h1 className="login-headline">Turn Presentations into Conversations</h1>
            <p className="login-desc">
              Run live polls, Q&A, and AI-generated interactive visuals from inside PowerPoint.
              No app switching, no broken flow.
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
                  <div className="feature-title">Live Polls &amp; Q&amp;A</div>
                  <div className="feature-desc">Capture audience input in real time, right on your slides</div>
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
                  <div className="feature-title">Native to PowerPoint</div>
                  <div className="feature-desc">Insert and edit interactive elements without leaving your deck</div>
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
                  <div className="feature-title">AI-Generated Visuals</div>
                  <div className="feature-desc">Turn poll results into polished, presentation-ready artifacts</div>
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
