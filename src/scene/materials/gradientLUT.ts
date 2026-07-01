/**
 * The fire-ramp LUT. A single point light has ONE color, so the 4-stop warm
 * falloff (vellum -> gilt -> amber -> ember -> ground) lives in the vellum
 * shader as a 256x1 lookup sampled by normalized distance from the torch.
 *
 * Configured per the renderer's real requirements (the skeptic's must-fix):
 * NO mipmaps (a height-1 mipmapped texture samples BLACK on many drivers),
 * Linear filtering, ClampToEdge, explicit NoColorSpace. We store LINEAR values
 * because the injected `texture2D` call does NO automatic sRGB decode — it must
 * combine directly with three's linear lit result.
 */
import * as THREE from 'three'
import { PALETTE, hexToLinear, type ColorName, type RGB } from '@/lib/palette'
import { lerp, clamp } from '@/lib/damp'
import { LUT_SIZE, LUT_STOPS } from '@/scene/torch/torch.constants'

interface ResolvedStop {
  t: number
  rgb: RGB
}

function sampleStops(stops: ResolvedStop[], t: number): RGB {
  if (t <= stops[0].t) return stops[0].rgb
  const last = stops[stops.length - 1]
  if (t >= last.t) return last.rgb
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i]
    const b = stops[i + 1]
    if (t >= a.t && t <= b.t) {
      const f = (t - a.t) / (b.t - a.t || 1)
      return [lerp(a.rgb[0], b.rgb[0], f), lerp(a.rgb[1], b.rgb[1], f), lerp(a.rgb[2], b.rgb[2], f)]
    }
  }
  return last.rgb
}

/**
 * Build the LUT DataTexture. `coldOverride` replaces the far (>=1.0) stop so a
 * cold depth fades to verdigris while a warm one fades to ink.
 */
export function buildGradientLUT(coldOverride?: ColorName): THREE.DataTexture {
  const resolved: ResolvedStop[] = LUT_STOPS.map((s) => ({
    t: s.t,
    rgb: hexToLinear(PALETTE[coldOverride && s.t >= 0.999 ? coldOverride : s.color]),
  }))

  const data = new Uint8Array(LUT_SIZE * 4)
  for (let i = 0; i < LUT_SIZE; i++) {
    const t = i / (LUT_SIZE - 1)
    const [r, g, b] = sampleStops(resolved, t)
    const o = i * 4
    data[o] = Math.round(clamp(r, 0, 1) * 255)
    data[o + 1] = Math.round(clamp(g, 0, 1) * 255)
    data[o + 2] = Math.round(clamp(b, 0, 1) * 255)
    data[o + 3] = 255
  }

  const tex = new THREE.DataTexture(data, LUT_SIZE, 1, THREE.RGBAFormat, THREE.UnsignedByteType)
  tex.colorSpace = THREE.NoColorSpace // stored linear; sampled raw in injected GLSL
  tex.generateMipmaps = false
  tex.minFilter = THREE.LinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.wrapS = THREE.ClampToEdgeWrapping
  tex.wrapT = THREE.ClampToEdgeWrapping
  tex.needsUpdate = true
  return tex
}
