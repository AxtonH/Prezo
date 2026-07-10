import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildArtifactSrcDoc } from '../public/poc/gamified/poll-game-gamified-artifact-runtime.js'
import { GOLDEN_INPUT_HTML, GOLDEN_OPTIONS } from './update-bridge-goldens.mjs'

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')

function bridgeBody(srcDoc) {
  const match = /<script>([\s\S]*)<\/script>/.exec(srcDoc)
  assert.ok(match, 'srcDoc contains an injected bridge script')
  return match[1]
}

// The injected bridge is the contract every generated artifact runs against.
// Any emission change must be intentional: regenerate via
// `node tests/update-bridge-goldens.mjs` and review the fixture diff.
for (const kind of ['poll', 'qna']) {
  test(`bridge emission matches golden fixture (${kind})`, () => {
    const golden = readFileSync(join(fixturesDir, `bridge-golden-${kind}.html`), 'utf8')
    const actual = buildArtifactSrcDoc(GOLDEN_INPUT_HTML, {
      ...GOLDEN_OPTIONS,
      activityKind: kind
    })
    assert.equal(actual, golden)
  })
}

test('discussion kind emits the qna bridge (differing only in the kind literal)', () => {
  const qna = buildArtifactSrcDoc(GOLDEN_INPUT_HTML, { ...GOLDEN_OPTIONS, activityKind: 'qna' })
  const discussion = buildArtifactSrcDoc(GOLDEN_INPUT_HTML, {
    ...GOLDEN_OPTIONS,
    activityKind: 'discussion'
  })
  // state.kind reports the real kind, so the two emissions differ in exactly
  // one literal; everything else (channel, hooks, normalizer) is shared.
  assert.notEqual(discussion, qna)
  assert.equal(
    discussion.replaceAll("var ACTIVITY_KIND = 'discussion'", "var ACTIVITY_KIND = 'qna'"),
    qna
  )
})

test('unknown kinds fall back to the poll bridge', () => {
  const poll = buildArtifactSrcDoc(GOLDEN_INPUT_HTML, { ...GOLDEN_OPTIONS })
  const garbage = buildArtifactSrcDoc(GOLDEN_INPUT_HTML, {
    ...GOLDEN_OPTIONS,
    activityKind: 'garbage'
  })
  assert.equal(garbage, poll)
})

test('every kind emits a parseable bridge with kind-correct identifiers', () => {
  const expectations = {
    poll: {
      message: "var MESSAGE_TYPE = 'prezo-poll-state'",
      setRenderer: "var SET_RENDERER_NAME = 'prezoSetPollRenderer'",
      hook: 'prezoRenderPoll',
      absent: 'prezoRenderQna'
    },
    qna: {
      message: "var MESSAGE_TYPE = 'prezo-qna-state'",
      setRenderer: "var SET_RENDERER_NAME = 'prezoSetQnaRenderer'",
      hook: 'prezoRenderQna',
      absent: 'prezoRenderPoll'
    }
  }
  for (const [kind, expected] of Object.entries(expectations)) {
    const body = bridgeBody(
      buildArtifactSrcDoc(GOLDEN_INPUT_HTML, { ...GOLDEN_OPTIONS, activityKind: kind })
    )
    assert.doesNotThrow(() => new Function(body), `${kind} bridge parses`)
    assert.ok(body.includes(expected.message), `${kind} message type`)
    assert.ok(body.includes(expected.setRenderer), `${kind} renderer setter`)
    assert.ok(body.includes(expected.hook), `${kind} render hook`)
    assert.ok(!body.includes(expected.absent), `${kind} excludes the other kind's hook`)
  }
})

test('qna bridge normalizes and dispatches a discussion payload', () => {
  const body = bridgeBody(
    buildArtifactSrcDoc(GOLDEN_INPUT_HTML, { ...GOLDEN_OPTIONS, activityKind: 'discussion' })
  )

  // Minimal browser stubs: enough for the bridge to boot headless.
  const listeners = {}
  const noopEl = {
    style: {},
    appendChild() {},
    setAttribute() {},
    getAttribute() {
      return null
    },
    querySelectorAll() {
      return []
    },
    querySelector() {
      return null
    },
    children: [],
    textContent: '',
    getBoundingClientRect() {
      return { width: 0, height: 0 }
    }
  }
  const windowStub = {
    addEventListener(type, fn) {
      ;(listeners[type] ||= []).push(fn)
    },
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    parent: { postMessage() {} },
    innerWidth: 1920,
    innerHeight: 1080,
    getComputedStyle: () => ({
      backgroundColor: 'rgba(0,0,0,0)',
      display: 'block',
      visibility: 'visible',
      opacity: '1'
    }),
    requestAnimationFrame: () => 0
  }
  windowStub.window = windowStub
  const documentStub = {
    body: noopEl,
    documentElement: noopEl,
    readyState: 'complete',
    addEventListener() {},
    dispatchEvent() {},
    createElement: () => ({ ...noopEl }),
    querySelectorAll() {
      return []
    },
    querySelector() {
      return null
    },
    getElementById() {
      return null
    }
  }

  new Function(
    'window',
    'document',
    'CustomEvent',
    'MutationObserver',
    'ResizeObserver',
    'requestAnimationFrame',
    'cancelAnimationFrame',
    'getComputedStyle',
    body
  )(
    windowStub,
    documentStub,
    class {
      constructor(name, opts) {
        this.name = name
        this.detail = opts?.detail
      }
    },
    class {
      observe() {}
    },
    class {
      observe() {}
    },
    () => 0,
    () => {},
    windowStub.getComputedStyle
  )

  assert.equal(typeof windowStub.prezoSetQnaRenderer, 'function')
  assert.equal(typeof windowStub.prezoGetQnaState, 'function')

  let rendered = null
  windowStub.prezoSetQnaRenderer((state) => {
    rendered = state
  })

  const payload = {
    kind: 'discussion',
    qna: {
      id: 'p1',
      title: 'What should we improve?',
      status: 'open',
      questions: [
        { id: 'q2', text: 'More coffee', votes: 5 },
        { id: 'q1', text: 'Better chairs', votes: 2 }
      ]
    },
    meta: { sessionId: 's1' }
  }
  for (const fn of listeners.message || []) {
    fn({ data: { type: 'prezo-qna-state', payload } })
  }

  assert.equal(rendered.kind, 'discussion')
  assert.equal(rendered.qna.title, 'What should we improve?')
  assert.equal(rendered.title, 'What should we improve?')
  assert.deepEqual(
    rendered.qna.questions.map((q) => [q.id, q.text, q.votes, q.percentage, q.rank]),
    [
      ['q2', 'More coffee', 5, 71, 1],
      ['q1', 'Better chairs', 2, 29, 2]
    ]
  )
  assert.equal(rendered.totalQuestions, 2)
  assert.equal(rendered.totalVotes, 7)
  assert.equal(windowStub.__PREZO_QNA_STATE.kind, 'discussion')
  assert.equal(windowStub.prezoGetQnaState().qna.questions.length, 2)
})
