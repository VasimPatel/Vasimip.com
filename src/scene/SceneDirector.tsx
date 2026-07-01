/**
 * The book's changing light. Subscribes to the smoothed descent and crossfades
 * each depth's mood — ambient level + color, hemisphere, and fog — so the codex
 * moves from near-total dark (Threshold) through cold verdigris strata (Works,
 * Frontier) to the decisive warm turn (Hearth) and full light (Arrival). The
 * temperature change IS the emotional arc (brief §3, §4.3).
 */
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { DEPTH_LIST, lastDepthIndex } from '@/lib/depths'
import { PALETTE, type ColorName } from '@/lib/palette'
import { useDescentStore } from '@/state/descentStore'
import { useUiStore } from '@/state/uiStore'
import { damp } from '@/lib/damp'

export function SceneDirector() {
  const ambient = useRef<THREE.AmbientLight>(null!)
  const hemi = useRef<THREE.HemisphereLight>(null!)
  const fog = useRef<THREE.FogExp2>(null!)

  const colors = useMemo(() => {
    const out = {} as Record<ColorName, THREE.Color>
    ;(Object.keys(PALETTE) as ColorName[]).forEach((k) => (out[k] = new THREE.Color(PALETTE[k])))
    return out
  }, [])
  const tmpA = useMemo(() => new THREE.Color(), [])
  const tmpG = useMemo(() => new THREE.Color(), [])
  const lift = useRef(0) // reading-mode "lights up", damped for weight

  useFrame((_, dtRaw) => {
    const dt = Math.min(Math.max(dtRaw, 1 / 240), 1 / 30)
    const sd = useDescentStore.getState().position
    const reading = useUiStore.getState().readingMode
    lift.current = damp(lift.current, reading ? 1 : 0, 3.2, dt)

    const i = Math.max(0, Math.min(Math.floor(sd), lastDepthIndex - 1))
    const f = sd - i
    const a = DEPTH_LIST[i].mood
    const b = DEPTH_LIST[i + 1].mood

    if (ambient.current) {
      // lift the whole parchment in reading mode so the ink reads everywhere
      ambient.current.intensity = a.ambient + (b.ambient - a.ambient) * f + lift.current * 0.85
      tmpA.copy(colors[a.ambientColor]).lerp(colors[b.ambientColor], f)
      tmpA.lerp(colors.vellum, lift.current * 0.6) // warm toward parchment as it rises
      ambient.current.color.copy(tmpA)
    }
    if (hemi.current) {
      hemi.current.intensity = 0.05 + lift.current * 0.3
      hemi.current.color.copy(tmpA)
      hemi.current.groundColor.copy(colors.ink)
    }
    if (fog.current) {
      // reading mode thins the fog so nothing stays hidden in haze
      fog.current.density = (a.fogDensity + (b.fogDensity - a.fogDensity) * f) * (1 - lift.current * 0.8)
      tmpG.copy(colors[a.fogColor]).lerp(colors[b.fogColor], f)
      fog.current.color.copy(tmpG)
    }
  })

  return (
    <>
      <ambientLight ref={ambient} intensity={0.04} color={PALETTE.ink} />
      <hemisphereLight ref={hemi} intensity={0.05} color={PALETTE.abyss} groundColor={PALETTE.ink} />
      <fogExp2 ref={fog} attach="fog" args={[PALETTE.ink, 0.06]} />
    </>
  )
}
