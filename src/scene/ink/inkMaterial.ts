/**
 * The dancing-ink material — a clean, full-resolution GPU shader (no canvas, no
 * stretched texture). Domain-warped flow fields make the ink swirl, gather, and
 * dissolve over time like ink dropped in water; each depth has its own colour,
 * flow direction and energy, so the motion reads as a different "story." The
 * torch swirls and gathers the ink toward itself and reveals it from the dark.
 *
 * Output is composed in linear space and run through three's tonemapping +
 * colour-space chunks so it sits in the same pipeline as the rest of the scene.
 */
import * as THREE from 'three'
import type { DepthId } from '@/lib/depths'

const INK = '#241a0e'
const GROUND = '#0B0E14'

export interface InkConfig {
  /** the depth's accent colour, mixed into the ink and the pool rim */
  mood: string
  /** the lit substrate the ink sits on — warm vellum up top, cooling as you descend */
  base: string
  /** apparent drift direction of the ink */
  flow: [number, number]
  /** how restless the dance is */
  energy: number
  /** spatial frequency of the ink forms */
  scale: number
  /** how dark/dense the ink gets */
  inkAmt: number
}

export const INK_CONFIG: Record<DepthId, InkConfig> = {
  // sparse, calm, rising warm ink at the threshold — warm vellum
  threshold: { mood: '#FFB347', base: '#EAD9AE', flow: [0.0, -0.45], energy: 0.5, scale: 2.5, inkAmt: 0.72 },
  // a cold horizontal current through the drowned archive — cool verdigris parchment
  works: { mood: '#2E6E6A', base: '#C6CCB6', flow: [0.5, -0.08], energy: 0.7, scale: 3.0, inkAmt: 0.86 },
  // the coldest, most restless dance — the menagerie
  frontier: { mood: '#2E6E6A', base: '#BCC6B6', flow: [-0.26, 0.12], energy: 0.98, scale: 3.6, inkAmt: 0.9 },
  // warm ink rising like flame and smoke — the court warms again
  hearth: { mood: '#C2551F', base: '#ECD2A0', flow: [0.0, -0.85], energy: 1.2, scale: 2.4, inkAmt: 0.85 },
  // gilt ink drifting gently down — the last leaf, pale and neutral
  arrival: { mood: '#C9A227', base: '#E4DCC0', flow: [0.12, 0.5], energy: 0.42, scale: 3.0, inkAmt: 0.7 },
}

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

