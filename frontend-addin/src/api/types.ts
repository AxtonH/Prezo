export type SessionStatus = 'active' | 'ended'
export type QuestionStatus = 'pending' | 'approved' | 'hidden'
export type PollStatus = 'closed' | 'open'
export type QnaMode = 'audience' | 'prompt'
export type QnaPromptStatus = 'closed' | 'open'

export interface Session {
  id: string
  code: string
  title: string | null
  status: SessionStatus
  allow_host_join: boolean
  is_original_host?: boolean | null
  qna_open: boolean
  qna_mode: QnaMode
  qna_prompt?: string | null
  created_at: string
  join_url?: string | null
}

export interface Question {
  id: string
  session_id: string
  prompt_id?: string | null
  text: string
  status: QuestionStatus
  votes: number
  created_at: string
}

export interface PollOption {
  id: string
  label: string
  votes: number
}

export interface Poll {
  id: string
  session_id: string
  question: string
  options: PollOption[]
  status: PollStatus
  allow_multiple: boolean
  created_at: string
}

export interface QnaPrompt {
  id: string
  session_id: string
  prompt: string
  status: QnaPromptStatus
  created_at: string
}

export interface SessionSnapshot {
  session: Session
  questions: Question[]
  polls: Poll[]
  prompts: QnaPrompt[]
}

export interface SessionEvent {
  type: string
  payload: Record<string, unknown>
  ts: string
}
