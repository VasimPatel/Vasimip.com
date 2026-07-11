import { test, expect } from 'bun:test'
import { createVerletWorld } from '../src/verlet'
import { createSecondary } from '../src/secondary'
import { solveFk } from '../src/fk'
import { rig, stand, props } from './fixtures'

// G4 — no-stretch. During a VIOLENT drag of the character (root flung around + arms/
// neck swung hard, so every secondary bone's FK anchor moves fast), each secondary
// bone's RENDERED length (override end → FK origin) must stay within 0.1% of its rig
// length. This is the hard length-lock working: lag becomes angular, never stretch.
// (The secondary ends are never pinned here — they follow via spring + length-lock;
// pinning a leaf directly is a poke, a different, allowed input.)

const SLOTS = rig.secondarySlots.filter((id) => rig.joints.some((j) => j.id === id))
const rigLen = (id: string): number => rig.joints.find((j) => j.id === id)!.length * (props?.[id] ?? 1)

// A deliberately brutal drive: big fast root translation/rotation + hard arm/neck swings.
function poseAt(t: number): { angles: Record<string, number>; root: { x: number; y: number; rot: number } } {
  const angles = { ...stand.angles }
  angles.upperArmR = stand.angles.upperArmR + 1.8 * Math.sin(t * 0.55)
  angles.upperArmL = stand.angles.upperArmL + 1.8 * Math.sin(t * 0.5 + 1)
  angles.neck = stand.angles.neck + 0.9 * Math.sin(t * 0.7)
  return {
    angles,
    root: { x: 220 * Math.sin(t * 0.5), y: 120 * Math.cos(t * 0.7), rot: 0.6 * Math.sin(t * 0.33) },
  }
}

test('G4 no-stretch: secondary bone rendered length within 0.1% of rig length under violent drag', () => {
  const world = createVerletWorld()
  const secondary = createSecondary(rig, world, { proportions: props, id: 'secondary' })

  let worstRel = 0
  for (let t = 1; t <= 1200; t++) {
    const p = poseAt(t)
    const solved = solveFk(rig, { id: 'v', angles: p.angles }, { proportions: props, rootTransform: p.root })
    secondary.step(solved)
    world.step()
    const ov = secondary.overrides()
    for (const id of SLOTS) {
      const bone = solved.bones.find((b) => b.id === id)!
      const e = ov[id]
      const len = Math.hypot(e.ex - bone.ox, e.ey - bone.oy)
      const rel = Math.abs(len - rigLen(id)) / rigLen(id)
      if (rel > worstRel) worstRel = rel
    }
  }
  console.log(`[G4 no-stretch] worst relative length error = ${(worstRel * 100).toExponential(3)}% (bound 0.1%)`)
  expect(worstRel).toBeLessThan(0.001)
})
