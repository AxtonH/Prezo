const ARTIFACT_POLL_MESSAGE_TYPE = 'prezo-poll-state'
const ARTIFACT_POLL_EVENT_NAME = 'prezo:poll-update'
const ARTIFACT_READY_MESSAGE_TYPE = 'prezo-artifact-ready'
const ARTIFACT_SIZE_MESSAGE_TYPE = 'prezo-artifact-size'

export function normalizeArtifactMarkup(rawValue) {
  const raw = asText(rawValue).trim()
  if (!raw) {
    return ''
  }

  const directJson = tryParseJson(raw)
  if (directJson && typeof directJson === 'object') {
    const htmlFromJson = asText(directJson.html).trim()
    if (htmlFromJson) {
      return unwrapMarkdownFence(htmlFromJson)
    }
  }

  return unwrapMarkdownFence(raw)
}

export function buildArtifactSrcDoc(rawMarkup) {
  const normalizedMarkup = normalizeArtifactMarkup(rawMarkup)
  const fallbackMarkup = '<div class="prezo-artifact-empty">No artifact markup was returned.</div>'
  const content = normalizedMarkup || fallbackMarkup
  const baseDocument = isFullHtmlDocument(content)
    ? content
    : wrapArtifactSnippet(content)
  return injectBridgeScript(baseDocument)
}

function unwrapMarkdownFence(value) {
  const text = asText(value).trim()
  if (!text) {
    return ''
  }
  const fenced = /```(?:[a-z0-9_-]+)?\s*([\s\S]*?)```/i.exec(text)
  if (fenced && fenced[1]) {
    return fenced[1].trim()
  }
  return text
}

function isFullHtmlDocument(value) {
  const text = asText(value)
  if (!text) {
    return false
  }
  return /<!doctype|<html|<head|<body/i.test(text)
}

