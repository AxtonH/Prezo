export type SessionStatus = 'active' | 'ended'
export type QuestionStatus = 'pending' | 'approved' | 'hidden'
export type PollStatus = 'closed' | 'open'

export interface Session {
  id: string
  code: string
  title: string | null
  status: SessionStatus
  qna_open: boolean
  created_at: string
  join_url?: string | null
}

export interface Question {
  id: string
  session_id: string
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

export interface SessionSnapshot {
  session: Session
  questions: Question[]
  polls: Poll[]
}

export interface SessionEvent {
  type: string
  payload: Record<string, unknown>
  ts: string
}
