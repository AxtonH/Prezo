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

  return (
    <div className="login-page">
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
      </div>
    </div>
  )
}
