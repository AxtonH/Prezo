/**
 * Pure data-signature helpers for the widget update pipeline.
 *
 * A signature is a deterministic JSON string of exactly the session data a
 * widget renders from. Two layers use them to skip work:
 *  - App.tsx skips scheduling an update pass when the relevant data
 *    projection didn't change (e.g. the 10s snapshot poller returning the
 *    same content in a fresh array).
 *  - widgetShapes.ts keeps a per-slide "last applied" signature so an update
 *    pass can skip widgets whose bound data didn't change — one vote then
 *    touches one widget, not every widget in the deck.
 *
 * Types are structural (no imports from api/types) so the module stays
 * dependency-free and runnable under Node's TS type-stripping in tests.
 * Projections must be built from arrays, never objects — key order would
 * otherwise make signatures unstable.
 */

export type PollOptionLike = {
  id: string
  label: string
  votes: number
}

export type PollLike = {
  id: string
  question: string
  status: string
  created_at: string
  options: PollOptionLike[]
}

export type QuestionLike = {
  id: string
  text: string
  status: string
  votes: number
  prompt_id?: string | null
}

export type PromptLike = {
  id: string
  prompt: string
  status: string
  created_at: string
}

/** Everything a poll widget renders from one poll (labels, votes, percents,
 * open/closed title prefix). `created_at` is deliberately absent — it only
 * matters for *picking* a poll, and the picked poll's id is in the projection. */
export const pollProjection = (poll: PollLike): unknown[] => [
  poll.id,
  poll.status,
  poll.question,
  poll.options.map((option) => [option.id, option.label, option.votes])
]

export const questionProjection = (question: QuestionLike): unknown[] => [
  question.id,
  question.text,
  question.status,
  question.votes,
  question.prompt_id ?? null
]

export const promptProjection = (prompt: PromptLike): unknown[] => [
  prompt.id,
  prompt.prompt,
  prompt.status,
  prompt.created_at
]

/** App-level gate for poll widget passes. Includes `created_at` because
 * unbound widgets pick a poll by status + recency, so ordering inputs are
 * render-relevant across the whole list. */
export const pollWidgetsDataSignature = (
  sessionId: string | null | undefined,
  code: string | null | undefined,
  polls: PollLike[]
): string =>
  JSON.stringify([
    sessionId ?? null,
    code ?? null,
    polls.map((poll) => [...pollProjection(poll), poll.created_at])
  ])

/** App-level gate for Q&A + discussion widget passes (they render from the
 * same questions/prompts data). */
export const qnaWidgetsDataSignature = (
  sessionId: string | null | undefined,
  code: string | null | undefined,
  questions: QuestionLike[],
  prompts: PromptLike[]
): string =>
  JSON.stringify([
    sessionId ?? null,
    code ?? null,
    questions.map(questionProjection),
    prompts.map(promptProjection)
  ])
