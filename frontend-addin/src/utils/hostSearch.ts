import type { Poll, QnaPrompt, Question, Session, SessionSnapshot } from '../api/types'

export function matchesSessionTitleOrCode(session: Session, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const title = (session.title ?? '').toLowerCase()
  const code = (session.code ?? '').toLowerCase()
  return title.includes(q) || code.includes(q)
}

export type HostSearchActivityHit =
  | { kind: 'poll'; session: Session; poll: Poll }
  | { kind: 'question'; session: Session; question: Question }
  | { kind: 'prompt'; session: Session; prompt: QnaPrompt }

const MAX_ACTIVITY_HITS = 40

/** Search poll questions, audience questions, and Q&A prompts across cached snapshots. */
export function buildActivityHits(
  sessions: Session[],
  query: string,
  getSnapshot: (sessionId: string) => SessionSnapshot | undefined
): HostSearchActivityHit[] {
  const q = query.trim().toLowerCase()
  if (q.length < 2) {
    return []
  }
  const hits: HostSearchActivityHit[] = []
  for (const session of sessions) {
    const snap = getSnapshot(session.id)
    if (!snap) continue
    for (const poll of snap.polls) {
      if (poll.question.toLowerCase().includes(q)) {
        hits.push({ kind: 'poll', session, poll })
        if (hits.length >= MAX_ACTIVITY_HITS) return hits
      }
    }
    for (const question of snap.questions) {
      if (question.text.toLowerCase().includes(q)) {
        hits.push({ kind: 'question', session, question })
        if (hits.length >= MAX_ACTIVITY_HITS) return hits
      }
    }
    for (const prompt of snap.prompts ?? []) {
      if (prompt.prompt.toLowerCase().includes(q)) {
        hits.push({ kind: 'prompt', session, prompt })
        if (hits.length >= MAX_ACTIVITY_HITS) return hits
      }
    }
  }
  return hits
}
