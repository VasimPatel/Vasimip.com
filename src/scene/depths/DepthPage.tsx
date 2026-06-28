/**
 * A depth's page on its hinge. As the descent `position` passes this depth, the
 * page turns forward about its top edge — a heavy leaf falling away — so moving
 * between depths reads as turning a page and dropping deeper, not scrolling.
 * The turn accelerates (turn²) like a cover under gravity and is flat (aligned
 * with the torch) once settled. Reduced motion holds it flat.
 */
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { ReactNode } from 'react'
import * as THREE from 'three'
import { DEPTH_Y, type DepthDef } from '@/lib/depths'
import { useDescentStore } from '@/state/descentStore'
import { useMotionStore } from '@/state/motionStore'
import { clamp } from '@/lib/damp'

const PAGE_HALF_HEIGHT = 4.5 // half of the 9-unit page — the hinge sits at the top edge

export function DepthPage({ depth, children }: { depth: DepthDef; children: ReactNode }) {
  const hinge = useRef<THREE.Group>(null!)

  useFrame(() => {
    if (useMotionStore.getState().reduced) {
      hinge.current.rotation.x = 0
      return
    }
    const t = useDescentStore.getState().position - depth.index
    const turn = clamp(t, 0, 1) // 0 = ahead/current, 1 = fully passed
    hinge.current.rotation.x = -turn * turn * 1.55 // accelerating fall, ~-89° when passed
  })

  return (
    <group position={[0, DEPTH_Y[depth.index], 0]} rotation-z={depth.mood.tiltZ ?? 0}>
      <group ref={hinge} position={[0, PAGE_HALF_HEIGHT, 0]}>
        <group position={[0, -PAGE_HALF_HEIGHT, 0]}>{children}</group>
      </group>
    </group>
  )
}
