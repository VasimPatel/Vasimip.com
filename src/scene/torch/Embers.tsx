/**
 * Embers drifting up from the flame — GPU points, all motion in the vertex
 * shader (two uniforms per frame, zero per-particle CPU). Additive, no depth
 * write, sizes kept small (under the mobile ALIASED_POINT_SIZE cap). Counts come
 * from the perf tier; reduced motion freezes them. Parented to the flame so they
 * follow the torch as the one constant.
 */
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { usePerfStore } from '@/state/perfStore'
import { useMotionStore } from '@/state/motionStore'
import { EMBERS } from './torch.constants'
import { PALETTE, hexToLinear } from '@/lib/palette'
import { mulberry32 } from '@/lib/rng'
import { useJourneyStore } from '@/state/journeyStore'

const VERT = /* glsl */ `
  attribute float aSeed;
  attribute float aSpeed;
  attribute float aSize;
  uniform float uTime;
  uniform float uLife;
  uniform float uRise;
  uniform float uDrift;
  uniform float uPixelRatio;
  varying float vAge;
  void main() {
    float t = mod(uTime * aSpeed * 0.5 + aSeed * uLife, uLife);
    float age = t / uLife;
    vAge = age;
    vec3 p = position;
    p.y += t * uRise;
    p.x += sin((uTime + aSeed * 11.0) * 1.3) * uDrift * age;
    p.z += cos((uTime + aSeed * 7.0) * 1.1) * uDrift * age;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float size = aSize * (1.0 - age * 0.55) * 520.0 * uPixelRatio;
    gl_PointSize = clamp(size / max(-mv.z, 0.1), 1.0, 24.0);
  }
`

const FRAG = /* glsl */ `
  uniform vec3 uAmber;
  uniform vec3 uEmber;
  varying float vAge;
  void main() {
    vec2 uv = gl_PointCoord * 2.0 - 1.0;
    float d = dot(uv, uv);
    if (d > 1.0) discard;
    float soft = 1.0 - d;
    vec3 col = mix(uAmber, uEmber, smoothstep(0.0, 1.0, vAge));
    float alpha = soft * soft * smoothstep(0.0, 0.12, vAge) * (1.0 - smoothstep(0.55, 1.0, vAge));
    gl_FragColor = vec4(col * (1.0 + alpha), alpha);
  }
`

export function Embers() {
  const count = usePerfStore((s) => s.flags.embers)
  const matRef = useRef<THREE.ShaderMaterial>(null!)

  const { geometry, uniforms } = useMemo(() => {
    // seed from the reader's journey so a returning reader gets "their" fire
    const rand = mulberry32(useJourneyStore.getState().emberSeed || 0x3b3)
    const positions = new Float32Array(count * 3)
    const seeds = new Float32Array(count)
    const speeds = new Float32Array(count)
    const sizes = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (rand() - 0.5) * 0.28
      positions[i * 3 + 1] = rand() * 0.16
      positions[i * 3 + 2] = (rand() - 0.5) * 0.28
      seeds[i] = rand()
      speeds[i] = EMBERS.riseMin + rand() * (EMBERS.riseMax - EMBERS.riseMin)
      sizes[i] = EMBERS.sizeMin + rand() * (EMBERS.sizeMax - EMBERS.sizeMin)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
    g.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1))
    g.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
    const [ar, ag, ab] = hexToLinear(PALETTE.amber)
    const [er, eg, eb] = hexToLinear(PALETTE.ember)
    const u = {
      uTime: { value: 0 },
      uLife: { value: 4.2 },
      uRise: { value: 0.6 },
      uDrift: { value: EMBERS.drift },
      uPixelRatio: { value: 1 },
      uAmber: { value: new THREE.Color(ar, ag, ab) },
      uEmber: { value: new THREE.Color(er, eg, eb) },
    }
    return { geometry: g, uniforms: u }
  }, [count])

  // the perf watchdog can change `count` mid-session (Embers never unmounts);
  // free the previous geometry's GPU buffers when it does
  useEffect(() => () => geometry.dispose(), [geometry])

  useFrame((state, dt) => {
    if (!matRef.current) return
    if (!useMotionStore.getState().reduced) matRef.current.uniforms.uTime.value += dt
    matRef.current.uniforms.uPixelRatio.value = state.gl.getPixelRatio()
  })

  if (count <= 0) return null
  return (
    <points geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        ref={matRef}
        uniforms={uniforms}
        vertexShader={VERT}
        fragmentShader={FRAG}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  )
}