function wrapArtifactSnippet(snippet) {
  const markup = asText(snippet)
  const hasLikelyTag = /<[a-z][\s\S]*>/i.test(markup)
  const body = hasLikelyTag ? markup : `<pre>${escapeHtml(markup)}</pre>`
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <style>
      :root {
        color-scheme: light only;
      }
      html,
      body {
        margin: 0;
        width: 100%;
        min-height: 100%;
      }
      body {
        overflow-x: hidden;
        overflow-y: auto;
      }
      .prezo-artifact-empty {
        display: grid;
        place-items: center;
        width: 100%;
        height: 100%;
        padding: 16px;
        font: 600 14px/1.4 "Segoe UI", sans-serif;
        color: #1f436f;
        background: linear-gradient(135deg, #f5faff, #e7f2ff);
      }
      pre {
        margin: 0;
        width: 100%;
        height: 100%;
        overflow: auto;
        padding: 16px;
        font: 500 13px/1.45 "Consolas", "Courier New", monospace;
        color: #1f436f;
        background: #f5faff;
      }
    </style>
  </head>
  <body>
    ${body}
  </body>
</html>`
}

function injectBridgeScript(htmlDocument) {
  const source = asText(htmlDocument)
  if (!source) {
    return ''
  }

  const bridgeTag = `<script>${buildBridgeScript()}<\/script>`
  if (/<\/body>/i.test(source)) {
    return source.replace(/<\/body>/i, `${bridgeTag}\n</body>`)
  }
  return `${source}\n${bridgeTag}`
}

function buildBridgeScript() {
  return [
    '(function () {',
    `  var MESSAGE_TYPE = '${ARTIFACT_POLL_MESSAGE_TYPE}'`,
    `  var EVENT_NAME = '${ARTIFACT_POLL_EVENT_NAME}'`,
    `  var READY_MESSAGE_TYPE = '${ARTIFACT_READY_MESSAGE_TYPE}'`,
    `  var SIZE_MESSAGE_TYPE = '${ARTIFACT_SIZE_MESSAGE_TYPE}'`,
    '  var defaultState = {',
    '    poll: { id: "", question: "", status: "", options: [] },',
    '    totalVotes: 0,',
    '    meta: {}',
    '  }',
    '  var currentState = defaultState',
    '  var renderedState = defaultState',
    '  var hasRenderedState = false',
    '  var transitionDurationMs = 320',
    '  var transitionRafId = 0',
    '  var lastReportedHeight = 0',
    '  var sizeRafId = 0',
    '  var prefersReducedMotion = false',
    '  function isObject(value) {',
    '    return value && typeof value === "object"',
    '  }',
    '  function toFiniteNumber(value, fallback) {',
    '    var numeric = Number(value)',
    '    return Number.isFinite(numeric) ? numeric : fallback',
    '  }',
    '  function interpolateNumber(startValue, endValue, progress) {',
    '    return startValue + (endValue - startValue) * progress',
    '  }',
    '  function normalizeOptions(value) {',
    '    if (!Array.isArray(value)) {',
    '      return []',
    '    }',
    '    var normalized = []',
    '    for (var index = 0; index < value.length; index += 1) {',
    '      var item = value[index]',
    '      if (!isObject(item)) {',
    '        continue',
    '      }',
    '      normalized.push({',
    '        id: String(item.id || "option-" + index),',
    '        label: String(item.label || ""),',
    '        votes: Number(item.votes) || 0,',
    '        percentage: Number(item.percentage) || 0',
    '      })',
    '    }',
    '    return normalized',
    '  }',
    '  function normalizeState(value) {',
    '    if (!isObject(value)) {',
    '      return defaultState',
    '    }',
    '    var pollValue = isObject(value.poll) ? value.poll : defaultState.poll',
    '    return {',
    '      poll: {',
    '        id: String(pollValue.id || ""),',
    '        question: String(pollValue.question || ""),',
    '        status: String(pollValue.status || ""),',
    '        options: normalizeOptions(pollValue.options)',
    '      },',
    '      totalVotes: Number(value.totalVotes) || 0,',
    '      meta: isObject(value.meta) ? value.meta : {}',
    '    }',
    '  }',
    '  function buildOptionMapById(options) {',
    '    var map = {}',
    '    if (!Array.isArray(options)) {',
    '      return map',
    '    }',
    '    for (var index = 0; index < options.length; index += 1) {',
    '      var option = options[index]',
    '      if (!isObject(option)) {',
    '        continue',
    '      }',
    '      var id = String(option.id || "option-" + index)',
    '      map[id] = option',
    '    }',
    '    return map',
    '  }',
    '  function buildInterpolatedState(startState, endState, progress) {',
    '    var safeStart = normalizeState(startState)',
    '    var safeEnd = normalizeState(endState)',
    '    var startPoll = safeStart.poll',
    '    var endPoll = safeEnd.poll',
    '    var startById = buildOptionMapById(startPoll.options)',
    '    var endOptions = Array.isArray(endPoll.options) ? endPoll.options : []',
    '    var nextOptions = []',
    '    for (var index = 0; index < endOptions.length; index += 1) {',
    '      var endOption = endOptions[index]',
    '      if (!isObject(endOption)) {',
    '        continue',
    '      }',
    '      var optionId = String(endOption.id || "option-" + index)',
    '      var startOption = startById[optionId]',
    '      var startVotes = toFiniteNumber(startOption && startOption.votes, 0)',
    '      var endVotes = toFiniteNumber(endOption.votes, 0)',
    '      var startPercentage = toFiniteNumber(startOption && startOption.percentage, 0)',
    '      var endPercentage = toFiniteNumber(endOption.percentage, 0)',
    '      nextOptions.push({',
    '        id: optionId,',
    '        label: String(endOption.label || ""),',
    '        votes: Math.max(0, Math.round(interpolateNumber(startVotes, endVotes, progress))),',
    '        percentage: Math.max(0, Math.round(interpolateNumber(startPercentage, endPercentage, progress)))',
    '      })',
    '    }',
    '    return {',
    '      poll: {',
    '        id: String(endPoll.id || ""),',
    '        question: String(endPoll.question || ""),',
    '        status: String(endPoll.status || ""),',
    '        options: nextOptions',
    '      },',
    '      totalVotes: Math.max(0, Math.round(interpolateNumber(toFiniteNumber(safeStart.totalVotes, 0), toFiniteNumber(safeEnd.totalVotes, 0), progress))),',
    '      meta: isObject(safeEnd.meta) ? safeEnd.meta : {}',
    '    }',
    '  }',
    '  function clone(value) {',
    '    try {',
    '      return JSON.parse(JSON.stringify(value))',
    '    } catch (error) {',
    '      return value',
    '    }',
    '  }',
    '  function computeDocumentHeight() {',
    '    var doc = document.documentElement',
    '    var body = document.body',
    '    var docHeight = doc ? Math.max(doc.scrollHeight, doc.offsetHeight, doc.clientHeight) : 0',
    '    var bodyHeight = body ? Math.max(body.scrollHeight, body.offsetHeight, body.clientHeight) : 0',
    '    var nextHeight = Math.max(docHeight, bodyHeight, 240)',
    '    return Math.min(nextHeight, 6000)',
    '  }',
    '  function postArtifactSize(force) {',
    '    var nextHeight = computeDocumentHeight()',
    '    if (!force && Math.abs(nextHeight - lastReportedHeight) < 2) {',
    '      return',
    '    }',
    '    lastReportedHeight = nextHeight',
    '    if (window.parent && window.parent !== window) {',
    '      try {',
    '        window.parent.postMessage({ type: SIZE_MESSAGE_TYPE, height: nextHeight }, "*")',
    '      } catch (error) {}',
    '    }',
    '  }',
    '  function scheduleArtifactSizeReport() {',
    '    if (sizeRafId) {',
    '      return',
    '    }',
    '    sizeRafId = requestAnimationFrame(function () {',
    '      sizeRafId = 0',
    '      postArtifactSize(false)',
    '    })',
    '  }',
    '  function dispatchState(payloadValue) {',
    '    var payload = clone(normalizeState(payloadValue))',
    '    currentState = payload',
    '    renderedState = payload',
    '    hasRenderedState = true',
    '    window.__PREZO_POLL_STATE = payload',
    '    if (typeof window.prezoRenderPoll === "function") {',
    '      try {',
    '        window.prezoRenderPoll(payload)',
    '      } catch (error) {',
    '        console.error("[prezo-artifact] prezoRenderPoll failed", error)',
    '      }',
    '    }',
    '    try {',
    '      document.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: payload }))',
    '    } catch (error) {}',
    '    scheduleArtifactSizeReport()',
    '  }',
    '  function animateStateTransition(nextValue, forceImmediate) {',
    '    var nextState = normalizeState(nextValue)',
    '    var previousState = hasRenderedState ? normalizeState(renderedState) : defaultState',
    '    if (transitionRafId) {',
    '      cancelAnimationFrame(transitionRafId)',
    '      transitionRafId = 0',
    '    }',
    '    var shouldAnimate = !forceImmediate && !prefersReducedMotion && hasRenderedState',
    '    if (shouldAnimate && String(previousState.poll.id || "") !== String(nextState.poll.id || "")) {',
    '      shouldAnimate = false',
    '    }',
    '    if (!shouldAnimate) {',
    '      dispatchState(nextState)',
    '      return',
    '    }',
    '    var startTs = 0',
    '    function step(ts) {',
    '      if (!startTs) {',
    '        startTs = ts',
    '      }',
    '      var elapsed = ts - startTs',
    '      var raw = transitionDurationMs > 0 ? elapsed / transitionDurationMs : 1',
    '      var clamped = Math.min(1, Math.max(0, raw))',
    '      var eased = 1 - Math.pow(1 - clamped, 3)',
    '      dispatchState(buildInterpolatedState(previousState, nextState, eased))',
    '      if (clamped < 1) {',
    '        transitionRafId = requestAnimationFrame(step)',
    '        return',
    '      }',
    '      transitionRafId = 0',
    '      dispatchState(nextState)',
    '    }',
    '    transitionRafId = requestAnimationFrame(step)',
    '  }',
    '  if (typeof window.matchMedia === "function") {',
    '    try {',
    '      var media = window.matchMedia("(prefers-reduced-motion: reduce)")',
    '      prefersReducedMotion = Boolean(media && media.matches)',
    '      var onMotionChange = function (event) {',
    '        prefersReducedMotion = Boolean(event && event.matches)',
    '      }',
    '      if (media && typeof media.addEventListener === "function") {',
    '        media.addEventListener("change", onMotionChange)',
    '      } else if (media && typeof media.addListener === "function") {',
    '        media.addListener(onMotionChange)',
    '      }',
    '    } catch (error) {}',
    '  }',
    '  window.prezoGetPollState = function () {',
    '    return clone(currentState)',
    '  }',
    '  window.addEventListener("message", function (event) {',
    '    var message = event && event.data',
    '    if (!isObject(message) || message.type !== MESSAGE_TYPE) {',
    '      return',
    '    }',
    '    animateStateTransition(message.payload, false)',
    '  })',
    '  if (window.parent && window.parent !== window) {',
    '    try {',
    '      window.parent.postMessage({ type: READY_MESSAGE_TYPE }, "*")',
    '    } catch (error) {}',
    '  }',
    '  window.addEventListener("resize", scheduleArtifactSizeReport)',
    '  if (typeof MutationObserver === "function") {',
    '    var observer = new MutationObserver(function () {',
    '      scheduleArtifactSizeReport()',
    '    })',
    '    var observedTarget = document.body || document.documentElement',
    '    if (observedTarget) {',
    '      observer.observe(observedTarget, { childList: true, subtree: true, attributes: true, characterData: true })',
    '    }',
    '  }',
    '  if (typeof ResizeObserver === "function") {',
    '    var resizeObserver = new ResizeObserver(function () {',
    '      scheduleArtifactSizeReport()',
    '    })',
    '    if (document.documentElement) {',
    '      resizeObserver.observe(document.documentElement)',
    '    }',
    '    if (document.body) {',
    '      resizeObserver.observe(document.body)',
    '    }',
    '  }',
    '  if (document.readyState === "loading") {',
    '    document.addEventListener("DOMContentLoaded", function () {',
    '      animateStateTransition(currentState, true)',
    '    }, { once: true })',
    '  } else {',
    '    setTimeout(function () {',
    '      animateStateTransition(currentState, true)',
    '    }, 0)',
    '  }',
    '  postArtifactSize(true)',
    '})()'
  ].join('\n')
}

function tryParseJson(value) {
  const text = asText(value).trim()
  if (!text) {
    return null
  }
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function escapeHtml(value) {
  return asText(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function asText(value) {
  return typeof value === 'string' ? value : ''
}
