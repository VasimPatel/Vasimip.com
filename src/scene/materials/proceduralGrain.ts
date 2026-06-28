/**
 * Parchment tooth — the fine, irregular height field of real vellum that the
 * grazing torch rakes across. Several octaves of seeded simplex (FBM). This is
 * half of the anti-gradient proof: with this relief, a moving light produces a
 * crawling highlight no radial gradient can fake.
 */
import { createNoise2D } from 'simplex-noise'
import { mulberry32 } from '@/lib/rng'

export interface GrainOptions {
  /** spatial frequency of the coarsest octave (in tiles across the page) */
  baseFrequency?: number
  octaves?: number
  /** how much each finer octave contributes relative to the last */
  persistence?: number
  /** overall height of the tooth, 0..1 */
  amplitude?: number
}

const DEFAULTS: Required<GrainOptions> = {
  baseFrequency: 5.5,
  octaves: 5,
  persistence: 0.55,
  amplitude: 1,
}

/**
 * Fill a size×size Float32Array with the parchment height field in [0,1].
 * One pass of simplex evaluations; the normal map then finite-differences this
 * grid (no re-evaluation), which keeps generation fast enough to do on mount.
 */
export function buildGrainGrid(size: number, seed: number, opts: GrainOptions = {}): Float32Array {
  const { baseFrequency, octaves, persistence, amplitude } = { ...DEFAULTS, ...opts }
  const noise = createNoise2D(mulberry32(seed))
  const grid = new Float32Array(size * size)

  // precompute octave weights, normalized so the sum is 1
  const freqs: number[] = []
  const amps: number[] = []
  let amp = 1
  let ampSum = 0
  for (let o = 0; o < octaves; o++) {
    freqs.push(baseFrequency * Math.pow(2, o))
    amps.push(amp)
    ampSum += amp
    amp *= persistence
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size
      const v = y / size
      let h = 0
      for (let o = 0; o < octaves; o++) {
        // (n in -1..1) -> 0..1
        h += amps[o] * (noise(u * freqs[o], v * freqs[o]) * 0.5 + 0.5)
      }
      grid[y * size + x] = (h / ampSum) * amplitude
    }
  }
  return grid
}

/**
 * Add ink/illustration relief into an existing height grid. Dark ink reads as a
 * slightly RAISED ridge (a debossed-press, letterpress-into-vellum feel), so
 * letters and figures catch the grazing light and self-shadow at their edges.
 *
 * `inkLuminance` is a size×size array in [0,1] where 1 = full ink coverage.
 */
export function addInkRelief(
  grain: Float32Array,
  inkLuminance: Float32Array,
  inkAmplitude = 0.6,
): Float32Array {
  const n = grain.length
  for (let i = 0; i < n; i++) {
    grain[i] = Math.min(1, grain[i] * (1 - inkAmplitude) + inkLuminance[i] * inkAmplitude)
  }
  return grain
}
