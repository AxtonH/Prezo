// k6 load test for Prezo poll voting.
//
// This entire `loadtest/` folder is a temporary, throwaway artifact.
// Delete the folder when load testing is finished — nothing else in
// the repo references it.
//
// Run:
//   k6 run loadtest/vote-load-50vu.js -e JOIN_CODE=ZYGSDY
//
// Optional overrides:
//   -e API_BASE=https://prezo-backend.up.railway.app  (default)
//   -e VUS=50                                          (default)
//   -e DURATION=2m                                     (default)

import http from 'k6/http'
import ws from 'k6/ws'
import { check, sleep } from 'k6'
import { Trend, Counter } from 'k6/metrics'
import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js'

const API_BASE = __ENV.API_BASE || 'https://prezo-backend.up.railway.app'
const JOIN_CODE = (__ENV.JOIN_CODE || '').toUpperCase()
const VUS = parseInt(__ENV.VUS || '50', 10)
const DURATION = __ENV.DURATION || '2m'

if (!JOIN_CODE) {
  throw new Error('JOIN_CODE env var is required (e.g. -e JOIN_CODE=ZYGSDY)')
}

const voteLatency = new Trend('prezo_vote_latency_ms', true)
const broadcastsReceived = new Counter('prezo_ws_broadcasts_received')

export const options = {
  scenarios: {
    voters: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: VUS },
        { duration: DURATION, target: VUS },
        { duration: '15s', target: 0 },
      ],
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    'http_req_failed': ['rate<0.02'],
    'prezo_vote_latency_ms': ['p(95)<800'],
  },
}

// Each VU resolves the session + poll once, then loops voting.
export function setup() {
  const res = http.get(`${API_BASE}/sessions/code/${JOIN_CODE}`)
  if (res.status !== 200) {
    throw new Error(`session lookup failed: ${res.status} ${res.body}`)
  }
  const session = res.json()
  const snap = http.get(`${API_BASE}/sessions/${session.id}/snapshot`)
  if (snap.status !== 200) {
    throw new Error(`snapshot fetch failed: ${snap.status} ${snap.body}`)
  }
  const polls = snap.json('polls')
  const openPoll = polls.find((p) => p.status === 'open') || polls[0]
  if (!openPoll) {
    throw new Error('no poll found in session — open one in the addin first')
  }
  return {
    sessionId: session.id,
    pollId: openPoll.id,
    optionIds: openPoll.options.map((o) => o.id),
  }
}

export default function (data) {
  const clientId = uuidv4()
  const wsUrl = `${API_BASE.replace(/^http/, 'ws')}/ws/sessions/${data.sessionId}`

  // Open a WS connection to receive broadcasts (mirrors real audience clients).
  const wsRes = ws.connect(wsUrl, null, function (socket) {
    socket.on('message', () => broadcastsReceived.add(1))
    socket.setTimeout(() => socket.close(), 10000)
  })
  check(wsRes, { 'ws connected (101)': (r) => r && r.status === 101 })

  // Cast one vote. Pick a random option.
  const optionId = data.optionIds[Math.floor(Math.random() * data.optionIds.length)]
  const url = `${API_BASE}/sessions/${data.sessionId}/polls/${data.pollId}/vote`
  const payload = JSON.stringify({ option_id: optionId, client_id: clientId })
  const start = Date.now()
  const res = http.post(url, payload, {
    headers: { 'Content-Type': 'application/json' },
  })
  voteLatency.add(Date.now() - start)
  check(res, {
    'vote 200': (r) => r.status === 200,
  })

  sleep(1 + Math.random() * 2)
}
