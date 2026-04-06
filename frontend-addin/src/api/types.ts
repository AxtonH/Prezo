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

export interface HostDashboardStats {
  active_sessions: number
  active_activities: number
  unique_participants: number
}

/** Per-session engagement from GET /sessions/{id}/session-stats */
export interface SessionSessionStats {
  unique_participants: number
  total_interactions: number
}

export interface SessionActivity {
  type: string
  payload: Record<string, unknown>
  ts: string
}

/** Saved brand profile from GET/PUT/DELETE `/library/poll-game/brand-profiles`. */
export interface BrandProfile {
  id: string
  name: string
  source_type: string
  source_filename: string
  guidelines: Record<string, unknown>
  raw_summary: string
  created_at: string
  updated_at: string
}

/** Body for PUT `/library/poll-game/brand-profiles/{name}`. */
export interface BrandProfileUpsert {
  source_type?: string
  source_filename?: string | null
  guidelines: Record<string, unknown>
  raw_summary?: string | null
}

/** Response from POST `/library/poll-game/brand-profiles/extract`. */
export interface BrandExtractResult {
  source_type: string
  source_filename: string
  guidelines: Record<string, unknown>
  raw_summary: string
  extraction_purpose?: string
  extracted_images?: unknown[]
}

/** Stored under `guidelines.ui_identity` — editable in the Brand identity detail page. */
export interface BrandColorRole {
  role: string
  usage: string
  hex: string
  hierarchy_rank: number
  surface: string
}

/** One of heading_1 | heading_2 | body — Google list pick or uploaded file. */
export interface BrandTypographySlot {
  family: string
  source?: 'google' | 'custom'
  /** Absolute URL to uploaded font (woff2/woff/ttf/otf) when source is custom. */
  custom_url?: string | null
}

/** Four 0–100 axes: 0 = left pole, 100 = right pole, 50 = balanced. From pass-3 extraction. */
export interface BrandToneCalibration {
  serious_playful: number
  formal_casual: number
  respectful_irreverent: number
  matter_of_fact_enthusiastic: number
}

export interface BrandUiIdentity {
  brand_name: string
  color_roles: BrandColorRole[]
  typography: {
    heading_1: BrandTypographySlot
    heading_2: BrandTypographySlot
    body: BrandTypographySlot
  }
  tone_calibration: BrandToneCalibration
}
