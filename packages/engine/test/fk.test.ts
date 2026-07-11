import { test, expect } from 'bun:test'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { solveFk } from '../src/fk'
import type { RigTemplate, Pose } from '@dash/schema'
import { POSE_IDS, loadRig, loadPose } from './content'

// ── unit FK on a tiny 3-joint rig, expected positions computed BY HAND ──────────
// Rig: three collinear-capable bones length 10, chained end→end.
// Pose: root at origin, j0 angle 0 (→ +x), j1 angle +π/2 (turn down), j2 angle 0.
//   j0: (0,0) → (10,0)          [world 0]
//   j1: (10,0) → (10,10)        [world π/2, grows from j0 END]
//   j2: (10,10) → (10,20)       [world π/2]
const tinyRig: RigTemplate = {
  id: 'tiny',
  joints: [
    { id: 'j0', parentId: null, length: 10, attach: 'end' },
    { id: 'j1', parentId: 'j0', length: 10, attach: 'end' },
    { id: 'j2', parentId: 'j1', length: 10, attach: 'end' },
  ],
  chains: [],
  secondarySlots: [],
}

const near = (a: number, b: number, tol = 1e-9) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol)

test('FK matches hand-computed positions on a 3-joint rig', () => {
  const pose: Pose = { id: 'p', root: { x: 0, y: 0, rot: 0 }, angles: { j0: 0, j1: Math.PI / 2, j2: 0 } }
  const { bones } = solveFk(tinyRig, pose)
  const [b0, b1, b2] = bones
  near(b0.ox, 0); near(b0.oy, 0); near(b0.ex, 10); near(b0.ey, 0)
  near(b1.ox, 10); near(b1.oy, 0); near(b1.ex, 10); near(b1.ey, 10)
  near(b2.ox, 10); near(b2.oy, 10); near(b2.ex, 10); near(b2.ey, 20)
})

test('root rotation rotates the whole skeleton', () => {
  // root.rot = π/2 turns the initial +x bone to +y (down).
  const pose: Pose = { id: 'p', root: { x: 5, y: 5, rot: Math.PI / 2 }, angles: { j0: 0 } }
  const { bones } = solveFk(tinyRig, pose)
  near(bones[0].ox, 5); near(bones[0].oy, 5); near(bones[0].ex, 5); near(bones[0].ey, 15)
})

test('proportions scale bone length', () => {
  const pose: Pose = { id: 'p', root: { x: 0, y: 0, rot: 0 }, angles: { j0: 0 } }
  const { bones } = solveFk(tinyRig, pose, { proportions: { j0: 2 } })
  near(bones[0].ex, 20) // 10 * 2
})

test("attach:'origin' branches from the parent ORIGIN, not its end", () => {
  const rig: RigTemplate = {
    id: 'branch',
    joints: [
      { id: 'root', parentId: null, length: 10, attach: 'end' },
      { id: 'branchEnd', parentId: 'root', length: 5, attach: 'end' },
      { id: 'branchOrigin', parentId: 'root', length: 5, attach: 'origin' },
    ],
    chains: [],
    secondarySlots: [],
  }
  const pose: Pose = { id: 'p', root: { x: 0, y: 0, rot: 0 }, angles: { root: 0, branchEnd: 0, branchOrigin: 0 } }
  const { bones } = solveFk(rig, pose)
  const end = bones.find((b) => b.id === 'branchEnd')!
  const origin = bones.find((b) => b.id === 'branchOrigin')!
  near(end.ox, 10) // parent END
  near(origin.ox, 0) // parent ORIGIN
})

test('rootTransform overrides pose.root', () => {
  const pose: Pose = { id: 'p', root: { x: 100, y: 100, rot: 0 }, angles: { j0: 0 } }
  const { bones } = solveFk(tinyRig, pose, { rootTransform: { x: 0, y: 0, rot: 0 } })
  near(bones[0].ox, 0); near(bones[0].oy, 0)
})

// ── golden-frame tests (THE GATE): solved joint positions per Dash pose ─────────
// Regenerate with:  REGEN_GOLDENS=1 bun test packages/engine/test/fk.test.ts
const REGEN = process.env.REGEN_GOLDENS === '1'
const GOLDEN_DIR = new URL('./goldens/', import.meta.url)
const TOL_PX = 0.1

interface GoldenBone { id: string; ox: number; oy: number; ex: number; ey: number; worldAngle: number }

const rig = loadRig()

for (const poseId of POSE_IDS) {
  test(`golden frame: ${poseId}`, () => {
    const pose = loadPose(poseId, rig)
    const solved = solveFk(rig, pose)
    const goldenPath = new URL(`${poseId}.json`, GOLDEN_DIR)

    if (REGEN) {
      const rounded = solved.bones.map((b) => ({
        id: b.id,
        ox: Math.round(b.ox * 1e4) / 1e4,
        oy: Math.round(b.oy * 1e4) / 1e4,
        ex: Math.round(b.ex * 1e4) / 1e4,
        ey: Math.round(b.ey * 1e4) / 1e4,
        worldAngle: Math.round(b.worldAngle * 1e6) / 1e6,
      }))
      writeFileSync(goldenPath, JSON.stringify(rounded, null, 2) + '\n')
      return
    }

    if (!existsSync(goldenPath)) throw new Error(`missing golden ${poseId}.json — run REGEN_GOLDENS=1`)
    const golden: GoldenBone[] = JSON.parse(readFileSync(goldenPath, 'utf8'))
    expect(solved.bones.length).toBe(golden.length)
    for (let i = 0; i < golden.length; i++) {
      const g = golden[i]
      const b = solved.bones[i]
      expect(b.id).toBe(g.id)
      for (const key of ['ox', 'oy', 'ex', 'ey'] as const) {
        expect(Math.abs(b[key] - g[key])).toBeLessThanOrEqual(TOL_PX)
      }
    }
  })
}
