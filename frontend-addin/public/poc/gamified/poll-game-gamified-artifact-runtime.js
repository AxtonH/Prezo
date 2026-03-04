const ARTIFACT_POLL_MESSAGE_TYPE = 'prezo-poll-state'
const ARTIFACT_POLL_EVENT_NAME = 'prezo:poll-update'

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
        height: 100%;
      }
      body {
        overflow: hidden;
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
    '  var defaultState = {',
    '    poll: { id: "", question: "", status: "", options: [] },',
    '    totalVotes: 0,',
    '    meta: {}',
    '  }',
    '  var currentState = defaultState',
    '  function isObject(value) {',
    '    return value && typeof value === "object"',
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
    '  function clone(value) {',
    '    try {',
    '      return JSON.parse(JSON.stringify(value))',
    '    } catch (error) {',
    '      return value',
    '    }',
    '  }',
    '  function dispatchState() {',
    '    var payload = clone(currentState)',
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
    '  }',
    '  window.prezoGetPollState = function () {',
    '    return clone(currentState)',
    '  }',
    '  window.addEventListener("message", function (event) {',
    '    var message = event && event.data',
    '    if (!isObject(message) || message.type !== MESSAGE_TYPE) {',
    '      return',
    '    }',
    '    currentState = normalizeState(message.payload)',
    '    dispatchState()',
    '  })',
    '  if (window.parent && window.parent !== window) {',
    '    try {',
    '      window.parent.postMessage({ type: "prezo-artifact-ready" }, "*")',
    '    } catch (error) {}',
    '  }',
    '  if (document.readyState === "loading") {',
    '    document.addEventListener("DOMContentLoaded", dispatchState, { once: true })',
    '  } else {',
    '    setTimeout(dispatchState, 0)',
    '  }',
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