// NB: the renderer's prefix already injects tonemapping_pars + colorspace_pars
// for a toneMapped ShaderMaterial — re-including them here would redefine
// sRGBTransferOETF et al. We only emit the trailing *_fragment chunks.
const FRAG = /* glsl */ `
  varying vec2 vUv;
  uniform float uTime, uTorchActive, uReveal, uReading, uFlicker, uEnergy, uScale, uInkAmt, uAspect;
  uniform vec2 uTorch, uFlow;
  uniform vec3 uInk, uVellum, uGround, uMood;

  float hash(vec2 p) { p = fract(p * vec2(123.34, 345.45)); p += dot(p, p + 34.345); return fract(p.x * p.y); }
  float vnoise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  const mat2 M = mat2(1.62, 1.20, -1.20, 1.62);
  float fbm(vec2 p) { float v = 0.0, a = 0.55; for (int i = 0; i < 4; i++) { v += a * vnoise(p); p = M * p; a *= 0.5; } return v; }
  float ridged(vec2 p) { float v = 0.0, a = 0.55; for (int i = 0; i < 4; i++) { v += a * (1.0 - abs(vnoise(p) * 2.0 - 1.0)); p = M * p; a *= 0.5; } return v; }

  void main() {
    vec2 ac = vec2(vUv.x, vUv.y * uAspect);
    vec2 tor = vec2(uTorch.x, uTorch.y * uAspect);
    float td = distance(ac, tor);

    // swirl the field near the flame — the ink curls around the torch (a gentle
    // dance, not a whirlpool)
    vec2 rel = vUv - uTorch;
    float sw = smoothstep(0.36, 0.0, td) * uTorchActive;
    float ang = sw * 1.25;
    float cs = cos(ang), sn = sin(ang);
    vec2 swuv = uTorch + mat2(cs, -sn, sn, cs) * rel;

    vec2 p = vec2(swuv.x, swuv.y * uAspect) * uScale + uFlow * uTime * 0.35;
    float tt = uTime * (0.1 + uEnergy * 0.16);

    // domain-warped flow — the dancing ink
    vec2 q = vec2(fbm(p + vec2(0.0, tt)), fbm(p + vec2(5.2, 1.3) - vec2(tt, 0.0)));
    float ink = ridged(p + 2.6 * q + vec2(tt * 0.5, 0.0));
    ink = smoothstep(0.42, 0.92, ink) * uInkAmt;

    // ink gathers + intensifies toward the torch (dances into the light)
    ink *= 0.55 + 0.7 * smoothstep(0.5, 0.0, td) * (0.4 + uTorchActive);

    // keep the central reading column lighter so the prose stays legible
    float colSafe = smoothstep(0.0, 0.34, abs(vUv.x - 0.5));
    ink *= mix(0.42, 1.0, colSafe);

    vec3 col = mix(uVellum, uInk, clamp(ink, 0.0, 0.9));
    col = mix(col, uMood, ink * 0.4);

    // reveal: visible near the torch, fading to the dark ground; reading lifts all
    float reveal = max(uReading, 1.0 - smoothstep(uReveal * 0.35, uReveal, td));
    vec3 outc = mix(uGround, col, reveal);

    // a warm/cold rim where the pool meets the dark
    float rim = smoothstep(uReveal * 0.55, uReveal * 0.82, td) * (1.0 - smoothstep(uReveal * 0.82, uReveal, td));
    outc += uMood * rim * 0.28 * uFlicker * (1.0 - uReading * 0.7);

    gl_FragColor = vec4(outc, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

export interface InkUniforms {
  [k: string]: THREE.IUniform
  uTime: { value: number }
  uTorch: { value: THREE.Vector2 }
  uTorchActive: { value: number }
  uReveal: { value: number }
  uReading: { value: number }
  uFlicker: { value: number }
  uInk: { value: THREE.Color }
  uVellum: { value: THREE.Color }
  uGround: { value: THREE.Color }
  uMood: { value: THREE.Color }
  uFlow: { value: THREE.Vector2 }
  uEnergy: { value: number }
  uScale: { value: number }
  uInkAmt: { value: number }
  uAspect: { value: number }
}

export interface InkMaterial extends THREE.ShaderMaterial {
  uniforms: InkUniforms
}

export function createInkMaterial(cfg: InkConfig, aspect = 9 / 7): InkMaterial {
  const uniforms: InkUniforms = {
    uTime: { value: 0 },
    uTorch: { value: new THREE.Vector2(0.5, 0.5) },
    uTorchActive: { value: 0 },
    uReveal: { value: 0.66 },
    uReading: { value: 0 },
    uFlicker: { value: 1 },
    uInk: { value: new THREE.Color(INK) },
    uVellum: { value: new THREE.Color(cfg.base) },
    uGround: { value: new THREE.Color(GROUND) },
    uMood: { value: new THREE.Color(cfg.mood) },
    uFlow: { value: new THREE.Vector2(cfg.flow[0], cfg.flow[1]) },
    uEnergy: { value: cfg.energy },
    uScale: { value: cfg.scale },
    uInkAmt: { value: cfg.inkAmt },
    uAspect: { value: aspect },
  }
  return new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG }) as InkMaterial
}

export interface InkFrame {
  time: number
  torchU: number
  torchV: number
  active: number
  reading: number
  flicker: number
}

export function updateInk(material: InkMaterial, f: InkFrame): void {
  const u = material.uniforms
  u.uTime.value = f.time
  u.uTorch.value.set(f.torchU, f.torchV)
  u.uTorchActive.value = f.active
  u.uReading.value = f.reading
  u.uFlicker.value = f.flicker
}
