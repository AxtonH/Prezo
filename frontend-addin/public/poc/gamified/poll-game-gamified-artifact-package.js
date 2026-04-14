import { normalizeArtifactMarkup } from './poll-game-gamified-artifact-runtime.js'

export const ARTIFACT_PACKAGE_FORMAT = 'prezo-artifact-package@1'
export const ARTIFACT_PACKAGE_ENTRY_FILE = 'index.html'
export const ARTIFACT_PACKAGE_STYLES_FILE = 'styles.css'
export const ARTIFACT_PACKAGE_RENDERER_FILE = 'renderer.js'

function asText(value) {
  if (typeof value === 'string') {
    return value
  }
  if (value == null) {
    return ''
  }
  return String(value)
}

function normalizePackagePath(pathValue) {
  let path = asText(pathValue).trim().replace(/\\/g, '/')
  while (path.startsWith('./')) {
    path = path.slice(2)
  }
  return path
}

function inferLanguageFromPath(path) {
  const lowered = path.toLowerCase()
  if (lowered.endsWith('.html')) {
    return 'html'
  }
  if (lowered.endsWith('.css')) {
    return 'css'
  }
  if (lowered.endsWith('.js')) {
    return 'javascript'
  }
  return null
}

function isHtmlPackageFile(file) {
  const language = asText(file?.language).trim().toLowerCase()
  if (language === 'html') {
    return true
  }
  const path = normalizePackagePath(file?.path).toLowerCase()
  return path.endsWith('.html')
}

function normalizeFiles(inputFiles) {
  if (!Array.isArray(inputFiles)) {
    return []
  }
  const files = []
  for (const file of inputFiles) {
    if (!file || typeof file !== 'object') {
      continue
    }
    const path = normalizePackagePath(file.path)
    if (!path) {
      continue
    }
    const language = asText(file.language).trim().toLowerCase() || inferLanguageFromPath(path)
    files.push({
      path,
      content: asText(file.content),
      language: language || null
    })
  }
  return files
}

function getPackageFileContent(artifactPackage, targetPath) {
  if (!artifactPackage || typeof artifactPackage !== 'object') {
    return ''
  }
  const files = normalizeFiles(artifactPackage.files)
  const normalizedTarget = normalizePackagePath(targetPath).toLowerCase()
  const match = files.find((file) => normalizePackagePath(file.path).toLowerCase() === normalizedTarget)
  return asText(match?.content)
}

function upsertPackageFile(files, path, content, language = null) {
  const normalizedPath = normalizePackagePath(path)
  const nextFiles = Array.isArray(files) ? files.map((file) => ({ ...file })) : []
  const existing = nextFiles.find(
    (file) => normalizePackagePath(file.path).toLowerCase() === normalizedPath.toLowerCase()
  )
  if (existing) {
    existing.content = asText(content)
    existing.language = (language || inferLanguageFromPath(normalizedPath) || '').toLowerCase() || null
    return nextFiles
  }
  nextFiles.push({
    path: normalizedPath,
    content: asText(content),
    language: (language || inferLanguageFromPath(normalizedPath) || '').toLowerCase() || null
  })
  return nextFiles
}

function serializeHtmlDocument(doc) {
  if (!doc || !doc.documentElement) {
    return ''
  }
  return `<!doctype html>\n${doc.documentElement.outerHTML}`
}

function parseHtmlDocument(markup) {
  const source = normalizeArtifactMarkup(markup)
  const parser = new DOMParser()
  return parser.parseFromString(source || '<!doctype html><html><head></head><body></body></html>', 'text/html')
}

function findStylesLinkNodes(doc) {
  return [...doc.querySelectorAll('link[href]')].filter((node) => {
    const href = normalizePackagePath(node.getAttribute('href'))
    return href.toLowerCase() === ARTIFACT_PACKAGE_STYLES_FILE
  })
}

function findRendererScriptNodes(doc) {
  return [...doc.querySelectorAll('script[src]')].filter((node) => {
    const src = normalizePackagePath(node.getAttribute('src'))
    return src.toLowerCase() === ARTIFACT_PACKAGE_RENDERER_FILE
  })
}

function ensureHeadNode(doc) {
  if (doc.head) {
    return doc.head
  }
  const head = doc.createElement('head')
  if (doc.documentElement.firstChild) {
    doc.documentElement.insertBefore(head, doc.documentElement.firstChild)
  } else {
    doc.documentElement.appendChild(head)
  }
  return head
}

