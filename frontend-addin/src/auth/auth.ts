import type { AuthError, Session, User } from '@supabase/supabase-js'

import { supabase } from './supabaseClient'

export interface AuthUser {
  id: string
  email: string | null
}

const EMAIL_REDIRECT_URL = import.meta.env.VITE_SUPABASE_EMAIL_REDIRECT_URL?.toString()

// A hung network would otherwise leave the login form disabled forever
// (supabase-js has no built-in request timeout).
const AUTH_TIMEOUT_MS = 30_000

async function withTimeout<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error('The request timed out. Check your connection and try again.')),
      AUTH_TIMEOUT_MS
    )
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    clearTimeout(timer)
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

// Supabase's raw messages are developer copy ("Invalid login credentials",
// rate-limit phrasing); map known error codes to product copy before they
// reach the form. Unknown codes fall back to the original message.
const AUTH_ERROR_COPY: Record<string, string> = {
  invalid_credentials:
    "That email and password don't match. Check both and try again, or create an account.",
  email_not_confirmed:
    'Your email is not confirmed yet. Open the confirmation link we sent you, then sign in.',
  user_already_exists: 'An account with this email already exists. Sign in instead.',
  email_exists: 'An account with this email already exists. Sign in instead.',
  weak_password: 'Choose a password with at least 6 characters.',
  email_address_invalid: 'Enter a valid email address.',
  over_email_send_rate_limit: 'Too many emails requested. Wait a minute, then try again.',
  over_request_rate_limit: 'Too many attempts. Wait a minute, then try again.',
  request_timeout: 'The request timed out. Check your connection and try again.',
  signup_disabled: 'New sign-ups are currently disabled.'
}

function friendlyAuthError(error: AuthError): Error {
  const friendly = error.code ? AUTH_ERROR_COPY[error.code] : undefined
  if (friendly) {
    return new Error(friendly)
  }
  // Network-level failures surface browser strings like "Failed to fetch".
  if (/failed to fetch|network/i.test(error.message)) {
    return new Error('Could not reach the server. Check your connection and try again.')
  }
  return new Error(error.message)
}

function isDuplicateSignUpResponse(user: User | null): boolean {
  return Array.isArray(user?.identities) && user.identities.length === 0
}

export async function signIn(email: string, password: string): Promise<User | null> {
  const { data, error } = await withTimeout(
    supabase.auth.signInWithPassword({
      email: normalizeEmail(email),
      password
    })
  )
  if (error) {
    throw friendlyAuthError(error)
  }
  return data.user
}

export async function signUp(email: string, password: string): Promise<void> {
  const normalizedEmail = normalizeEmail(email)
  const { data, error } = await withTimeout(
    supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: EMAIL_REDIRECT_URL ? { emailRedirectTo: EMAIL_REDIRECT_URL } : undefined
    })
  )
  if (error) {
    throw friendlyAuthError(error)
  }
  if (isDuplicateSignUpResponse(data.user)) {
    throw new Error('An account with this email already exists. Sign in instead.')
  }
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut()
  if (error) {
    throw new Error(error.message)
  }
}

export async function getSession(): Promise<Session | null> {
  const { data, error } = await supabase.auth.getSession()
  if (error) {
    throw new Error(error.message)
  }
  return data.session
}

export async function getAccessToken(): Promise<string | null> {
  const session = await getSession()
  return session?.access_token ?? null
}

export function onAuthStateChange(
  callback: (event: string, session: Session | null) => void
) {
  return supabase.auth.onAuthStateChange((event, session) => {
    callback(event, session)
  })
}
