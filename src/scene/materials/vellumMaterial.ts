/**
 * The vellum material — the heart of the torch.
 *
 * A real MeshStandardMaterial (keep three's PBR + shadow chain), extended via
 * onBeforeCompile to inject three things the stock shader can't do:
 *   1. a world-position AND local-position varying (the stock fragment shader
 *      exposes neither by default — the skeptic's must-fix);
 *   2. the warm fire-ramp LUT, sampled by distance from the torch, so a
 *      single-colored light still fades vellum -> gilt -> amber -> ember -> ground;
 *   3. an in-shader bump SELF-SHADOW that marches the height field toward the
 *      torch, darkening the micro-valleys the ink and parchment tooth occlude.
 *
 * (2) gives the fire color; (1)+(3) plus the normal map's grazing highlight are
 * the anti-gradient proof — relief that rakes and self-shadows as the light
 * moves, validated at the CENTER of the pool, not just the rim.
 *
 * Each material gets a unique customProgramCacheKey so per-depth variants never
 * share a program (and so the injected uniforms never collide — the classic
 * onBeforeCompile footgun).
 */
import * as THREE from 'three'
import { PALETTE, hexToLinear } from '@/lib/palette'
import { TORCH } from '@/scene/torch/torch.constants'

export interface VellumUniforms {
  uPaletteLUT: { value: THREE.Texture | null }
  uHeightMap: { value: THREE.Texture | null }
  uTorchPos: { value: THREE.Vector3 } // world space (LUT distance)
  uTorchPosLocal: { value: THREE.Vector3 } // mesh-local (self-shadow march)
  uTorchRadius: { value: number }
  uFlicker: { value: number }
  uWarmStrength: { value: number }
  uSelfShadow: { value: number }
  uHeightScale: { value: number }
  uShadowStep: { value: number }
  uShadowStrength: { value: number }
  uRingColor: { value: THREE.Color }
  uRingStrength: { value: number }
}

export interface VellumMaterial extends THREE.MeshStandardMaterial {
  userData: { codex: { uniforms: VellumUniforms } }
}

let VARIANT = 0

export interface VellumOptions {
  albedo: THREE.Texture
  normalMap: THREE.Texture
  heightMap: THREE.Texture
  paletteLUT: THREE.Texture
  normalScale?: number
  /** unique-per-depth key fragment so program/uniforms don't collide */
  variantKey?: string
}

