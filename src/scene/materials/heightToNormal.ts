/**
 * Height grid -> tangent-space normal map (THREE.DataTexture), computed on the
 * CPU by central differences over a precomputed height grid. One pass, no GPU
 * render target, no coupling to the render loop — deterministic and disposable.
 *
 * (A GPU Sobel pass in a WebGLRenderTarget or an OffscreenCanvas worker is the
 * documented HIGH-tier upgrade if first-mount cost ever shows; the visual
 * result is identical. This path is chosen for reliability.)
 *
 * Normal maps perturb the SHADING normal — they make the highlight crawl, they
 * do not cast shadows (the corrected acceptance criterion). The in-shader bump
 * self-shadow in vellumMaterial supplies the micro-occlusion.
 */
import * as THREE from 'three'

function sample(grid: Float32Array, size: number, x: number, y: number): number {
  // wrap so the page tiles seamlessly under a roaming light
  const xi = ((x % size) + size) % size
  const yi = ((y % size) + size) % size
  return grid[yi * size + xi]
}

export interface NormalMapResult {
  normal: THREE.DataTexture
  /** the raw height, exposed as a single-channel texture for the self-shadow march */
  height: THREE.DataTexture
}

/**
 * @param strength scales the slope -> how pronounced the relief reads. The
 *   material's `normalScale` is the final, tunable lever; this just sets the
 *   encoded baseline.
 */
export function buildNormalAndHeight(
  size: number,
  grid: Float32Array,
  strength = 2.4,
): NormalMapResult {
  const normalData = new Uint8Array(size * size * 4)
  const heightData = new Uint8Array(size * size * 4)

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const hL = sample(grid, size, x - 1, y)
      const hR = sample(grid, size, x + 1, y)
      const hD = sample(grid, size, x, y - 1)
      const hU = sample(grid, size, x, y + 1)

      // tangent-space normal from the slope: n = normalize(-dH/dx, -dH/dy, 1)
      let nx = (hL - hR) * strength
      let ny = (hD - hU) * strength
      const nz = 1
      const inv = 1 / Math.hypot(nx, ny, nz)
      nx *= inv
      ny *= inv
      const nzn = nz * inv

      const o = (y * size + x) * 4
      normalData[o] = Math.round((nx * 0.5 + 0.5) * 255)
      normalData[o + 1] = Math.round((ny * 0.5 + 0.5) * 255)
      normalData[o + 2] = Math.round((nzn * 0.5 + 0.5) * 255)
      normalData[o + 3] = 255

      const h8 = Math.round(grid[y * size + x] * 255)
      heightData[o] = h8
      heightData[o + 1] = h8
      heightData[o + 2] = h8
      heightData[o + 3] = 255
    }
  }

  const normal = new THREE.DataTexture(normalData, size, size, THREE.RGBAFormat, THREE.UnsignedByteType)
  normal.colorSpace = THREE.NoColorSpace // raw data, never sRGB-decoded
  normal.wrapS = normal.wrapT = THREE.RepeatWrapping
  normal.minFilter = THREE.LinearMipmapLinearFilter
  normal.magFilter = THREE.LinearFilter
  normal.generateMipmaps = true // size is power-of-two (256/512/1024)
  normal.anisotropy = 4 // helps the grazing rim stay crisp
  normal.needsUpdate = true

  const height = new THREE.DataTexture(heightData, size, size, THREE.RGBAFormat, THREE.UnsignedByteType)
  height.colorSpace = THREE.NoColorSpace
  height.wrapS = height.wrapT = THREE.RepeatWrapping
  height.minFilter = THREE.LinearFilter
  height.magFilter = THREE.LinearFilter
  height.generateMipmaps = false
  height.needsUpdate = true

  return { normal, height }
}
