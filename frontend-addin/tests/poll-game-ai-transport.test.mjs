import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createAiTransport,
  extractGeminiText,
  parseAiJsonResponse
} from '../public/poc/gamified/poll-game-gamified-ai-transport.js'

// fetchWithTimeout uses window timers and global fetch; stub both. The build
// route's package segmentation also parses HTML with DOMParser — a minimal
// stand-in covers the single-file path (no styles.css/renderer.js links).
function installNetworkStub(responder) {
  const calls = []
  globalThis.window = { setTimeout: () => 0, clearTimeout: () => {} }
  const makeStubEl = () => {
    const attrs = {}
    return {
      setAttribute(key, value) {
        attrs[key] = value
      },
      getAttribute(key) {
        return attrs[key] ?? null
      },
      appendChild() {},
      insertBefore() {},
      replaceWith() {},
      remove() {},
      textContent: '',
      firstChild: null
    }
  }
  globalThis.DOMParser = class {
    parseFromString(source) {
      return {
        documentElement: {
          ...makeStubEl(),
          outerHTML: source.replace(/^<!doctype html>\s*/i, '')
        },
        head: makeStubEl(),
        body: makeStubEl(),
        querySelectorAll: () => [],
        createElement: () => makeStubEl()
      }
    }
  }
  globalThis.fetch = async (url, options) => {
    const body = options?.body ? JSON.parse(options.body) : null
    calls.push({ url, headers: options?.headers ?? {}, body })
    const result = responder(url, body)
    return {
      ok: result.ok ?? true,
      status: result.status ?? 200,
      json: async () => result.payload
    }
  }
  return {
    calls,
    restore() {
      delete globalThis.fetch
      delete globalThis.window
      delete globalThis.DOMParser
    }
  }
}

function makeTransport({ activityKind = 'poll', token = 'tok-1', brandNames = ['Prezlab Core'] } = {}) {
  const state = {
    apiBase: 'https://api.example',
    activityKind,
    ai: { model: '' },
    currentPoll: { question: 'Best color?', options: [{ label: 'Red' }, { label: '' }] },
    currentQnaView: { title: 'Ask anything', status: 'open', questions: [{}, {}] },
    artifact: {
      lastAnswers: { brandProfileName: 'Prezlab Core' },
      conversationAnswers: { brandProfileName: 'Prezlab Core' }
    }
  }
  const transport = createAiTransport({
    state,
    getLibraryAccessToken: () => token,
    collectArtifactBrandProfileNames: () => brandNames
  })
  return { state, transport }
}

test('build request shapes body, auth, and caps attachments', async () => {
  const stub = installNetworkStub(() => ({
    payload: { html: '<html><body>x</body></html>', assistantMessage: 'ok', model: 'm' }
  }))
  try {
    const { transport } = makeTransport()
    const result = await transport.requestAiArtifactBuild(
      'prompt',
      { artifact: {} },
      {
        referenceImages: new Array(9).fill({ media_type: 'image/png', data: 'aGk=' }),
        attachedImageUrls: ['https://img.example/a.png', 'ftp://nope', 'https://img.example/b.png']
      }
    )
    const call = stub.calls[0]
    assert.equal(call.url, 'https://api.example/ai/poll-game-artifact-build')
    assert.equal(call.headers.Authorization, 'Bearer tok-1')
    assert.equal(call.body.brand_profile_name, 'Prezlab Core')
    assert.equal(call.body.reference_images.length, 6, 'reference images capped')
    assert.deepEqual(call.body.context.artifact.attachedImageUrls, [
      'https://img.example/a.png',
      'https://img.example/b.png'
    ])
    assert.ok(result.html.includes('<body>x</body>'))
    assert.equal(result.assistantMessage, 'ok')
    assert.ok(result.package, 'package resolved from html')
  } finally {
    stub.restore()
  }
})

