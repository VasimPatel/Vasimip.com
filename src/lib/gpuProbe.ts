/**
 * Boot capability probe. Buckets the device into a perf tier from the WebGL2
 * renderer string, core count, memory, and pointer type. Conservative by
 * design: when unsure, pick the lighter tier — the descent must never stutter.
 */
import type { PerfTier } from '@/state/perfStore'

export interface GpuProbe {
  webgl2: boolean
  tier: PerfTier
  renderer: string
}

export function probeGpu(): GpuProbe {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return { webgl2: false, tier: 'minimal', renderer: 'ssr' }
  }

  const canvas = document.createElement('canvas')
  const gl = canvas.getContext('webgl2')
  if (!gl) return { webgl2: false, tier: 'minimal', renderer: 'no-webgl2' }

  let renderer = ''
  const dbg = gl.getExtension('WEBGL_debug_renderer_info')
  if (dbg) renderer = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '').toLowerCase()

  const cores = navigator.hardwareConcurrency || 4
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4
  const coarse = window.matchMedia('(hover: none)').matches // touch device

  const weak = /swiftshader|software|llvmpipe|powervr|mali-4|mali-t|mali-g5|adreno\s*(3|4|5)/.test(renderer)
  const strong = /apple|nvidia|geforce|rtx|radeon|\bm[1-9]\b|adreno\s*(7|8)|mali-g7|mali-g[89]/.test(renderer)

  let tier: PerfTier = 'reduced'
  if (weak || mem <= 2 || cores <= 2) tier = 'minimal'
  else if (strong && !coarse) tier = 'high'

  // release the probe context immediately so it doesn't hold a slot against the
  // browser's per-page WebGL context cap (lower on mobile)
  gl.getExtension('WEBGL_lose_context')?.loseContext()

  return { webgl2: true, tier, renderer }
}
