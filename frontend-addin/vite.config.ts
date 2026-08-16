import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const certDir =
  process.env.OFFICE_ADDIN_DEV_CERTS ?? path.join(os.homedir(), '.office-addin-dev-certs')
const keyPath = path.join(certDir, 'localhost.key')
const certPath = path.join(certDir, 'localhost.crt')

const loadHttpsOptions = () => {
  if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
    throw new Error(
      `Office add-in dev certs not found. Run: npx office-addin-dev-certs install`
    )
  }

  return {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath)
  }
}

/**
 * Mirror serve-dist.mjs's extensionless resolution in dev: production maps
 * `/poc/poll-game-poc` -> `poc/poll-game-poc.html`, but Vite's SPA fallback
 * would answer index.html instead — which loads the host console inside its
 * own Editor iframe, recursively. Rewrite extensionless requests to the
 * matching public/*.html file before the fallback can claim them.
 */
const extensionlessPublicHtml = (): Plugin => {
  const publicDir = path.resolve(__dirname, 'public')
  return {
    name: 'prezo-extensionless-public-html',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const rawUrl = req.url || ''
        const [pathname] = rawUrl.split('?')
        if (pathname && pathname !== '/' && !path.posix.extname(pathname)) {
          const candidate = path.join(publicDir, `${pathname.replace(/^\/+/, '')}.html`)
          if (candidate.startsWith(publicDir) && fs.existsSync(candidate)) {
            req.url = `${pathname}.html${rawUrl.slice(pathname.length)}`
          }
        }
        next()
      })
    }
  }
}

export default defineConfig(({ command, mode }) => {
  /**
   * Dev-only escape hatch: set PREZO_DEV_API_PROXY_TARGET (e.g. the deployed
   * Railway backend) in .env to serve the UI locally against that backend
   * without CORS — the browser stays same-origin on /prezo-api and Vite
   * forwards server-side. Pair with VITE_API_BASE_URL=https://localhost:5173/prezo-api
   * and VITE_WS_BASE_URL=wss://localhost:5173/prezo-api. Unset = no proxy.
   */
  const env = loadEnv(mode, process.cwd(), '')
  const apiProxyTarget = env.PREZO_DEV_API_PROXY_TARGET

  return {
    plugins: [react(), extensionlessPublicHtml()],
    build: {
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, 'index.html'),
          /** The manifest's FunctionFile (ribbon command runtime) — a real
           * Vite entry so it shares src/office/widgetShapes.ts with the
           * taskpane instead of carrying its own copy of the widget engine. */
          'function-file': path.resolve(__dirname, 'function-file/index.html')
        }
      }
    },
    server:
      command === 'serve'
        ? {
            host: 'localhost',
            port: 5173,
            strictPort: true,
            https: loadHttpsOptions(),
            proxy: apiProxyTarget
              ? {
                  '/prezo-api': {
                    target: apiProxyTarget,
                    changeOrigin: true,
                    ws: true,
                    rewrite: (p: string) => p.replace(/^\/prezo-api/, '')
                  }
                }
              : undefined
          }
        : undefined
  }
})
