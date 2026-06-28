/**
 * The torch — a real positional light, held up-and-to-the-side of where the
 * reader looks so it GRAZES the page (relief shows at pool center, not just the
 * rim). A SpotLight aimed at the lit pool (single 2D shadow map on HIGH, far
 * cheaper than a point light's 6-face cube). A tiny emissive flame core feeds
 * bloom; a small fill point light keeps the flame's immediate surround warm.
 *
 * Writes the shared pool/flame world positions and the flicker factor into
 * torchStore each frame (mutated in place — no React churn). The vellum reads
 * those same values, so the lit pool and the revealed prose are one light.
 */
import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useTorchStore } from '@/state/torchStore'
import { useMotionStore } from '@/state/motionStore'
import { usePerfStore } from '@/state/perfStore'
import { useUiStore } from '@/state/uiStore'
import { useDescentStore } from '@/state/descentStore'
import { TORCH } from './torch.constants'
import { createFlicker } from './flicker'
import { Embers } from './Embers'
import { PALETTE, hexToLinear } from '@/lib/palette'
import { damp } from '@/lib/damp'

interface TorchProps {
  /** z of the page front the torch lights (the lit pool rides on this plane) */
  pageZ?: number
}

export function Torch({ pageZ = 0 }: TorchProps) {
  const rig = useRef<THREE.Group>(null!)
  const spot = useRef<THREE.SpotLight>(null!)
  const target = useRef<THREE.Object3D>(null!)
  const flameMat = useRef<THREE.MeshStandardMaterial>(null!)

  const camera = useThree((s) => s.camera)
  const shadows = usePerfStore((s) => s.flags.shadows)

  const flicker = useMemo(() => createFlicker(), [])
  const readingFactor = useRef(1)
  const flare = useRef(1)
  const raycaster = useMemo(() => new THREE.Raycaster(), [])
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 0, 1), -pageZ), [pageZ])
  const pool = useMemo(() => new THREE.Vector3(0, 0, pageZ), [pageZ])
  const rawHit = useMemo(() => new THREE.Vector3(), [])
  const ndc = useMemo(() => new THREE.Vector2(), [])

  const warmWhite = useMemo(() => {
    const c = new THREE.Color()
    // a soft warm white so the LUT (not the light color) owns the fire ramp
    c.setRGB(1.0, 0.92, 0.82, THREE.SRGBColorSpace)
    return c
  }, [])
  const [er, eg, eb] = useMemo(() => hexToLinear(PALETTE.amber), [])

  useEffect(() => {
    if (spot.current && target.current) spot.current.target = target.current
  }, [])

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 1 / 30)
    const store = useTorchStore.getState()
    const reduced = useMotionStore.getState().reduced
    const time = _.clock.elapsedTime

    // aim (NDC) -> world point on the page plane
    ndc.set(store.aim.x, store.aim.y)
    raycaster.setFromCamera(ndc, camera)
    if (raycaster.ray.intersectPlane(plane, rawHit)) {
      // weighted lag: the torch follows the hand with a little mass
      pool.x = damp(pool.x, rawHit.x, 11, dt)
      pool.y = damp(pool.y, rawHit.y, 11, dt)
      pool.z = pageZ
    }
    store.poolWorld.copy(pool)

    const f = flicker(time, reduced)
    store.flicker = f.factor

    // soften the torch when the lights are raised — a reading lamp, not the sole
    // source — so it doesn't blow out the now-bright page
    const reading = useUiStore.getState().readingMode
    // in reading mode the ambient already lights the whole page, so the torch
    // drops to a soft accent — no double-bright blown-out hot spot over the scene
    readingFactor.current = damp(readingFactor.current, reading ? 0.32 : 1, 3.2, dt)

    // flare during a depth transition — the torch surges as you plunge
    const transitioning = useDescentStore.getState().transitioning
    flare.current = damp(flare.current, transitioning && !reduced ? 1.34 : 1, 4, dt)

    // flame held at an offset from the pool (up + to the side) + sub-perceptual sway
    const fx = pool.x + TORCH.offset.x + f.jitterX
    const fy = pool.y + TORCH.offset.y + f.jitterY
    const fz = pool.z + TORCH.offset.z
    rig.current.position.set(fx, fy, fz)
    store.flameWorld.set(fx, fy, fz)
    target.current.position.copy(pool)

    if (spot.current) {
      spot.current.intensity = f.intensity * readingFactor.current * flare.current
      // creep ~3% warmer on dim troughs
      spot.current.color.copy(warmWhite).offsetHSL(0, f.warm * 0.05, -f.warm * 0.02)
    }
    if (flameMat.current) {
      // dimmer core + softened in reading mode, so the flame glows without
      // blowing out the living scene playing on the page
      flameMat.current.emissiveIntensity = (0.95 + f.factor * 0.4) * readingFactor.current
    }
  })

  return (
    <>
      <group ref={rig}>
        <spotLight
          ref={spot}
          angle={TORCH.angle}
          penumbra={TORCH.penumbra}
          decay={TORCH.decay}
          distance={TORCH.distance}
          intensity={TORCH.intensityBase}
          color={warmWhite}
          castShadow={shadows}
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
          shadow-bias={-0.0012}
          shadow-radius={4}
        />
        {/* flame fill — small, no shadow */}
        <pointLight intensity={TORCH.flameIntensity} distance={TORCH.flameDistance} decay={2} color={warmWhite} />
        {/* the flame core — emissive, feeds bloom */}
        <mesh>
          <sphereGeometry args={[TORCH.flameRadius, 16, 16]} />
          <meshStandardMaterial
            ref={flameMat}
            color={PALETTE.amber}
            emissive={new THREE.Color(er, eg, eb)}
            emissiveIntensity={1.6}
            toneMapped={false}
          />
        </mesh>
        <Embers />
      </group>
      <object3D ref={target} />
    </>
  )
}