export function createVellumMaterial(opts: VellumOptions): VellumMaterial {
  const {
    albedo,
    normalMap,
    heightMap,
    paletteLUT,
    normalScale = TORCH.normalScale,
    variantKey = `v${VARIANT++}`,
  } = opts

  const material = new THREE.MeshStandardMaterial({
    map: albedo,
    normalMap,
    normalScale: new THREE.Vector2(normalScale, normalScale),
    color: new THREE.Color(0xffffff),
    roughness: 0.92,
    metalness: 0,
  }) as VellumMaterial

  const [er, eg, eb] = hexToLinear(PALETTE.ember)

  const uniforms: VellumUniforms = {
    uPaletteLUT: { value: paletteLUT },
    uHeightMap: { value: heightMap },
    uTorchPos: { value: new THREE.Vector3(0, 0, 5) },
    uTorchPosLocal: { value: new THREE.Vector3(0, 0, 5) },
    uTorchRadius: { value: TORCH.worldRadius },
    uFlicker: { value: 1 },
    uWarmStrength: { value: 1.05 },
    uSelfShadow: { value: TORCH.selfShadow },
    uHeightScale: { value: 0.55 },
    uShadowStep: { value: 0.014 },
    uShadowStrength: { value: 2.6 },
    uRingColor: { value: new THREE.Color(er, eg, eb) },
    uRingStrength: { value: 0.32 },
  }

  material.userData = { codex: { uniforms } }

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)

    // --- vertex: expose world + local position ---
    shader.vertexShader =
      'varying vec3 vCodexWorldPos;\nvarying vec3 vCodexLocalPos;\n' + shader.vertexShader
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       vCodexLocalPos = transformed;
       vCodexWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
    )

    // --- fragment: declarations + helpers ---
    shader.fragmentShader =
      `
      uniform sampler2D uPaletteLUT;
      uniform sampler2D uHeightMap;
      uniform vec3 uTorchPos;
      uniform vec3 uTorchPosLocal;
      uniform float uTorchRadius;
      uniform float uFlicker;
      uniform float uWarmStrength;
      uniform float uSelfShadow;
      uniform float uHeightScale;
      uniform float uShadowStep;
      uniform float uShadowStrength;
      uniform vec3 uRingColor;
      uniform float uRingStrength;
      varying vec3 vCodexWorldPos;
      varying vec3 vCodexLocalPos;

      // Soft bump self-shadow: march the height field toward the torch in the
      // page's tangent plane. A sample occludes when its slope to us exceeds the
      // light's elevation slope. This is the micro-occlusion a gradient can't fake.
      float codexSelfShadow(vec2 uv, vec3 Llocal) {
        vec2 Lxy = Llocal.xy;
        float llen = length(Lxy);
        if (llen < 1e-3) return 1.0;
        vec2 dir = Lxy / llen;
        float lightSlope = Llocal.z / llen; // tan(elevation)
        float h0 = texture2D(uHeightMap, uv).r * uHeightScale;
        float maxOcc = 0.0;
        for (int i = 1; i <= 8; i++) {
          float t = float(i) * uShadowStep;
          float hs = texture2D(uHeightMap, uv + dir * t).r * uHeightScale;
          float slope = (hs - h0) / t;
          maxOcc = max(maxOcc, slope - lightSlope);
        }
        return clamp(1.0 - maxOcc * uShadowStrength, 0.0, 1.0);
      }
      ` + shader.fragmentShader

    // --- fragment: tint outgoingLight just before it is written ---
    const anchor = shader.fragmentShader.includes('#include <opaque_fragment>')
      ? '#include <opaque_fragment>'
      : '#include <output_fragment>'

    shader.fragmentShader = shader.fragmentShader.replace(
      anchor,
      `
      {
        float d = clamp(length(vCodexWorldPos - uTorchPos) / uTorchRadius, 0.0, 1.0);
        vec3 ramp = texture2D(uPaletteLUT, vec2(d, 0.5)).rgb;

        // self-shadow from the torch's local direction.
        // (three r152+ renames the uv varying per-map; we always set a map, so
        //  vMapUv is declared by <uv_pars_fragment>. There is no generic vUv.)
        vec3 Llocal = uTorchPosLocal - vCodexLocalPos;
        float occ = codexSelfShadow(vMapUv, Llocal);
        outgoingLight *= mix(1.0, occ, uSelfShadow);

        // Ride the fire ramp as a HUE shift that PRESERVES luminance: the warm
        // gold/amber mid-field stays bright, and the physical light falloff (not
        // a darkening multiply) is what fades it to the cool dark. This is what
        // keeps the core reading as lit parchment instead of muddy brown.
        const vec3 LW = vec3(0.2126, 0.7152, 0.0722);
        float lum = dot(outgoingLight, LW);
        float rampLum = max(dot(ramp, LW), 1e-3);
        vec3 tinted = ramp * (lum / rampLum);
        outgoingLight = mix(outgoingLight, tinted, clamp(d * uWarmStrength, 0.0, 1.0));

        // a faint ember rim licking the edge of the pool — gated to where light
        // still falls (lum), so it never rings the empty dark
        float ring = smoothstep(0.62, 0.82, d) * (1.0 - smoothstep(0.82, 0.97, d));
        outgoingLight += uRingColor * ring * uRingStrength * uFlicker * lum;
      }
      ${anchor}`,
    )
  }

  // unique program per material instance => no shared-program uniform collisions
  material.customProgramCacheKey = () => `codex-vellum-${variantKey}`

  return material
}

const _localScratch = new THREE.Vector3()

/**
 * Update the torch-driven uniforms each frame.
 * - `poolWorld` centers the warm LUT under the cursor (where the reader looks);
 * - `flameWorld` is the held-torch source the self-shadow rakes FROM, so relief
 *   shadows away from the offset flame, not radially from the pool center.
 */
export function updateVellumUniforms(
  material: VellumMaterial,
  poolWorld: THREE.Vector3,
  flameWorld: THREE.Vector3,
  mesh: THREE.Object3D,
  flicker: number,
  reading = 0,
  /** scale the in-shader self-shadow — LivingPage nearly flattens it so the
   *  animated scene on the albedo reads cleanly instead of being carved by relief */
  selfShadowScale = 1,
): void {
  const u = material.userData.codex.uniforms
  u.uTorchPos.value.copy(poolWorld)
  // flame position in the mesh's local space, for the tangent-plane march
  u.uTorchPosLocal.value.copy(mesh.worldToLocal(_localScratch.copy(flameWorld)))
  u.uFlicker.value = flicker
  // reading mode flattens the relief and the distance tint (not gone, just
  // calmed) so the lifted parchment reads as an even page, not a blotchy one
  u.uSelfShadow.value = TORCH.selfShadow * (1 - 0.8 * reading) * selfShadowScale
  u.uWarmStrength.value = 1.05 * (1 - 0.55 * reading)
}
