/**
 * Post — selective bloom on the flame core.
 *
 * Honors the skeptic's must-fixes:
 *  - frameBufferType = HalfFloatType (HDR): the flame's emissive (>1, rendered
 *    toneMapped:false) survives into the buffer so the threshold means something;
 *    without HDR everything clamps at 1.0 and the bloom design is undefined.
 *  - NO postprocessing <ToneMapping> effect: r3f keeps its default ACES on the
 *    renderer (applied in-material), so the vellum is tone-mapped to ≤1 and only
 *    the un-tone-mapped flame clears the luminanceThreshold — no double tone-map,
 *    no vellum blow-out.
 *
 * Mounted only on tiers whose flag says so; on the minimal tier the whole
 * composer is absent (the #1 mobile frame-killer) and the flame falls back to a
 * cheap emissive sprite-glow.
 */
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import * as THREE from 'three'
import { usePerfStore } from '@/state/perfStore'

export function Post() {
  const composer = usePerfStore((s) => s.flags.composer)
  if (!composer) return null
  return (
    <EffectComposer frameBufferType={THREE.HalfFloatType} multisampling={0}>
      <Bloom
        mipmapBlur
        intensity={0.32}
        luminanceThreshold={1.2}
        luminanceSmoothing={0.3}
        radius={0.66}
      />
    </EffectComposer>
  )
}