function ensureBodyNode(doc) {
  if (doc.body) {
    return doc.body
  }
  const body = doc.createElement('body')
  doc.documentElement.appendChild(body)
  return body
}

function materializePackageIntoHtml(entryHtml, stylesContent, rendererContent) {
  const doc = parseHtmlDocument(entryHtml)
  if (stylesContent) {
    const styleNodes = findStylesLinkNodes(doc)
    const styleTag = doc.createElement('style')
    styleTag.textContent = stylesContent
    if (styleNodes.length > 0) {
      styleNodes[0].replaceWith(styleTag)
      for (const node of styleNodes.slice(1)) {
        node.remove()
      }
    } else {
      ensureHeadNode(doc).appendChild(styleTag)
    }
  } else {
    for (const node of findStylesLinkNodes(doc)) {
      node.remove()
    }
  }
  if (rendererContent) {
    const scriptNodes = findRendererScriptNodes(doc)
    const scriptTag = doc.createElement('script')
    scriptTag.textContent = rendererContent
    if (scriptNodes.length > 0) {
      scriptNodes[0].replaceWith(scriptTag)
      for (const node of scriptNodes.slice(1)) {
        node.remove()
      }
    } else {
      ensureBodyNode(doc).appendChild(scriptTag)
    }
  } else {
    for (const node of findRendererScriptNodes(doc)) {
      node.remove()
    }
  }
  return normalizeArtifactMarkup(serializeHtmlDocument(doc))
}

export function materializeArtifactHtmlFromPackage(artifactPackage, fallbackHtml = '') {
  if (!artifactPackage || typeof artifactPackage !== 'object') {
    return normalizeArtifactMarkup(fallbackHtml)
  }
  const files = normalizeFiles(artifactPackage.files)
  if (!files.length) {
    return normalizeArtifactMarkup(fallbackHtml)
  }
  const entry = normalizePackagePath(artifactPackage.entry) || ARTIFACT_PACKAGE_ENTRY_FILE
  const entryFile =
    files.find(
      (file) =>
        normalizePackagePath(file.path).toLowerCase() === entry.toLowerCase() && isHtmlPackageFile(file)
    ) || files.find((file) => isHtmlPackageFile(file))
  const entryHtml = normalizeArtifactMarkup(asText(entryFile?.content))
  if (!entryHtml) {
    return normalizeArtifactMarkup(fallbackHtml)
  }
  const stylesContent = getPackageFileContent(artifactPackage, ARTIFACT_PACKAGE_STYLES_FILE).trim()
  const rendererContent = getPackageFileContent(artifactPackage, ARTIFACT_PACKAGE_RENDERER_FILE).trim()
  return materializePackageIntoHtml(entryHtml, stylesContent, rendererContent)
}

export function resolveArtifactHtmlFromPackage(artifactPackage) {
  return materializeArtifactHtmlFromPackage(artifactPackage)
}

export function sanitizeArtifactPackage(artifactPackage, fallbackHtml = '') {
  const fallback = normalizeArtifactMarkup(fallbackHtml)
  if (!artifactPackage || typeof artifactPackage !== 'object') {
    return fallback ? buildSingleFileArtifactPackage(fallback) : null
  }
  const files = normalizeFiles(artifactPackage.files)
  if (!files.length) {
    return fallback ? buildSingleFileArtifactPackage(fallback) : null
  }
  let entry = normalizePackagePath(artifactPackage.entry)
  if (!entry) {
    entry = files[0].path
  }
  if (!files.some((file) => normalizePackagePath(file.path).toLowerCase() === entry.toLowerCase())) {
    entry = files[0].path
  }
  return {
    format: asText(artifactPackage.format) || ARTIFACT_PACKAGE_FORMAT,
    entry,
    files
  }
}

export function buildSingleFileArtifactPackage(html) {
  const normalized = normalizeArtifactMarkup(asText(html))
  if (!normalized) {
    return null
  }
  return {
    format: ARTIFACT_PACKAGE_FORMAT,
    entry: ARTIFACT_PACKAGE_ENTRY_FILE,
    files: [{ path: ARTIFACT_PACKAGE_ENTRY_FILE, content: normalized, language: 'html' }]
  }
}

