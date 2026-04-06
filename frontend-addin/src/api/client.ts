import { getAccessToken } from '../auth/auth'
import type {
  BrandExtractResult,
  BrandProfile,
  BrandProfileUpsert,
  HostDashboardStats,
  SessionSessionStats,
  Poll,
  Question,
  QnaMode,
  QnaPrompt,
  Session,
  SessionSnapshot,
  SessionStatus
} from './types'

export const API_BASE_URL =
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

  if (response.status === 204) {
    return undefined as T
  }

  const text = await response.text()
  if (!text) {
    return undefined as T
  }

  return JSON.parse(text) as T
}

export async function listBrandProfiles(): Promise<BrandProfile[]> {
  return request<BrandProfile[]>('/library/poll-game/brand-profiles', {}, true)
}

export async function getBrandProfile(name: string): Promise<BrandProfile> {
  const path = `/library/poll-game/brand-profiles/${encodeURIComponent(name)}`
  return request<BrandProfile>(path, {}, true)
}

export async function saveBrandProfile(name: string, body: BrandProfileUpsert): Promise<BrandProfile> {
  const path = `/library/poll-game/brand-profiles/${encodeURIComponent(name)}`
  return request<BrandProfile>(path, {
    method: 'PUT',
    body: JSON.stringify({
      source_type: body.source_type ?? '',
      source_filename: body.source_filename ?? '',
      guidelines: body.guidelines,
      raw_summary: body.raw_summary ?? ''
    })
  }, true)
}

export async function deleteBrandProfile(name: string): Promise<BrandProfile> {
  const path = `/library/poll-game/brand-profiles/${encodeURIComponent(name)}`
  return request<BrandProfile>(path, { method: 'DELETE' }, true)
}

export async function uploadBrandFont(file: File): Promise<{
  font_id: string
  /** Persist in `guidelines.ui_identity.typography.*.custom_url` — Supabase public URL or API URL (local). */
  custom_url: string
  storage: 'supabase' | 'local'
  path: string
  url: string
}> {
  const token = await getAccessToken()
  if (!token) {
    throw new Error('Sign in required')
  }
  const form = new FormData()
  form.append('file', file)

  const response = await fetch(`${API_BASE_URL}/library/poll-game/brand-fonts/upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`
    },
    body: form
  })

  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    const detail = (body as { detail?: string }).detail
    throw new Error(detail ?? `Upload failed (${response.status})`)
  }

  return JSON.parse(await response.text()) as {
    font_id: string
    custom_url: string
    storage: 'supabase' | 'local'
    path: string
    url: string
  }
}

export async function extractBrandProfile(args: {
  file?: File
  url?: string
  purpose?: 'full' | 'artifact'
}): Promise<BrandExtractResult> {
  const token = await getAccessToken()
  if (!token) {
    throw new Error('Sign in required')
  }
  const form = new FormData()
  if (args.file) {
    form.append('file', args.file)
  }
  if (args.url) {
    form.append('url', args.url)
  }
  form.append('purpose', args.purpose ?? 'full')

  const response = await fetch(`${API_BASE_URL}/library/poll-game/brand-profiles/extract`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`
    },
    body: form
  })

  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    const detail = (body as { detail?: string }).detail
    throw new Error(detail ?? `Extract failed (${response.status})`)
  }

  const text = await response.text()
  if (!text) {
    throw new Error('Empty response from extract')
  }
  return JSON.parse(text) as BrandExtractResult
}

export const api = {
  createLibrarySyncToken: () =>
    request<{ token: string; expires_at: string }>('/library/poll-game/sync-token', {
      method: 'POST'
    }, true),
  createSession: (title?: string) =>
    request<Session>('/sessions', {
      method: 'POST',
      body: JSON.stringify({ title: title ?? null })
    }, true),
  joinSessionAsHost: (code: string) =>
    request<Session>('/sessions/host-join', {
      method: 'POST',
      body: JSON.stringify({ code })
    }, true),
  updateHostAccess: (sessionId: string, allowHostJoin: boolean) =>
    request<Session>(`/sessions/${sessionId}/host-access`, {
      method: 'POST',
      body: JSON.stringify({ allow_host_join: allowHostJoin })
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
  getHostDashboardStats: () =>
    request<HostDashboardStats>('/sessions/dashboard-stats', {}, true),
  getSessionSessionStats: (sessionId: string) =>
    request<SessionSessionStats>(`/sessions/${sessionId}/session-stats`, {}, true),
  deleteSession: (sessionId: string) =>
    request<Session>(`/sessions/${sessionId}`, { method: 'DELETE' }, true),
  getSessionByCode: (code: string) =>
    request<Session>(`/sessions/code/${encodeURIComponent(code)}`),
  /** Sends auth when signed in so snapshot.session includes is_original_host for host UI. */
  getSnapshot: (sessionId: string) =>
    request<SessionSnapshot>(`/sessions/${sessionId}/snapshot`, {}, true),
  openQna: (sessionId: string) =>
    request<Session>(`/sessions/${sessionId}/qna/open`, { method: 'POST' }, true),
  closeQna: (sessionId: string) =>
    request<Session>(`/sessions/${sessionId}/qna/close`, { method: 'POST' }, true),
  deleteAudienceQuestions: (sessionId: string) =>
    request<{ question_ids: string[] }>(
      `/sessions/${sessionId}/qna/audience-questions`,
      { method: 'DELETE' },
      true
    ),
  updateQnaConfig: (sessionId: string, mode: QnaMode, prompt?: string | null) =>
    request<Session>(`/sessions/${sessionId}/qna/config`, {
      method: 'POST',
      body: JSON.stringify({ mode, prompt: prompt ?? null })
    }, true),
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
  createQnaPrompt: (sessionId: string, prompt: string) =>
    request<QnaPrompt>(`/sessions/${sessionId}/qna-prompts`, {
      method: 'POST',
      body: JSON.stringify({ prompt })
    }, true),
  openQnaPrompt: (sessionId: string, promptId: string) =>
    request<QnaPrompt>(`/sessions/${sessionId}/qna-prompts/${promptId}/open`, {
      method: 'POST'
    }, true),
  closeQnaPrompt: (sessionId: string, promptId: string) =>
    request<QnaPrompt>(`/sessions/${sessionId}/qna-prompts/${promptId}/close`, {
      method: 'POST'
    }, true),
  deleteQnaPrompt: (sessionId: string, promptId: string) =>
    request<void>(`/sessions/${sessionId}/qna-prompts/${promptId}`, { method: 'DELETE' }, true),
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
  deletePoll: (sessionId: string, pollId: string) =>
    request<void>(`/sessions/${sessionId}/polls/${pollId}`, { method: 'DELETE' }, true),
  updatePoll: (
    sessionId: string,
    pollId: string,
    update: { question?: string; options?: Record<string, string> }
  ) =>
    request<Poll>(`/sessions/${sessionId}/polls/${pollId}`, {
      method: 'PATCH',
      body: JSON.stringify(update)
    }, true),
  votePoll: (sessionId: string, pollId: string, optionId: string, clientId?: string) =>
    request<Poll>(`/sessions/${sessionId}/polls/${pollId}/vote`, {
      method: 'POST',
      body: JSON.stringify({ option_id: optionId, client_id: clientId ?? null })
    })
}
