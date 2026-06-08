/**
 * Inline image attachments for the artifact prompt composer.
 *
 * The artifact prompt input (#artifact-prompt-input) is a contenteditable div rather
 * than a textarea so the user can drop an image chip at a specific spot in their
 * sentence — e.g. "use this image of the finajeen [chip] to represent each option".
 * Each chip is an atomic, non-editable inline token carrying the image's id, filename,
 * upload status, and (once hosted) its public URL.
 *
 * On submit the composer is serialized: text stays text, and every chip is replaced
 * with the marker `[attached image: <hosted-url>]` at its exact position, so the model
 * reads the URL right next to the element it describes. Chips that are still uploading
 * or failed to host degrade to a plain "(image: <filename>)" note rather than emitting
 * a broken marker.
 *
 * This module is intentionally free of app state: callers own the attachments Map and
 * the upload pipeline; these are pure DOM + serialization helpers.
 */

export const INLINE_IMAGE_MARKER_PREFIX = 'attached image:'

/** data-* keys on the chip element, the single source of truth for a chip's identity/state. */
const CHIP_DATA_ID = 'attachmentId'
const CHIP_DATA_STATUS = 'status'
const CHIP_DATA_URL = 'url'
const CHIP_DATA_FILENAME = 'filename'

/** Class the app sets on the editor when it has neither text nor a chip (drives the CSS placeholder). */
export const COMPOSER_EMPTY_CLASS = 'artifact-prompt-input--empty'

const CHIP_CLASS = 'artifact-image-chip'

/**
 * Build the marker text a single hosted attachment serializes to. Kept here so the
 * client format and any future client-side preview stay in lockstep.
 */
export function buildInlineImageMarker(url) {
  return `[${INLINE_IMAGE_MARKER_PREFIX} ${url}]`
}

/** Shorten a filename for display in the chip without losing the extension. */
function truncateFilename(filename, max = 28) {
  const name = typeof filename === 'string' ? filename.trim() : ''
  if (!name || name.length <= max) {
    return name || 'image'
  }
  const dot = name.lastIndexOf('.')
  if (dot > 0 && name.length - dot <= 6) {
    const ext = name.slice(dot)
    const head = name.slice(0, Math.max(1, max - ext.length - 1))
    return `${head}…${ext}`
  }
  return `${name.slice(0, max - 1)}…`
}

/**
 * Create a chip DOM node for an attachment. `onRemove` is invoked with the attachment
 * id when the user clicks the × (the caller removes it from state and the DOM).
 */
export function createInlineImageChip({ id, filename, status = 'uploading', url = '' }, onRemove) {
  const chip = document.createElement('span')
  chip.className = `${CHIP_CLASS} ${CHIP_CLASS}--${status}`
  chip.contentEditable = 'false'
  chip.setAttribute('role', 'group')
  chip.dataset[CHIP_DATA_ID] = String(id)
  chip.dataset[CHIP_DATA_STATUS] = status
  chip.dataset[CHIP_DATA_FILENAME] = typeof filename === 'string' ? filename : ''
  if (url) {
    chip.dataset[CHIP_DATA_URL] = url
  }

  const icon = document.createElement('span')
  icon.className = 'material-symbols-outlined'
  icon.setAttribute('aria-hidden', 'true')
  icon.textContent = 'image'
  chip.appendChild(icon)

  const name = document.createElement('span')
  name.className = 'artifact-image-chip-name'
  name.textContent = truncateFilename(filename)
  chip.appendChild(name)

  const remove = document.createElement('button')
  remove.type = 'button'
  remove.className = 'artifact-image-chip-remove'
  remove.setAttribute('aria-label', `Remove attached image ${filename || ''}`.trim())
  remove.textContent = '×'
  remove.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    if (typeof onRemove === 'function') {
      onRemove(String(id))
    }
  })
  chip.appendChild(remove)

  return chip
}

/** Update a chip's visual state + stored URL after its background upload resolves/fails. */
export function setChipState(editorEl, id, { status, url }) {
  const chip = findChip(editorEl, id)
  if (!chip) {
    return
  }
  const prevStatus = chip.dataset[CHIP_DATA_STATUS]
  if (prevStatus) {
    chip.classList.remove(`${CHIP_CLASS}--${prevStatus}`)
  }
  chip.classList.add(`${CHIP_CLASS}--${status}`)
  chip.dataset[CHIP_DATA_STATUS] = status
  if (url) {
    chip.dataset[CHIP_DATA_URL] = url
  } else if (status !== 'ready') {
    delete chip.dataset[CHIP_DATA_URL]
  }
}

function findChip(editorEl, id) {
  if (!editorEl) {
    return null
  }
  return editorEl.querySelector(`.${CHIP_CLASS}[data-attachment-id="${CSS.escape(String(id))}"]`)
}

