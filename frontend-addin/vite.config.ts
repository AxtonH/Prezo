import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { defineConfig } from 'vite'
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

export default defineConfig({
  plugins: [react()],
  server: {
    host: 'localhost',
    port: 5173,
    strictPort: true,
    https: loadHttpsOptions()
  }
})
