import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(process.cwd())
const publicDir = path.join(root, 'public')
const distDir = path.join(root, 'dist')

const copyRecursive = (src, dest) => {
  if (!fs.existsSync(src)) {
    return
  }
  const stat = fs.statSync(src)
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true })
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry))
    }
    return
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.copyFileSync(src, dest)
}

copyRecursive(publicDir, distDir)
