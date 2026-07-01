/**
 * A living page — a plane of dancing ink. The ink is a clean GPU shader
 * (inkMaterial), so it renders at full resolution with no canvas/texture
 * artifacts; it flows and swirls over time and gathers toward the torch, which
 * also reveals it from the dark. The ink dances only on the page you're on;
 * neighbours and reduced motion freeze.
 */
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { createInkMaterial, updateInk, INK_CONFIG } from '@/scene/ink/inkMaterial'
import { useTorchStore } from '@/state/torchStore'
import { useUiStore } from '@/state/uiStore'
import { useMotionStore } from '@/state/motionStore'
import { useDescentStore } from '@/state/descentStore'
import { damp } from '@/lib/damp'
import type { DepthId } from '@/lib/depths'

export interface LivingPageProps {
  depthId: DepthId
  index: number
  width?: number
  height?: number
  position?: [number, number, number]
}

export function LivingPage({ depthId, index, width = 7, height = 9, position = [0, 0, 0] }: LivingPageProps) {
  const mesh = useRef<THREE.Mesh>(null!)
  const material = useMemo(() => createInkMaterial(INK_CONFIG[depthId], height / width), [depthId, width, height])

  useEffect(() => () => material.dispose(), [material])

  const local = useMemo(() => new THREE.Vector3(), [])
  const tRef = useRef(0)
  const reading = useRef(0)
  const active = useRef(0)

  useFrame((_, dtRaw) => {
    const dt = Math.min(Math.max(dtRaw, 1 / 240), 1 / 30)
    const s = useTorchStore.getState()
    const reduced = useMotionStore.getState().reduced
    const onPage = Math.abs(index - useDescentStore.getState().position) <= 0.6

    // torch in this page's UV space (accounts for the page-turn hinge). NB the
    // geometry's vUv.y is bottom-up (0 bottom, 1 top), so v rises with local.y —
    // NOT the top-down convention a CanvasTexture would use.
    local.copy(s.poolWorld)
    mesh.current.worldToLocal(local)
    const u = (local.x + width / 2) / width
    const v = (local.y + height / 2) / height
    const onP = Math.abs(local.z) < 0.6 && u > -0.2 && u < 1.2 && v > -0.2 && v < 1.2 ? 1 : 0
    active.current = damp(active.current, onP, 6, dt)
    reading.current = damp(reading.current, useUiStore.getState().readingMode ? 1 : 0, 3.2, dt)

    // the ink dances only on the current page; neighbours + reduced motion freeze
    if (!reduced && onPage) tRef.current += dt

    updateInk(material, {
      time: tRef.current,
      torchU: u,
      torchV: v,
      active: active.current,
      reading: reading.current,
      flicker: s.flicker,
    })
  })

  return (
    <mesh ref={mesh} position={position}>
      <planeGeometry args={[width, height, 1, 1]} />
      <primitive object={material} attach="material" />
    </mesh>
  )
}
