import { mkdirSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createServer } from 'vite'

const OUT_DIR = '/tmp/dash-parity'

function normalizeStyleAttribute(style) {
  const entities = []
  const protectedStyle = style.replace(/&(?:#[0-9]+|#x[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]+);/g, (entity) => {
    const token = `__ENTITY_${entities.length}__`
    entities.push(entity)
    return token
  })

  return protectedStyle
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .sort()
    .join(';')
    .replace(/__ENTITY_(\d+)__/g, (_match, index) => entities[Number(index)])
}

function normalizeMarkup(markup) {
  return markup
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/style="([^"]*)"/g, (_match, style) => `style="${normalizeStyleAttribute(style)}"`)
    .replace(/>\s+</g, '><')
}

mkdirSync(OUT_DIR, { recursive: true })

const vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' })
let failed = false

try {
  const mod = await vite.ssrLoadModule('/scripts/parityEntry.tsx')
  const cases = mod.renderParityCases()

  for (const item of cases) {
    const oldMarkup = normalizeMarkup(item.oldMarkup)
    const newMarkup = normalizeMarkup(item.newMarkup)
    const oldPath = `${OUT_DIR}/${item.name}.old.txt`
    const newPath = `${OUT_DIR}/${item.name}.new.txt`

    writeFileSync(oldPath, `${oldMarkup}\n`)
    writeFileSync(newPath, `${newMarkup}\n`)

    if (oldMarkup === newMarkup) {
      console.log(`${item.name}: PASS`)
      continue
    }

    failed = true
    console.log(`${item.name}: FAIL`)
    const diff = spawnSync('diff', ['-u', oldPath, newPath], { encoding: 'utf8' })
    if (diff.stdout) process.stdout.write(diff.stdout)
    if (diff.stderr) process.stderr.write(diff.stderr)
  }
} finally {
  await vite.close()
}

if (failed) process.exit(1)
