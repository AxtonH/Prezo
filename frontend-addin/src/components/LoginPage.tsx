import { useState } from 'react'
import type { FormEvent } from 'react'
import { login } from '../auth/auth'

const AUDIENCE_BASE_URL =
  import.meta.env.VITE_AUDIENCE_BASE_URL?.toString() ?? 'http://localhost:5174'

interface LoginPageProps {
  onLogin: () => void
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const isPowerPointHost =
    window.Office?.context?.host === window.Office?.HostType?.PowerPoint ||
    new URLSearchParams(window.location.search).has('_host_Info')

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const user = login(email, password)
    if (user) {
      onLogin()
    } else {
      setError('Invalid username or password')
      setLoading(false)
    }
  }

  const form = (
    <form className="login-form" onSubmit={handleSubmit}>
      <div className="login-form-header">
        <h2>Welcome Back</h2>
        <p className="muted">Sign in to access your workspace</p>
      </div>

      <div className="field">
        <label htmlFor="login-email">Username</label>
        <input
          id="login-email"
          type="text"
          placeholder="Enter your username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="username"
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
        />
      </div>

      {error ? <p className="error">{error}</p> : null}

      <button type="submit" className="login-btn" disabled={loading}>
        {loading ? 'Signing in...' : 'Sign In'}
      </button>

      <div className="login-divider">
        <span>or</span>
      </div>

      <a href={AUDIENCE_BASE_URL} className="login-guest-btn">
        Join as Guest
      </a>

      <div className="login-footer">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
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
    </form>
  )

  return (
    <div className={`login-page${isPowerPointHost ? ' ppt' : ''}`}>
      <div className="login-left">
        <div className="login-brand">
          <div className="login-brand-icon">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="8" fill="#1e293b" />
              <path
                d="M10 22V10h6a4 4 0 010 8h-6"
                stroke="#fff"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div>
            <div className="login-brand-name">Prezo</div>
            <div className="login-brand-tag">Live Presentation Platform</div>
          </div>
        </div>

        {isPowerPointHost ? (
          form
        ) : (
          <>
            <h1 className="login-headline">Transform Your Presentations with AI</h1>
            <p className="login-desc">
              Analyze, enhance, and perfect your presentation decks with our AI-powered platform
              designed for consulting and creative teams.
            </p>

            <div className="login-features">
              <div className="feature-card">
                <div className="feature-icon">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <rect x="2" y="10" width="4" height="8" rx="1" fill="#2563eb" />
                    <rect x="8" y="6" width="4" height="12" rx="1" fill="#2563eb" />
                    <rect x="14" y="2" width="4" height="16" rx="1" fill="#2563eb" />
                  </svg>
                </div>
                <div>
                  <div className="feature-title">Strategic Analysis</div>
                  <div className="feature-desc">Deep narrative and flow analysis</div>
                </div>
              </div>

              <div className="feature-card">
                <div className="feature-icon">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <path
                      d="M10 2l2.5 5 5.5.8-4 3.9.9 5.3L10 14.5 5.1 17l.9-5.3-4-3.9 5.5-.8L10 2z"
                      fill="#2563eb"
                    />
                  </svg>
                </div>
                <div>
                  <div className="feature-title">Image Enhancement</div>
                  <div className="feature-desc">AI-powered visual optimization</div>
                </div>
              </div>

              <div className="feature-card">
                <div className="feature-icon">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <path
                      d="M10 18a8 8 0 100-16 8 8 0 000 16z"
                      stroke="#2563eb"
                      strokeWidth="2"
                      fill="none"
                    />
                    <path d="M7 10l2 2 4-4" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
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
