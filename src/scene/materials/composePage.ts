/**
 * Compose a page's albedo onto an offscreen canvas and derive its ink-coverage
 * grid for relief. The CRISP, readable text is the DOM layer (a11y/SEO); the
 * canvas ink is low-resolution decorative relief — ruled lines, an illuminated
 * initial, a marginal flourish — present only to CATCH the grazing light.
 *
 * Drawn with vector strokes (not web fonts) so it never races font loading and
 * always produces relief. Seeded, so a page looks identical every mount.
 */
import * as THREE from 'three'
import { PALETTE, hexToRgb } from '@/lib/palette'
import { mulberry32 } from '@/lib/rng'

export interface PageContent {
  /** warm dark ink (never pure black) */
  inkColor?: string
  /** rows of text-like strokes */
  lines?: number
  dropCap?: boolean
  border?: boolean
  flourish?: boolean
}

export interface ComposedPage {
  albedo: THREE.CanvasTexture
  /** size×size ink coverage in [0,1] (0 = bare vellum, 1 = full ink) */
  inkGrid: Float32Array
  size: number
  dispose: () => void
}

const INK_DEFAULT = '#2A2014' // warm sepia-brown ink

export function composePage(size: number, seed: number, content: PageContent = {}): ComposedPage {
  const { inkColor = INK_DEFAULT, lines = 19, dropCap = true, border = true, flourish = true } = content
  const rand = mulberry32(seed)

  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!

  // ---- vellum base + subtle mottle so even bare page has tonal life --------
  ctx.fillStyle = PALETTE.vellum
  ctx.fillRect(0, 0, size, size)
  for (let i = 0; i < 28; i++) {
    const r = size * (0.08 + rand() * 0.22)
    const x = rand() * size
    const y = rand() * size
    const dark = rand() > 0.5
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    const a = 0.015 + rand() * 0.03
    g.addColorStop(0, dark ? `rgba(90,70,40,${a})` : `rgba(255,245,220,${a})`)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, size, size)
  }

  const pad = size * 0.1
  const colLeft = pad
  const colRight = size - pad
  const colW = colRight - colLeft

  ctx.fillStyle = inkColor
  ctx.strokeStyle = inkColor

  // ---- ruled border (double rule, the manuscript frame) --------------------
  if (border) {
    ctx.lineWidth = Math.max(1, size * 0.0035)
    ctx.strokeRect(pad * 0.7, pad * 0.7, size - pad * 1.4, size - pad * 1.4)
    ctx.lineWidth = Math.max(1, size * 0.0014)
    ctx.strokeRect(pad * 0.82, pad * 0.82, size - pad * 1.64, size - pad * 1.64)
  }

  // ---- illuminated initial (a raised gilt block with an inner void) --------
  const capSize = size * 0.14
  const capX = colLeft
  const capY = pad * 1.3
  if (dropCap) {
    ctx.fillStyle = PALETTE.gilt
    roundRect(ctx, capX, capY, capSize, capSize, capSize * 0.12)
    ctx.fill()
    ctx.fillStyle = inkColor
    // a simple inner stroke motif so the cap has internal relief
    ctx.lineWidth = capSize * 0.1
    ctx.strokeStyle = inkColor
    ctx.beginPath()
    ctx.moveTo(capX + capSize * 0.3, capY + capSize * 0.78)
    ctx.lineTo(capX + capSize * 0.3, capY + capSize * 0.22)
    ctx.lineTo(capX + capSize * 0.7, capY + capSize * 0.78)
    ctx.lineTo(capX + capSize * 0.7, capY + capSize * 0.22)
    ctx.stroke()
  }

  // ---- text-like strokes: rows of short ink dashes (justified-ish) ---------
  ctx.fillStyle = inkColor
  const lineH = (size - pad * 2.6) / lines
  const glyphH = lineH * 0.2 // finer strokes — script, not blinds
  let y = pad * 1.3
  for (let li = 0; li < lines; li++) {
    const wrapsCap = dropCap && li < 4
    let x = wrapsCap ? capX + capSize + size * 0.02 : colLeft
    const rowRight = colRight - rand() * colW * 0.16 // ragged right
    // break each line into a few words with real gaps, not a solid bar
    while (x < rowRight) {
      const word = glyphH * (1.4 + rand() * 4.5)
      const space = glyphH * (0.9 + rand() * 0.9)
      if (x + word > rowRight) break
      // a word is several short strokes, leaving micro-gaps the light catches
      let gx = x
      const end = x + word
      while (gx < end) {
        const stroke = glyphH * (0.5 + rand() * 1.1)
        if (gx + stroke > end) break
        ctx.globalAlpha = 0.55 + rand() * 0.35
        ctx.fillRect(gx, y + (lineH - glyphH) * 0.5, stroke, glyphH)
        gx += stroke + glyphH * (0.18 + rand() * 0.22)
      }
      x += word + space
    }
    ctx.globalAlpha = 1
    y += lineH
  }

  // ---- a marginal flourish (a vine the curious might find) -----------------
  if (flourish) {
    ctx.strokeStyle = PALETTE.gilt
    ctx.lineWidth = Math.max(1, size * 0.0025)
    ctx.beginPath()
    const fx = colRight - size * 0.03
    let fy = pad * 1.4
    ctx.moveTo(fx, fy)
    for (let i = 0; i < 10; i++) {
      const cx = fx + (rand() - 0.5) * size * 0.05
      const cy = fy + size * 0.05
      ctx.quadraticCurveTo(cx + (rand() - 0.3) * size * 0.04, fy + size * 0.025, cx, cy)
      fy = cy
    }
    ctx.stroke()
  }

  // ---- derive ink coverage from luminance vs the vellum base ---------------
  const img = ctx.getImageData(0, 0, size, size).data
  const [vr, vg, vb] = hexToRgb(PALETTE.vellum)
  const vellumLum = 0.299 * vr + 0.587 * vg + 0.114 * vb
  const inkGrid = new Float32Array(size * size)
  for (let p = 0; p < size * size; p++) {
    const o = p * 4
    const lum = (0.299 * img[o] + 0.587 * img[o + 1] + 0.114 * img[o + 2]) / 255
    // darker than vellum => ink coverage; gilt (brighter) reads as faint relief too
    const cover = Math.max((vellumLum - lum) / vellumLum, (lum - vellumLum) * 0.35)
    inkGrid[p] = Math.min(1, Math.max(0, cover))
  }

  const albedo = new THREE.CanvasTexture(canvas)
  albedo.colorSpace = THREE.SRGBColorSpace
  albedo.anisotropy = 4
  albedo.needsUpdate = true

  return {
    albedo,
    inkGrid,
    size,
    dispose: () => {
      albedo.dispose()
    },
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}
