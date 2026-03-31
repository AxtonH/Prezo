/**
 * Brand profile extraction and formatting helpers.
 *
 * Handles authenticated calls to /library/poll-game/brand-profiles/extract and
 * converts the structured response into a plain-text design-guidelines string
 * that can be pasted directly into the artifact Q3 textarea.
 */

export function createBrandProfileExtractor({ getApiBase, getAccessToken, errorToMessage }) {
  /**
   * POST a file or URL to the extract endpoint and return the raw payload.
   * Throws with a human-readable message on any failure.
   */
  const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024 // 50 MB

  async function extract({ file, url }) {
    const token = getAccessToken()
    if (!token) {
      throw new Error('Sign in through Prezo Host to use brand extraction.')
    }
    if (!file && !url) {
      throw new Error('Provide a file or URL to extract brand guidelines from.')
    }
    if (file && file.size > MAX_FILE_SIZE_BYTES) {
      throw new Error(`File too large (max 50 MB). Your file is ${(file.size / 1024 / 1024).toFixed(1)} MB.`)
    }

    const formData = new FormData()
    if (file) {
      formData.append('file', file)
    } else {
      formData.append('url', url)
    }

    let response
    try {
      response = await window.fetch(
        `${getApiBase()}/library/poll-game/brand-profiles/extract`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData
        }
      )
    } catch (error) {
      throw new Error(`Unable to reach API: ${errorToMessage(error)}`)
    }

    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      const detail =
        typeof payload?.detail === 'string'
          ? payload.detail
          : `Extraction failed (${response.status})`
      throw new Error(detail)
    }
    return payload
  }

  // Max characters for the design-guidelines text sent to the artifact builder
  const GUIDELINES_MAX_CHARS = 12000

  /**
   * Convert an extraction payload into a comprehensive plain-text string
   * suitable for the design-guidelines textarea, capped at GUIDELINES_MAX_CHARS.
   *
   * Logo fields are intentionally omitted — the logo image is handled separately
   * via the extracted image picker.
   *
   * Sections are ordered by priority so the most critical brand info is kept
   * if truncation is needed.
   */
  function formatGuidelinesText(payload) {
    if (!payload || typeof payload !== 'object') {
      return ''
    }
    const g = payload.guidelines || {}

    function colorArray(key) {
      const arr = Array.isArray(g[key]) ? g[key] : []
      return arr.map(c => `  ${typeof c === 'string' ? c : JSON.stringify(c)}`).join('\n')
    }

    function stringField(key) {
      const val = typeof g[key] === 'string' ? g[key].trim() : ''
      return val
    }

    function arrayField(key) {
      const arr = Array.isArray(g[key]) ? g[key] : []
      return arr.map(item => `  - ${typeof item === 'string' ? item : JSON.stringify(item)}`).join('\n')
    }

    function fontsField() {
      const fonts = Array.isArray(g.fonts) ? g.fonts : []
      return fonts.map(f => {
        if (typeof f === 'string') return `  - ${f}`
        if (f && typeof f === 'object') {
          const parts = [f.family || 'Unknown']
          if (f.weights) parts.push(`weights: ${Array.isArray(f.weights) ? f.weights.join(', ') : f.weights}`)
          if (f.usage) parts.push(`usage: ${f.usage}`)
          return `  - ${parts.join(' | ')}`
        }
        return `  - ${JSON.stringify(f)}`
      }).join('\n')
    }

    // Sections in priority order — highest priority first
    // Logo description and logo colors are excluded (handled by image picker)
    const candidates = [
      { label: 'Primary colors',       body: colorArray('primary_colors') },
      { label: 'Secondary colors',     body: colorArray('secondary_colors') },
      { label: 'Accent colors',        body: colorArray('accent_colors') },
      { label: 'Fonts',                body: fontsField() },
      { label: 'Visual style',         body: stringField('visual_style') },
      { label: 'Tone of voice',        body: stringField('tone_of_voice') },
      { label: 'Gradient styles',      body: arrayField('gradient_styles') },
      { label: 'Typography hierarchy', body: stringField('typography_hierarchy') },
      { label: 'Patterns and textures',body: stringField('patterns_and_textures') },
      { label: 'Brand shapes',         body: stringField('brand_shapes') },
      { label: 'Iconography style',    body: stringField('iconography_style') },
      { label: 'Illustration style',   body: stringField('illustration_style') },
      { label: 'Photography style',    body: stringField('photography_style') },
      { label: 'Background styles',    body: stringField('background_styles') },
      { label: 'Spacing and layout',   body: stringField('spacing_and_layout') },
      { label: 'Key principles',       body: arrayField('key_principles') },
      { label: 'Messaging framework',  body: arrayField('messaging_framework') },
      { label: "Do's and Don'ts",      body: arrayField('dos_and_donts') },
      { label: 'Animation and motion', body: stringField('animation_motion') },
      {
        label: 'Additional brand notes',
        body: typeof payload.raw_summary === 'string' ? payload.raw_summary.trim() : ''
      },
    ]

    // Build the output, stopping before we exceed the character cap
    const sections = []
    let total = 0
    for (const { label, body } of candidates) {
      if (!body) continue
      const chunk = `${label}:\n${body}`
      if (total + chunk.length + 2 > GUIDELINES_MAX_CHARS) {
        // Try to fit a truncated version for the current section
        const remaining = GUIDELINES_MAX_CHARS - total - label.length - 20
        if (remaining > 80) {
          sections.push(`${label}:\n${body.slice(0, remaining)}…`)
        }
        break
      }
      sections.push(chunk)
      total += chunk.length + 2 // +2 for the \n\n separator
    }

    return sections.join('\n\n')
  }

  return { extract, formatGuidelinesText }
}
