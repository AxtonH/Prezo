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
  async function extract({ file, url }) {
    const token = getAccessToken()
    if (!token) {
      throw new Error('Sign in through Prezo Host to use brand extraction.')
    }
    if (!file && !url) {
      throw new Error('Provide a file or URL to extract brand guidelines from.')
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
   * Convert an extraction payload into a compact plain-text string suitable
   * for the design-guidelines textarea.
   */
  function formatGuidelinesText(payload) {
    if (!payload || typeof payload !== 'object') {
      return ''
    }
    const g = payload.guidelines || {}
    const lines = []

    const primaryColors = Array.isArray(g.primary_colors) ? g.primary_colors : []
    if (primaryColors.length) {
      lines.push(`Primary colors: ${primaryColors.join(', ')}`)
    }

    const secondaryColors = Array.isArray(g.secondary_colors) ? g.secondary_colors : []
    if (secondaryColors.length) {
      lines.push(`Secondary colors: ${secondaryColors.join(', ')}`)
    }

    const fonts = Array.isArray(g.fonts) ? g.fonts : []
    if (fonts.length) {
      lines.push(`Fonts: ${fonts.join(', ')}`)
    }

    if (typeof g.visual_style === 'string' && g.visual_style.trim()) {
      lines.push(`Visual style: ${g.visual_style.trim()}`)
    }

    const principles = Array.isArray(g.key_principles) ? g.key_principles : []
    if (principles.length) {
      lines.push(`Key principles: ${principles.join('; ')}`)
    }

    if (typeof g.logo_description === 'string' && g.logo_description.trim()) {
      lines.push(`Logo: ${g.logo_description.trim()}`)
    }

    if (typeof payload.raw_summary === 'string' && payload.raw_summary.trim()) {
      lines.push(`Notes: ${payload.raw_summary.trim()}`)
    }

    return lines.join('\n')
  }

  return { extract, formatGuidelinesText }
}
