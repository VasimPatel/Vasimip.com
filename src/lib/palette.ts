/**
 * The six (seven, counting the ground) named colors of the codex.
 * Framework-agnostic: hex + sRGB/linear helpers, no three import, so the build
 * script, the DataTexture LUT, and the shaders all draw from one source.
 *
 * Cool blue-black ground, a RANGE of fire tones, a verdigris counter. Keep all
 * three relationships or the look collapses into the default "dark AI site".
 */

export const PALETTE = {
  ink: '#0B0E14', // deepest ground — cool blue-black, never flat #000
  abyss: '#141A24', // lifted dark for layering strata
  verdigris: '#2E6E6A', // the cold counter
  vellum: '#EAD9AE', // lit parchment
  gilt: '#C9A227', // illuminated-manuscript gold
  amber: '#FFB347', // torch core / warm reveals
  ember: '#C2551F', // hottest-low embers, deepest falloff

  // ── page substrates (the lit base each page's ink sits on; cool→warm arc) ──
  parchment: '#C6CCB6', // cool verdigris parchment (the drowned archive)
  parchmentCold: '#BCC6B6', // coldest grey-green (the menagerie)
  vellumWarm: '#ECD2A0', // warm vellum (the ember court)
  vellumPale: '#E4DCC0', // pale neutral (the last leaf)
} as const

export type ColorName = keyof typeof PALETTE

export type RGB = [number, number, number]

/** "#RRGGBB" -> [r,g,b] in 0..1 sRGB */
export function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '')
  const n = parseInt(h, 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

/** sRGB channel -> linear (the transfer three uses internally) */
export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

/** "#RRGGBB" -> [r,g,b] in 0..1 linear-light */
export function hexToLinear(hex: string): RGB {
  const [r, g, b] = hexToRgb(hex)
  return [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)]
}

/** named token -> linear RGB */
export function tokenLinear(name: ColorName): RGB {
  return hexToLinear(PALETTE[name])
}
