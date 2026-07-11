import { test, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { tryValidateRig } from '@dash/schema'
import { solveTwoBone, solveChainToLocal } from '../src/ik'

const EPSILON = 1e-6

function reconstruct(rootX: number, rootY: number, len1: number, len2: number, angle1: number, angle2: number) {
  const midX = rootX + len1 * Math.cos(angle1)
  const midY = rootY + len1 * Math.sin(angle1)
  return {
    midX,
    midY,
    endX: midX + len2 * Math.cos(angle2),
    endY: midY + len2 * Math.sin(angle2),
  }
}

function expectFiniteAngles(angle1: number, angle2: number) {
  expect(Number.isFinite(angle1)).toBe(true)
  expect(Number.isFinite(angle2)).toBe(true)
  expect(Number.isNaN(angle1)).toBe(false)
  expect(Number.isNaN(angle2)).toBe(false)
}

test('solveTwoBone reaches the target with either bend direction', () => {
  const positive = solveTwoBone(0, 0, 0, 30, 20, 20, 1)
  const negative = solveTwoBone(0, 0, 0, 30, 20, 20, -1)
  const positiveFk = reconstruct(0, 0, 20, 20, positive.angle1, positive.angle2)
  const negativeFk = reconstruct(0, 0, 20, 20, negative.angle1, negative.angle2)

  expect(Math.abs(positiveFk.endX)).toBeLessThanOrEqual(EPSILON)
  expect(Math.abs(positiveFk.endY - 30)).toBeLessThanOrEqual(EPSILON)
  expect(Math.abs(negativeFk.endX)).toBeLessThanOrEqual(EPSILON)
  expect(Math.abs(negativeFk.endY - 30)).toBeLessThanOrEqual(EPSILON)
  expect(Math.sign(positiveFk.midX)).toBe(-Math.sign(negativeFk.midX))
  expectFiniteAngles(positive.angle1, positive.angle2)
  expectFiniteAngles(negative.angle1, negative.angle2)
})

test('solveTwoBone fully extends toward an out-of-reach target', () => {
  const result = solveTwoBone(0, 0, 0, 100, 20, 20, 1)
  const fk = reconstruct(0, 0, 20, 20, result.angle1, result.angle2)
  const reach = Math.hypot(fk.endX, fk.endY)

  expect(Math.abs(reach - 40)).toBeLessThanOrEqual(1e-3)
  expect(Math.abs(fk.endX)).toBeLessThanOrEqual(EPSILON)
  expect(fk.endY).toBeGreaterThan(0)
  expect(Math.abs(result.angle1 - result.angle2)).toBeLessThanOrEqual(EPSILON)
  expectFiniteAngles(result.angle1, result.angle2)
})

test('solveTwoBone clamps a target that is too close', () => {
  const result = solveTwoBone(0, 0, 0, 2, 20, 25, 1)
  const fk = reconstruct(0, 0, 20, 25, result.angle1, result.angle2)
  const reach = Math.hypot(fk.endX, fk.endY)

  expect(Math.abs(reach - 5)).toBeLessThanOrEqual(1e-3)
  expectFiniteAngles(result.angle1, result.angle2)
})

test('solveTwoBone returns finite angles for a zero-length bone', () => {
  const result = solveTwoBone(0, 0, 10, 0, 0, 20, 1)

  expectFiniteAngles(result.angle1, result.angle2)
})

test('solveChainToLocal round-trips the real right-leg chain', () => {
  const parsed = JSON.parse(readFileSync(new URL('../../../content/engine/rig.dash.json', import.meta.url), 'utf8'))
  const validated = tryValidateRig(parsed)
  if (!validated.ok) throw new Error(validated.errors.join('; '))

  const rig = validated.doc
  const chain = rig.chains.find((candidate) => candidate.id === 'legR')
  if (chain === undefined) throw new Error('legR chain not found')

  const rootJoint = rig.joints.find((joint) => joint.id === chain.jointIds[0])!
  const midJoint = rig.joints.find((joint) => joint.id === chain.jointIds[1])!
  const hipX = 100
  const hipY = 50
  const parentWorldAngle = 0.35
  const targetX = 104
  const targetY = 80
  const expected = solveTwoBone(
    hipX,
    hipY,
    targetX,
    targetY,
    rootJoint.length,
    midJoint.length,
    rootJoint.bendHint ?? 1,
  )
  const local = solveChainToLocal(rig, chain, hipX, hipY, parentWorldAngle, targetX, targetY)
  const rootWorldAngle = parentWorldAngle + local.root
  const midWorldAngle = rootWorldAngle + local.mid
  const fk = reconstruct(hipX, hipY, rootJoint.length, midJoint.length, rootWorldAngle, midWorldAngle)

  expect(Math.abs(rootWorldAngle - expected.angle1)).toBeLessThanOrEqual(EPSILON)
  expect(Math.abs(midWorldAngle - expected.angle2)).toBeLessThanOrEqual(EPSILON)
  expect(Math.abs(fk.endX - targetX)).toBeLessThanOrEqual(EPSILON)
  expect(Math.abs(fk.endY - targetY)).toBeLessThanOrEqual(EPSILON)
})
