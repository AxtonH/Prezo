import type { Poll, Question, Session, SessionSnapshot } from './types'

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.toString() ?? 'http://localhost:8000'

const jsonHeaders = {
  'Content-Type': 'application/json'
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      ...jsonHeaders,
      ...(options.headers ?? {})
    }
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
    }),
  getSessionByCode: (code: string) =>
    request<Session>(`/sessions/code/${encodeURIComponent(code)}`),
  getSnapshot: (sessionId: string) =>
    request<SessionSnapshot>(`/sessions/${sessionId}/snapshot`),
  submitQuestion: (
    sessionId: string,
    text: string,
    clientId?: string,
    promptId?: string | null
  ) =>
    request<Question>(`/sessions/${sessionId}/questions`, {
      method: 'POST',
      body: JSON.stringify({
        text,
        client_id: clientId ?? null,
        prompt_id: promptId ?? null
      })
    }),
  approveQuestion: (sessionId: string, questionId: string) =>
    request<Question>(`/sessions/${sessionId}/questions/${questionId}/approve`, {
      method: 'POST'
    }),
  hideQuestion: (sessionId: string, questionId: string) =>
    request<Question>(`/sessions/${sessionId}/questions/${questionId}/hide`, {
      method: 'POST'
    }),
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
    }),
  openPoll: (sessionId: string, pollId: string) =>
    request<Poll>(`/sessions/${sessionId}/polls/${pollId}/open`, {
      method: 'POST'
    }),
  closePoll: (sessionId: string, pollId: string) =>
    request<Poll>(`/sessions/${sessionId}/polls/${pollId}/close`, {
      method: 'POST'
    }),
  votePoll: (sessionId: string, pollId: string, optionId: string, clientId?: string) =>
    request<Poll>(`/sessions/${sessionId}/polls/${pollId}/vote`, {
      method: 'POST',
      body: JSON.stringify({ option_id: optionId, client_id: clientId ?? null })
    })
}

export { API_BASE_URL }
