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

  /**
   * @param {{ file?: File, url?: string, purpose?: 'full' | 'artifact' }} args
   * Use `purpose: 'artifact'` from the poll artifact flow for concise design-only extraction.
   */
  async function extract({ file, url, purpose = 'full' }) {
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
    formData.append('purpose', purpose === 'artifact' ? 'artifact' : 'full')

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

  const GUIDELINES_MAX_CHARS_FULL = 12000
  /** Artifact conversation: keep textarea focused; backend `purpose=artifact` also caps the model */
  const GUIDELINES_MAX_CHARS_ARTIFACT = 2200

  function truncateText(s, maxLen) {
    const t = typeof s === 'string' ? s.trim() : ''
    if (!t || maxLen <= 0) {
      return ''
    }
    if (t.length <= maxLen) {
      return t
    }
    return `${t.slice(0, Math.max(0, maxLen - 1))}…`
  }

  /**
   * Convert an extraction payload into plain text for the artifact design-guidelines textarea.
   *
   * @param {{ guidelines?: object, raw_summary?: string }} payload
   * @param {{ mode?: 'artifact' | 'full' }} [options] — `artifact` uses fewer sections and tighter caps
   */
  function formatGuidelinesText(payload, options = {}) {
    if (!payload || typeof payload !== 'object') {
      return ''
    }
    const artifactMode = options.mode === 'artifact'
    const GUIDELINES_MAX_CHARS = artifactMode ? GUIDELINES_MAX_CHARS_ARTIFACT : GUIDELINES_MAX_CHARS_FULL
    const g = payload.guidelines || {}

    function colorArray(key, maxLines) {
      let arr = Array.isArray(g[key]) ? g[key] : []
      if (artifactMode && typeof maxLines === 'number') {
        arr = arr.slice(0, maxLines)
      }
      return arr.map(c => `  ${typeof c === 'string' ? c : JSON.stringify(c)}`).join('\n')
    }

    function stringField(key, maxLen) {
      const val = typeof g[key] === 'string' ? g[key].trim() : ''
      if (!val) {
        return ''
      }
      return artifactMode && typeof maxLen === 'number' ? truncateText(val, maxLen) : val
    }

    function arrayField(key, maxItems, itemMaxLen) {
      let arr = Array.isArray(g[key]) ? g[key] : []
      if (artifactMode && typeof maxItems === 'number') {
        arr = arr.slice(0, maxItems)
      }
      return arr
        .map(item => {
          const raw = typeof item === 'string' ? item : JSON.stringify(item)
          const line = artifactMode && typeof itemMaxLen === 'number' ? truncateText(raw, itemMaxLen) : raw
          return `  - ${line}`
        })
        .join('\n')
    }

    function fontsField() {
      const fonts = Array.isArray(g.fonts) ? g.fonts : []
      const slice = artifactMode ? fonts.slice(0, 3) : fonts
      return slice
        .map(f => {
          if (typeof f === 'string') return `  - ${f}`
          if (f && typeof f === 'object') {
            const parts = [f.family || 'Unknown']
            if (f.weights) parts.push(`weights: ${Array.isArray(f.weights) ? f.weights.join(', ') : f.weights}`)
            if (f.usage) parts.push(`usage: ${f.usage}`)
            return `  - ${parts.join(' | ')}`
          }
          return `  - ${JSON.stringify(f)}`
        })
        .join('\n')
    }

    /** Full reference profile (e.g. saving to library later) */
    const candidatesFull = [
      { label: 'Primary colors', body: colorArray('primary_colors') },
      { label: 'Secondary colors', body: colorArray('secondary_colors') },
      { label: 'Accent colors', body: colorArray('accent_colors') },
      { label: 'Fonts', body: fontsField() },
      { label: 'Visual style', body: stringField('visual_style') },
      { label: 'Tone of voice', body: stringField('tone_of_voice') },
      { label: 'Gradient styles', body: arrayField('gradient_styles') },
      { label: 'Typography hierarchy', body: stringField('typography_hierarchy') },
      { label: 'Patterns and textures', body: stringField('patterns_and_textures') },
      { label: 'Brand shapes', body: stringField('brand_shapes') },
      { label: 'Iconography style', body: stringField('iconography_style') },
      { label: 'Illustration style', body: stringField('illustration_style') },
      { label: 'Photography style', body: stringField('photography_style') },
      { label: 'Background styles', body: stringField('background_styles') },
      { label: 'Spacing and layout', body: stringField('spacing_and_layout') },
      { label: 'Key principles', body: arrayField('key_principles') },
      { label: 'Messaging framework', body: arrayField('messaging_framework') },
      { label: "Do's and Don'ts", body: arrayField('dos_and_donts') },
      { label: 'Animation and motion', body: stringField('animation_motion') },
      {
        label: 'Additional brand notes',
        body: typeof payload.raw_summary === 'string' ? payload.raw_summary.trim() : ''
      }
    ]

    /** Poll artifact step: design-only, no deck strategy dumps */
    const candidatesArtifact = [
      { label: 'Primary colors', body: colorArray('primary_colors', 6) },
      { label: 'Secondary colors', body: colorArray('secondary_colors', 4) },
      { label: 'Accent colors', body: colorArray('accent_colors', 4) },
      { label: 'Fonts', body: fontsField() },
      { label: 'Visual style', body: stringField('visual_style', 420) },
      { label: 'Tone of voice', body: stringField('tone_of_voice', 340) },
      { label: 'Typography hierarchy', body: stringField('typography_hierarchy', 260) },
      { label: 'Key principles', body: arrayField('key_principles', 5, 130) },
      { label: 'Gradient styles', body: arrayField('gradient_styles', 2, 100) },
      { label: "Do's and Don'ts", body: arrayField('dos_and_donts', 3, 120) }
    ]

    const candidates = artifactMode ? candidatesArtifact : candidatesFull

    const sections = []
    let total = 0
    for (const { label, body } of candidates) {
      if (!body) continue
      const chunk = `${label}:\n${body}`
      if (total + chunk.length + 2 > GUIDELINES_MAX_CHARS) {
        const remaining = GUIDELINES_MAX_CHARS - total - label.length - 20
        if (remaining > 80) {
          sections.push(`${label}:\n${body.slice(0, remaining)}…`)
        }
        break
      }
      sections.push(chunk)
      total += chunk.length + 2
    }

    return sections.join('\n\n')
  }

  return { extract, formatGuidelinesText }
}