test('build surfaces backend error detail', async () => {
  const stub = installNetworkStub(() => ({
    ok: false,
    status: 502,
    payload: { detail: 'Artifact request failed validation: nope' }
  }))
  try {
    const { transport } = makeTransport()
    await assert.rejects(
      () => transport.requestAiArtifactBuild('p', {}),
      /Artifact request failed validation: nope/
    )
  } finally {
    stub.restore()
  }
})

test('intake sends poll context for polls and qna context for the new kinds', async () => {
  const stub = installNetworkStub(() => ({
    payload: { action: 'ask', question: 'Which vibe?', topic: 'style' }
  }))
  try {
    const poll = makeTransport()
    const reply = await poll.transport.requestAiArtifactIntake(
      [{ role: 'user', text: 'retro' }],
      {}
    )
    assert.deepEqual(stub.calls[0].body.context, {
      poll: { question: 'Best color?', options: ['Red'] }
    })
    assert.deepEqual(stub.calls[0].body.brand_profile_names, ['Prezlab Core'])
    assert.equal(stub.calls[0].body.selected_brand_profile_name, 'Prezlab Core')
    assert.deepEqual(reply, { action: 'ask', question: 'Which vibe?', topic: 'style', brief: null })

    const qna = makeTransport({ activityKind: 'discussion' })
    await qna.transport.requestAiArtifactIntake([{ role: 'user', text: 'wall' }], { forceReady: true })
    const qnaCall = stub.calls[1]
    assert.equal(qnaCall.body.force_ready, true)
    assert.deepEqual(qnaCall.body.context, {
      activityKind: 'discussion',
      qna: { title: 'Ask anything', status: 'open', approvedQuestionCount: 2 }
    })
  } finally {
    stub.restore()
  }
})

test('answer route returns text and rejects empties', async () => {
  const stub = installNetworkStub((url, body) => ({
    payload: { text: body.prompt === 'empty' ? '' : 'It animates votes.' }
  }))
  try {
    const { transport } = makeTransport()
    const answer = await transport.requestAiArtifactAnswer('how?', {})
    assert.equal(answer.text, 'It animates votes.')
    await assert.rejects(() => transport.requestAiArtifactAnswer('empty', {}), /empty answer/)
  } finally {
    stub.restore()
  }
})

test('edit plan parses direct, fenced, and garbage responses', async () => {
  const stub = installNetworkStub((url, body) => {
    if (body.prompt === 'fenced') {
      return { payload: { text: '```json\n{"assistantMessage":"hi","actions":[{"type":"reset_theme"}]}\n```' } }
    }
    return { payload: { text: '{"assistantMessage":"ok","actions":[]}' } }
  })
  try {
    const { transport } = makeTransport()
    const direct = await transport.requestAiEditPlan('p', {})
    assert.equal(direct.assistantMessage, 'ok')
    const fenced = await transport.requestAiEditPlan('fenced', {})
    assert.deepEqual(fenced.actions, [{ type: 'reset_theme' }])
    assert.equal(stub.calls[0].headers.Authorization, undefined, 'edit plan is unauthenticated')
  } finally {
    stub.restore()
  }
})

test('parseAiJsonResponse degrades gracefully on non-JSON', () => {
  const parsed = parseAiJsonResponse('just prose with no braces')
  assert.equal(parsed.actions.length, 0)
  assert.ok(parsed.assistantMessage.includes('not valid JSON'))
  const embedded = parseAiJsonResponse('noise {"actions":[{"type":"set_text"}]} trailing')
  assert.equal(embedded.actions.length, 1)
})

test('extractGeminiText joins candidate parts', () => {
  assert.equal(
    extractGeminiText({ candidates: [{ content: { parts: [{ text: 'a' }, { text: 'b' }] } }] }),
    'a\nb'
  )
  assert.equal(extractGeminiText({}), '')
})

test('missing token sends no Authorization header', async () => {
  const stub = installNetworkStub(() => ({ payload: { text: 'x' } }))
  try {
    const { transport } = makeTransport({ token: '' })
    await transport.requestAiArtifactAnswer('q', {})
    assert.equal(stub.calls[0].headers.Authorization, undefined)
  } finally {
    stub.restore()
  }
})
