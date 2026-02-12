const STORAGE_KEY = 'prezo_auth'

interface AuthUser {
  email: string
}

const VALID_CREDENTIALS = { email: 'Admin', password: '1234' }

export function login(email: string, password: string): AuthUser | null {
  if (email === VALID_CREDENTIALS.email && password === VALID_CREDENTIALS.password) {
    const user: AuthUser = { email }
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(user))
    return user
  }
  return null
}

export function logout(): void {
  sessionStorage.removeItem(STORAGE_KEY)
}

export function getUser(): AuthUser | null {
  const raw = sessionStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as AuthUser
  } catch {
    return null
  }
}

export function isAuthenticated(): boolean {
  return getUser() !== null
}
