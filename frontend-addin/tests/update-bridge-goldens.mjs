// Regenerates the golden bridge-emission fixtures. Run ONLY when a bridge
// change is intentional, then review the fixture diff like any code change:
//   node tests/update-bridge-goldens.mjs
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildArtifactSrcDoc } from '../public/poc/gamified/poll-game-gamified-artifact-runtime.js'

const here = dirname(fileURLToPath(import.meta.url))
const fixturesDir = join(here, 'fixtures')
mkdirSync(fixturesDir, { recursive: true })

export const GOLDEN_INPUT_HTML =
  '<!doctype html><html><body><div id="golden-root" data-prezo-scene-root="true"></div></body></html>'
export const GOLDEN_OPTIONS = { instanceId: 7, hiddenCss: '' }

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const kind of ['poll', 'qna']) {
    const srcDoc = buildArtifactSrcDoc(GOLDEN_INPUT_HTML, {
      ...GOLDEN_OPTIONS,
      activityKind: kind
    })
    writeFileSync(join(fixturesDir, `bridge-golden-${kind}.html`), srcDoc)
    console.log(`wrote bridge-golden-${kind}.html (${srcDoc.length} bytes)`)
  }
}