export function buildSegmentedArtifactPackage(input) {
  const inputPackage = input && typeof input === 'object' ? sanitizeArtifactPackage(input) : null
  const sourceHtml = inputPackage
    ? materializeArtifactHtmlFromPackage(inputPackage)
    : normalizeArtifactMarkup(asText(input))
  if (!sourceHtml) {
    return null
  }

  const doc = parseHtmlDocument(sourceHtml)
  const styleNodes = [...doc.querySelectorAll('style')]
  const scriptNodes = [...doc.querySelectorAll('script:not([src])')]
  const extractedStyles = styleNodes.map((node) => asText(node.textContent).trim()).filter(Boolean)
  const extractedScripts = scriptNodes.map((node) => asText(node.textContent).trim()).filter(Boolean)

  if (styleNodes.length > 0) {
    const styleLink = doc.createElement('link')
    styleLink.setAttribute('rel', 'stylesheet')
    styleLink.setAttribute('href', `./${ARTIFACT_PACKAGE_STYLES_FILE}`)
    styleLink.setAttribute('data-prezo-artifact-package', 'styles')
    styleNodes[0].replaceWith(styleLink)
    for (const node of styleNodes.slice(1)) {
      node.remove()
    }
  }

  if (scriptNodes.length > 0) {
    const scriptTag = doc.createElement('script')
    scriptTag.setAttribute('src', `./${ARTIFACT_PACKAGE_RENDERER_FILE}`)
    scriptTag.setAttribute('data-prezo-artifact-package', 'renderer')
    scriptNodes[0].replaceWith(scriptTag)
    for (const node of scriptNodes.slice(1)) {
      node.remove()
    }
  }

  if (findStylesLinkNodes(doc).length === 0) {
    const styleLink = doc.createElement('link')
    styleLink.setAttribute('rel', 'stylesheet')
    styleLink.setAttribute('href', `./${ARTIFACT_PACKAGE_STYLES_FILE}`)
    styleLink.setAttribute('data-prezo-artifact-package', 'styles')
    ensureHeadNode(doc).appendChild(styleLink)
  }

  if (findRendererScriptNodes(doc).length === 0) {
    const scriptTag = doc.createElement('script')
    scriptTag.setAttribute('src', `./${ARTIFACT_PACKAGE_RENDERER_FILE}`)
    scriptTag.setAttribute('data-prezo-artifact-package', 'renderer')
    ensureBodyNode(doc).appendChild(scriptTag)
  }

  const baseFiles = []
  const indexHtml = normalizeArtifactMarkup(serializeHtmlDocument(doc))
  baseFiles.push({
    path: ARTIFACT_PACKAGE_ENTRY_FILE,
    content: indexHtml,
    language: 'html'
  })

  const fallbackStyles = inputPackage
    ? getPackageFileContent(inputPackage, ARTIFACT_PACKAGE_STYLES_FILE).trim()
    : ''
  const stylesContent = extractedStyles.join('\n\n').trim() || fallbackStyles
  baseFiles.push({
    path: ARTIFACT_PACKAGE_STYLES_FILE,
    content: stylesContent,
    language: 'css'
  })

  const fallbackRenderer = inputPackage
    ? getPackageFileContent(inputPackage, ARTIFACT_PACKAGE_RENDERER_FILE).trim()
    : ''
  const rendererContent = extractedScripts.join('\n\n').trim() || fallbackRenderer
  baseFiles.push({
    path: ARTIFACT_PACKAGE_RENDERER_FILE,
    content: rendererContent,
    language: 'javascript'
  })

  let files = baseFiles
  if (inputPackage) {
    const corePaths = new Set(
      [ARTIFACT_PACKAGE_ENTRY_FILE, ARTIFACT_PACKAGE_STYLES_FILE, ARTIFACT_PACKAGE_RENDERER_FILE].map((path) =>
        path.toLowerCase()
      )
    )
    for (const file of normalizeFiles(inputPackage.files)) {
      const normalizedPath = normalizePackagePath(file.path).toLowerCase()
      if (corePaths.has(normalizedPath)) {
        continue
      }
      files = upsertPackageFile(files, file.path, file.content, file.language)
    }
  }

  return {
    format: ARTIFACT_PACKAGE_FORMAT,
    entry: ARTIFACT_PACKAGE_ENTRY_FILE,
    files
  }
}
