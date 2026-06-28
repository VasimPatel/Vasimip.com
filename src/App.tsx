import { useEffect, useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { useTorchInput } from '@/scene/torch/useTorchInput'
import { useDescent } from '@/hooks/useDescent'
import { useDescentDom } from '@/hooks/useDescentDom'
import { useTorchReveal } from '@/hooks/useTorchReveal'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { useJourney } from '@/hooks/useJourney'
import { CodexScene } from '@/scene/CodexScene'
import { Codex } from '@/dom/Codex'
import { DescentHud } from '@/dom/DescentHud'
import { ReadingModeToggle } from '@/dom/ReadingModeToggle'
import { usePerfStore } from '@/state/perfStore'
import { useUiStore } from '@/state/uiStore'
import { probeGpu } from '@/lib/gpuProbe'
import { TORCH } from '@/scene/torch/torch.constants'

/**
 * One persistent fixed <Canvas> (the torch-lit scene) behind the DOM codex. The
 * descent is DISCRETE — wheel/keys/touch/the HUD move you one depth at a time
 * with a choreographed plunge; the page never free-scrolls. The torch follows
 * the cursor; prose reveals where the light falls, with reading mode as the
 * backstop. No-WebGL devices fall back to a plain, readable dark page.
 */
export default function App() {
  const probe = useMemo(() => probeGpu(), [])

  useTorchInput()
  useDescent()
  useDescentDom()
  useTorchReveal()
  useReducedMotion()
  useJourney()

  useEffect(() => {
    usePerfStore.getState().setProbe(probe.tier, probe.webgl2)
    if (!probe.webgl2 || probe.tier === 'minimal') useUiStore.getState().setReadingMode(true)
    document.documentElement.classList.toggle('no-webgl', !probe.webgl2)
  }, [probe])

  const dpr = usePerfStore((s) => s.flags.dpr)

  return (
    <>
      <a className="skip-link" href="#codex">
        Skip to the text
      </a>

      {probe.webgl2 ? (
        <Canvas
          className="codex-canvas"
          style={{ position: 'fixed', inset: 0, width: '100vw', height: '100dvh', pointerEvents: 'none', touchAction: 'none' }}
          dpr={dpr}
          shadows
          gl={{ antialias: false, alpha: false, powerPreference: 'high-performance', stencil: false }}
          camera={{ position: [0, 0, 6], fov: 38 }}
          onCreated={({ gl }) => {
            gl.toneMappingExposure = TORCH.exposure
            gl.domElement.addEventListener(
              'webglcontextlost',
              (e) => {
                e.preventDefault()
                useUiStore.getState().setReadingMode(true)
              },
              { passive: false },
            )
          }}
        >
          <color attach="background" args={['#0b0e14']} />
          <CodexScene />
        </Canvas>
      ) : null}

      <Codex />
      <DescentHud />
      <ReadingModeToggle />
    </>
  )
}
