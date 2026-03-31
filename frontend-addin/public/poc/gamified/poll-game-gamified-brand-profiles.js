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

  /**
   * Convert an extraction payload into a comprehensive plain-text string
   * suitable for the design-guidelines textarea.
   */
  function formatGuidelinesText(payload) {
    if (!payload || typeof payload !== 'object') {
      return ''
    }
    const g = payload.guidelines || {}
    const sections = []

    function addColorArray(label, key) {
      const arr = Array.isArray(g[key]) ? g[key] : []
      if (arr.length) {
        sections.push(`${label}:\n${arr.map(c => `  ${typeof c === 'string' ? c : JSON.stringify(c)}`).join('\n')}`)
      }
    }

    function addStringField(label, key, source) {
      const obj = source || g
      const val = typeof obj[key] === 'string' ? obj[key].trim() : ''
      if (val) sections.push(`${label}:\n${val}`)
    }

    function addArrayField(label, key) {
      const arr = Array.isArray(g[key]) ? g[key] : []
      if (arr.length) {
        sections.push(`${label}:\n${arr.map(item => `  - ${typeof item === 'string' ? item : JSON.stringify(item)}`).join('\n')}`)
      }
    }

    addColorArray('Primary colors', 'primary_colors')
    addColorArray('Secondary colors', 'secondary_colors')
    addColorArray('Accent colors', 'accent_colors')
    addArrayField('Gradient styles', 'gradient_styles')

    const fonts = Array.isArray(g.fonts) ? g.fonts : []
    if (fonts.length) {
      const formatted = fonts.map(f => {
        if (typeof f === 'string') return `  - ${f}`
        if (f && typeof f === 'object') {
          const parts = [f.family || 'Unknown']
          if (f.weights) parts.push(`weights: ${Array.isArray(f.weights) ? f.weights.join(', ') : f.weights}`)
          if (f.usage) parts.push(`usage: ${f.usage}`)
          return `  - ${parts.join(' | ')}`
        }
        return `  - ${JSON.stringify(f)}`
      })
      sections.push(`Fonts:\n${formatted.join('\n')}`)
    }

    addStringField('Typography hierarchy', 'typography_hierarchy')
    addStringField('Logo', 'logo_description')
    addColorArray('Logo colors', 'logo_colors')
    addStringField('Visual style', 'visual_style')
    addArrayField('Key principles', 'key_principles')
    addStringField('Tone of voice', 'tone_of_voice')
    addStringField('Messaging framework', 'messaging_framework')
    addStringField('Iconography style', 'iconography_style')
    addStringField('Illustration style', 'illustration_style')
    addStringField('Photography style', 'photography_style')
    addStringField('Patterns and textures', 'patterns_and_textures')
    addStringField('Spacing and layout', 'spacing_and_layout')
    addStringField('Brand shapes', 'brand_shapes')
    addStringField('Background styles', 'background_styles')
    addStringField('Animation and motion', 'animation_motion')
    addArrayField("Do's and Don'ts", 'dos_and_donts')

    if (typeof payload.raw_summary === 'string' && payload.raw_summary.trim()) {
      sections.push(`Additional brand notes:\n${payload.raw_summary.trim()}`)
    }

    return sections.join('\n\n')
  }

  return { extract, formatGuidelinesText }
}
