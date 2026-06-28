/**
 * A single lit page. Builds its own albedo, procedural normal+height relief, and
 * fire-ramp LUT once on mount (cached, disposed on unmount), then feeds the
 * shared torch pool/flame positions into the vellum material every frame.
 *
 * The relief generation is synchronous here (reliable, deterministic). The
 * HIGH-tier OffscreenCanvas-worker path is a documented perf upgrade.
 */
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { buildGrainGrid, addInkRelief } from '@/scene/materials/proceduralGrain'
import { buildNormalAndHeight } from '@/scene/materials/heightToNormal'
import { composePage, type PageContent } from '@/scene/materials/composePage'
import { buildGradientLUT } from '@/scene/materials/gradientLUT'
import { createVellumMaterial, updateVellumUniforms } from '@/scene/materials/vellumMaterial'
import { hashStringToSeed } from '@/lib/rng'
import { useTorchStore } from '@/state/torchStore'
import { useUiStore } from '@/state/uiStore'
import { damp } from '@/lib/damp'
import type { ColorName } from '@/lib/palette'

export interface VellumPlaneProps {
  width?: number
  height?: number
  res?: 256 | 512 | 1024
  /** stable seed + program-cache key; one per page */
  seedKey?: string
  /** replaces the LUT's far stop (verdigris in the cold depths) */
  coldOverride?: ColorName
  content?: PageContent
  position?: [number, number, number]
  receiveShadow?: boolean
}

export function VellumPlane({
  width = 7,
  height = 8,
  res = 512,
  seedKey = 'page',
  coldOverride,
  content,
  position = [0, 0, 0],
  receiveShadow = true,
}: VellumPlaneProps) {
  const mesh = useRef<THREE.Mesh>(null!)

  const built = useMemo(() => {
    const seed = hashStringToSeed(seedKey)
    const page = composePage(res, seed, content)
    const grain = buildGrainGrid(res, seed)
    addInkRelief(grain, page.inkGrid, 0.46)
    const { normal, height } = buildNormalAndHeight(res, grain)
    const lut = buildGradientLUT(coldOverride)
    const material = createVellumMaterial({
      albedo: page.albedo,
      normalMap: normal,
      heightMap: height,
      paletteLUT: lut,
      variantKey: seedKey,
    })
    return { page, normal, height, lut, material }
  }, [res, seedKey, coldOverride, content])

  useEffect(() => {
    return () => {
      built.material.dispose()
      built.normal.dispose()
      built.height.dispose()
      built.lut.dispose()
      built.page.dispose()
    }
  }, [built])

  const readingLift = useRef(0)
  useFrame((_, dtRaw) => {
    const dt = Math.min(Math.max(dtRaw, 1 / 240), 1 / 30)
    readingLift.current = damp(readingLift.current, useUiStore.getState().readingMode ? 1 : 0, 3.2, dt)
    const s = useTorchStore.getState()
    updateVellumUniforms(built.material, s.poolWorld, s.flameWorld, mesh.current, s.flicker, readingLift.current)
  })

  return (
    <mesh ref={mesh} position={position} receiveShadow={receiveShadow} material={built.material}>
      <planeGeometry args={[width, height, 1, 1]} />
    </mesh>
  )
}
