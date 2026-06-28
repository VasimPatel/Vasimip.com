/**
 * The constellation of The Drowned Archive — the catalogue of a flooded library
 * as cold points of light the torch reads off the dark, cluster by cluster. It
 * is procedurally generated and entirely fictional (no external data, no key):
 * stars gathered into a handful of "stacks", each a faint floor-glow that
 * ignites fully where the torch sweeps. Cold stars over the warm pool = the
 * on-brand contrast, and the legibility.
 *
 * One Points draw call, all lighting in the shader from the shared torch pool —
 * the same light that reveals the prose lights the catalogue.
 */
import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useTorchStore } from '@/state/torchStore'
import { mulberry32 } from '@/lib/rng'
import { PALETTE, hexToLinear } from '@/lib/palette'
import { TORCH } from '@/scene/torch/torch.constants'

const VERT = /* glsl */ `
  attribute float aMag;
  attribute float aSize;
  uniform vec3 uTorchPos;
  uniform float uTorchRadius;
  uniform float uPixelRatio;
  uniform float uTime;
  varying float vBright;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    float dist = distance(world.xyz, uTorchPos);
    float reveal = 1.0 - smoothstep(0.0, uTorchRadius, dist);
    float floorGlow = aMag * 0.3;
    float flick = 0.86 + 0.14 * sin(uTime * 2.4 + position.x * 9.0 + position.y * 7.0);
    vBright = clamp(max(floorGlow, reveal) * flick, 0.0, 1.0);
    vec4 mv = viewMatrix * world;
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp(aSize * (0.6 + vBright) * 520.0 * uPixelRatio / max(-mv.z, 0.1), 2.0, 54.0);
  }
`

const FRAG = /* glsl */ `
  uniform vec3 uCold;
  uniform vec3 uLit;
  varying float vBright;
  void main() {
    vec2 uv = gl_PointCoord * 2.0 - 1.0;
    float d = dot(uv, uv);
    if (d > 1.0) discard;
    float soft = 1.0 - d;
    vec3 col = mix(uCold, uLit, vBright);
    vec3 hot = mix(col, vec3(0.85, 0.97, 1.0), smoothstep(0.55, 0.0, d) * (0.45 + 0.55 * vBright));
    float a = soft * soft * (0.4 + 0.95 * vBright);
    gl_FragColor = vec4(hot * (1.0 + vBright * 1.6), a);
  }
`

interface MapUniforms {
  [key: string]: THREE.IUniform
  uTorchPos: { value: THREE.Vector3 }
  uTorchRadius: { value: number }
  uPixelRatio: { value: number }
  uTime: { value: number }
  uCold: { value: THREE.Color }
  uLit: { value: THREE.Color }
}

const CLUSTERS = 6
const PER_CLUSTER = 8

export function LivingMap() {
  const map = useMemo(() => {
    const rand = mulberry32(0x4d20c)
    const n = CLUSTERS * PER_CLUSTER
    const positions = new Float32Array(n * 3)
    const mags = new Float32Array(n)
    const sizes = new Float32Array(n)

    let i = 0
    for (let c = 0; c < CLUSTERS; c++) {
      const ca = (c / CLUSTERS) * Math.PI * 2 + (rand() - 0.5) * 0.5
      const cr = 0.8 + rand() * 1.9
      const cx = Math.cos(ca) * cr
      const cy = Math.sin(ca) * cr * 1.12
      for (let k = 0; k < PER_CLUSTER; k++) {
        positions[i * 3] = cx + (rand() - 0.5) * 1.5
        positions[i * 3 + 1] = cy + (rand() - 0.5) * 1.5
        positions[i * 3 + 2] = 0.25 + rand() * 0.45
        const m = rand() * rand() // skew toward dim — a few bright catalogue stars
        mags[i] = 0.14 + m * 0.86
        sizes[i] = 0.09 + mags[i] * 0.23
        i++
      }
    }

    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    g.setAttribute('aMag', new THREE.BufferAttribute(mags, 1))
    g.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))

    const [cr, cg, cb] = hexToLinear(PALETTE.verdigris)
    const [lr, lg, lb] = hexToLinear('#DCEFEA')
    const uniforms: MapUniforms = {
      uTorchPos: { value: new THREE.Vector3() },
      uTorchRadius: { value: TORCH.worldRadius * 0.95 },
      uPixelRatio: { value: 1 },
      uTime: { value: 0 },
      uCold: { value: new THREE.Color(cr, cg, cb) },
      uLit: { value: new THREE.Color(lr, lg, lb) },
    }

    const mat = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
    })

    const pts = new THREE.Points(g, mat)
    pts.frustumCulled = false
    return { points: pts, uniforms }
  }, [])

  useEffect(() => {
    return () => {
      map.points.geometry.dispose()
      ;(map.points.material as THREE.Material).dispose()
    }
  }, [map])

  useFrame((state, dt) => {
    const u = map.uniforms
    u.uTorchPos.value.copy(useTorchStore.getState().poolWorld)
    u.uTime.value += dt
    u.uPixelRatio.value = state.gl.getPixelRatio()
  })

  return <primitive object={map.points} />
}
