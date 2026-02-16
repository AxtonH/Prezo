import { getAccessToken } from '../auth/auth'
import type {
  Poll,
  Question,
  QnaMode,
  Session,
  SessionSnapshot,
  SessionStatus
} from './types'

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.toString() ?? 'http://localhost:8000'

const jsonHeaders = {
  'Content-Type': 'application/json'
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  requireAuth = false
): Promise<T> {
  const headers = new Headers(options.headers)
  headers.set('Content-Type', jsonHeaders['Content-Type'])

  if (requireAuth) {
    const token = await getAccessToken()
    if (token) {
      headers.set('Authorization', `Bearer ${token}`)
    }
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers
  })

  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    const detail = (body as { detail?: string }).detail
    throw new Error(detail ?? `Request failed (${response.status})`)
  }

  return (await response.json()) as T
}

export const api = {
  createSession: (title?: string) =>
    request<Session>('/sessions', {
      method: 'POST',
      body: JSON.stringify({ title: title ?? null })
    }, true),
  listSessions: (status?: SessionStatus, limit = 10) => {
    const params = new URLSearchParams()
    if (status) {
      params.set('status', status)
    }
    if (limit) {
      params.set('limit', limit.toString())
    }
    const query = params.toString()
    return request<Session[]>(`/sessions${query ? `?${query}` : ''}`, {}, true)
  },
  getSessionByCode: (code: string) =>
    request<Session>(`/sessions/code/${encodeURIComponent(code)}`),
  getSnapshot: (sessionId: string) =>
    request<SessionSnapshot>(`/sessions/${sessionId}/snapshot`),
  openQna: (sessionId: string) =>
    request<Session>(`/sessions/${sessionId}/qna/open`, { method: 'POST' }, true),
  closeQna: (sessionId: string) =>
    request<Session>(`/sessions/${sessionId}/qna/close`, { method: 'POST' }, true),
  updateQnaConfig: (sessionId: string, mode: QnaMode, prompt?: string | null) =>
    request<Session>(`/sessions/${sessionId}/qna/config`, {
      method: 'POST',
      body: JSON.stringify({ mode, prompt: prompt ?? null })
    }, true),
  submitQuestion: (sessionId: string, text: string, clientId?: string) =>
    request<Question>(`/sessions/${sessionId}/questions`, {
      method: 'POST',
      body: JSON.stringify({ text, client_id: clientId ?? null })
    }),
  approveQuestion: (sessionId: string, questionId: string) =>
    request<Question>(`/sessions/${sessionId}/questions/${questionId}/approve`, {
      method: 'POST'
    }, true),
  hideQuestion: (sessionId: string, questionId: string) =>
    request<Question>(`/sessions/${sessionId}/questions/${questionId}/hide`, {
      method: 'POST'
    }, true),
  voteQuestion: (sessionId: string, questionId: string, clientId?: string) =>
    request<Question>(`/sessions/${sessionId}/questions/${questionId}/vote`, {
      method: 'POST',
      body: JSON.stringify({ client_id: clientId ?? null })
    }),
  createPoll: (
    sessionId: string,
    question: string,
    options: string[],
    allowMultiple = false
  ) =>
    request<Poll>(`/sessions/${sessionId}/polls`, {
      method: 'POST',
      body: JSON.stringify({ question, options, allow_multiple: allowMultiple })
    }, true),
  openPoll: (sessionId: string, pollId: string) =>
    request<Poll>(`/sessions/${sessionId}/polls/${pollId}/open`, {
      method: 'POST'
    }, true),
  closePoll: (sessionId: string, pollId: string) =>
    request<Poll>(`/sessions/${sessionId}/polls/${pollId}/close`, {
      method: 'POST'
    }, true),
  votePoll: (sessionId: string, pollId: string, optionId: string, clientId?: string) =>
    request<Poll>(`/sessions/${sessionId}/polls/${pollId}/vote`, {
      method: 'POST',
      body: JSON.stringify({ option_id: optionId, client_id: clientId ?? null })
    })
}

export { API_BASE_URL }
