import fs from 'node:fs/promises'
import path from 'node:path'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
const distDir = path.join(rootDir, 'dist')
const port = Number.parseInt(process.env.PORT || '3000', 10)

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.png': 'image/png',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.webp': 'image/webp',
}

/**
 * Content-hashed bundles cache forever; everything else must revalidate so
 * new dialog/function-file/manifest code is picked up without bumping the
 * manifest's ?v= cache-bust param (which forces an add-in reinstall).
 */
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico'])

const cacheControlFor = (filePath, ext) => {
  if (filePath.includes(`${path.sep}assets${path.sep}`)) {
    return 'public, max-age=31536000, immutable'
  }
  if (IMAGE_EXTENSIONS.has(ext)) {
    return 'public, max-age=3600'
  }
  return 'no-cache'
}

const exists = async (targetPath) => {
  try {
    await fs.access(targetPath)
    return true
  } catch {
    return false
  }
}

const isInsideRoot = (targetPath) => {
  const relative = path.relative(distDir, targetPath)
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative)
}

const resolveRequestPath = async (requestUrl) => {
  const url = new URL(requestUrl, 'http://127.0.0.1')
  const decodedPath = decodeURIComponent(url.pathname)
  const relativePath = decodedPath.replace(/^\/+/, '')

  const candidates = []
  if (!relativePath) {
    candidates.push(path.join(distDir, 'index.html'))
  } else {
    const direct = path.join(distDir, relativePath)
    candidates.push(direct)
    candidates.push(path.join(direct, 'index.html'))
    if (!path.extname(relativePath)) {
      candidates.push(path.join(distDir, `${relativePath}.html`))
      candidates.push(path.join(distDir, relativePath, 'index.html'))
    }
  }

  for (const candidate of candidates) {
    if (candidate !== distDir && !isInsideRoot(candidate)) {
      continue
    }
    if (!await exists(candidate)) {
      continue
    }
    const stats = await fs.stat(candidate)
    if (stats.isFile()) {
      return candidate
    }
  }

  if (!path.extname(relativePath)) {
    const spaFallback = path.join(distDir, 'index.html')
    if (await exists(spaFallback)) {
      return spaFallback
    }
  }

  return null
}

const server = createServer(async (request, response) => {
  try {
    const filePath = await resolveRequestPath(request.url || '/')
    if (!filePath) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      response.end('Not found')
      return
    }

    const ext = path.extname(filePath).toLowerCase()
    const contentType = MIME_TYPES[ext] || 'application/octet-stream'
    const body = await fs.readFile(filePath)
    response.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': cacheControlFor(filePath, ext)
    })
    response.end(body)
  } catch (error) {
    response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
    response.end('Internal server error')
    console.error(error)
  }
})

server.listen(port, '0.0.0.0', () => {
  console.log(`Serving ${distDir} on http://0.0.0.0:${port}`)
})
