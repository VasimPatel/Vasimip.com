// Parity Stage 2b — SHIPPED SKIN CONTENT GATE. Every skin doc under
// content/engine/skins validates structurally, references only known keyframes,
// carries a head anchor (the parametric face needs one; baked drawings still
// use it for the poke/speech anchor math), and maps every source id to a real
// pose or clip. The extraction is script-assisted — this is the net under it.
import { test, expect } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import {
  tryValidatePoseSkin,
  tryValidateSkinKeyframes,
  validateSkinAgainstKeyframes,
  type PoseSkinDoc,
  type SkinKeyframesDoc,
} from '../src/index'

const ROOT = new URL('../../../', import.meta.url).pathname
const DIR = ROOT + 'content/engine/skins/'

const files = readdirSync(DIR).filter((f) => f.endsWith('.json') && f !== 'keyframes.json')
const table = JSON.parse(readFileSync(DIR + 'keyframes.json', 'utf8')) as SkinKeyframesDoc
const poseIds = new Set(readdirSync(ROOT + 'content/engine/poses').map((f) => f.replace('.json', '')))
const clipIds = new Set(readdirSync(ROOT + 'content/engine/clips').map((f) => f.replace('.json', '')))

test('the shared keyframes table validates', () => {
  const v = tryValidateSkinKeyframes(table)
  if (!v.ok) console.log(v.errors.slice(0, 6))
  expect(v.ok).toBe(true)
  expect(Object.keys(table.keyframes).length).toBeGreaterThan(20)
})

test(`all ${files.length} shipped skins validate + resolve (24 legacy drawings + kick)`, () => {
  expect(files.length).toBe(25)
  for (const f of files) {
    const doc = JSON.parse(readFileSync(DIR + f, 'utf8')) as PoseSkinDoc
    const v = tryValidatePoseSkin(doc)
    if (!v.ok) console.log(f, v.errors.slice(0, 6))
    expect(v.ok).toBe(true)
    const missing = validateSkinAgainstKeyframes(doc, table)
    if (missing.length) console.log(f, missing)
    expect(missing).toEqual([])
    // every source id must be a shipped pose or clip — or the locomotion
    // controller's synthetic gait source ('__gait', the ground-move blend id).
    for (const s of doc.sources) {
      expect(poseIds.has(s) || clipIds.has(s) || s === '__gait').toBe(true)
    }
    // the head anchor is required content policy (schema keeps it optional)
    expect(doc.head).toBeTruthy()
  }
})

test('no two skins claim the same source id', () => {
  const seen = new Map<string, string>()
  for (const f of files) {
    const doc = JSON.parse(readFileSync(DIR + f, 'utf8')) as PoseSkinDoc
    for (const s of doc.sources) {
      expect(seen.has(s) ? `${s} in ${seen.get(s)} AND ${f}` : '').toBe('')
      seen.set(s, f)
    }
  }
})

test('legacy charm-critical durations survived extraction exactly', () => {
  const k = table.keyframes
  expect(k.fightshift.duration).toBe(2.6)
  expect(k.fswing.duration).toBe(2.6)
  expect(k.fjab.ease).toBe('cubic-bezier(.3,.05,.35,1)')
  expect(k.bobw.duration).toBe(0.8)
  expect(k.idlesway.duration).toBe(3.2)
  expect(k.tuckspin.duration).toBe(0.5)
  expect(k.tuckspin.ease).toBe('linear')
  expect(k.sprayjit.duration).toBe(0.3)
})
