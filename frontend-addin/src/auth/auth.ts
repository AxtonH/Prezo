import type { Session, User } from '@supabase/supabase-js'

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
    throw new Error(error.message)
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
    throw new Error(error.message)
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