/** Remove a chip node from the editor by id; returns true if one was removed. */
export function removeChipNode(editorEl, id) {
  const chip = findChip(editorEl, id)
  if (!chip) {
    return false
  }
  chip.remove()
  return true
}

/**
 * Insert a chip at the current caret position inside the editor. If the selection is
 * outside the editor (or there is none), the chip is appended at the end. A trailing
 * space text node is added so the user can keep typing after the chip.
 */
export function insertChipAtCaret(editorEl, chipNode) {
  if (!editorEl || !chipNode) {
    return
  }
  const selection = window.getSelection()
  const trailing = document.createTextNode(' ')

  const hasRangeInEditor =
    selection &&
    selection.rangeCount > 0 &&
    editorEl.contains(selection.getRangeAt(0).commonAncestorContainer)

  if (!hasRangeInEditor) {
    editorEl.appendChild(chipNode)
    editorEl.appendChild(trailing)
    placeCaretAfter(trailing)
    return
  }

  const range = selection.getRangeAt(0)
  range.deleteContents()
  range.insertNode(trailing)
  range.insertNode(chipNode)
  // Caret goes after the trailing space, ready for more typing.
  placeCaretAfter(trailing)
}

function placeCaretAfter(node) {
  const selection = window.getSelection()
  if (!selection) {
    return
  }
  const range = document.createRange()
  range.setStartAfter(node)
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
}

/**
 * Serialize the composer into a plain-text prompt plus the ordered list of attachments
 * that were actually present. Each chip becomes `[attached image: <url>]` when hosted,
 * or a `(image: <filename>)` note when its upload is pending/failed (so the prompt is
 * never littered with empty/broken markers).
 *
 * Returns { text, attachments: [{ id, url, filename }] } where attachments only
 * includes chips that have a hosted URL (the ones the backend can fetch/embed).
 */
export function serializeComposer(editorEl) {
  if (!editorEl) {
    return { text: '', attachments: [] }
  }
  const attachments = []
  const parts = []
  walk(editorEl, parts, attachments)
  // The first .replace normalizes non-breaking spaces (which contenteditable inserts)
  // to plain spaces, so the prompt reads naturally and a chip marker is never glued to
  // adjacent text by an nbsp.
  const text = parts
    .join('')
    .replace(/ /g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .trim()
  return { text, attachments }
}

function walk(node, parts, attachments) {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      parts.push(child.textContent || '')
      continue
    }
    if (child.nodeType !== Node.ELEMENT_NODE) {
      continue
    }
    if (child.classList && child.classList.contains(CHIP_CLASS)) {
      serializeChip(child, parts, attachments)
      continue
    }
    // <div>/<br> from the contenteditable become line breaks.
    const tag = child.tagName ? child.tagName.toLowerCase() : ''
    if (tag === 'br') {
      parts.push('\n')
      continue
    }
    const before = parts.length
    walk(child, parts, attachments)
    if (tag === 'div' && parts.length > before) {
      parts.push('\n')
    }
  }
}

function serializeChip(chip, parts, attachments) {
  const id = chip.dataset[CHIP_DATA_ID] || ''
  const url = chip.dataset[CHIP_DATA_URL] || ''
  const filename = chip.dataset[CHIP_DATA_FILENAME] || ''
  if (url) {
    parts.push(buildInlineImageMarker(url))
    attachments.push({ id, url, filename })
  } else {
    // Pending or failed upload: keep a human note so the user's sentence still reads,
    // but emit no URL marker (the backend would reject/skip it anyway).
    parts.push(`(image: ${filename || 'attached'})`)
  }
}

/** True when the editor has no text and no chips — used to toggle the placeholder. */
export function composerIsEmpty(editorEl) {
  if (!editorEl) {
    return true
  }
  if (editorEl.querySelector(`.${CHIP_CLASS}`)) {
    return false
  }
  return (editorEl.textContent || '').replace(/ /g, '').trim().length === 0
}

/** Add/remove the empty-state class so the CSS placeholder shows only when truly empty. */
export function refreshComposerPlaceholder(editorEl) {
  if (!editorEl) {
    return
  }
  editorEl.classList.toggle(COMPOSER_EMPTY_CLASS, composerIsEmpty(editorEl))
}

/** Clear all content from the editor and refresh its placeholder. */
export function clearComposer(editorEl) {
  if (!editorEl) {
    return
  }
  editorEl.replaceChildren()
  refreshComposerPlaceholder(editorEl)
}

/** Set the editor's plain text (no chips), e.g. when restoring a queued prompt. */
export function setComposerText(editorEl, text) {
  if (!editorEl) {
    return
  }
  editorEl.replaceChildren(document.createTextNode(typeof text === 'string' ? text : ''))
  refreshComposerPlaceholder(editorEl)
}
