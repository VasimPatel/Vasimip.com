/**
 * The descending camera. Its Y follows `position` — a value GSAP plunges between
 * discrete depths with a heavy power3.inOut, so the move has mass and lands dead
 * (no overshoot). A bounded gaze-nod tips down into the plunge and returns level,
 * adding weight without ever becoming a wobble. dt-clamped so a 0-dt first frame
 * can never poison the camera with NaN.
 */
import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useDescentStore } from '@/state/descentStore'
import { depthYAt } from '@/lib/depths'
import { dampAngle, clamp } from '@/lib/damp'
import { useMotionStore } from '@/state/motionStore'

export function CameraRig() {
  const camera = useThree((s) => s.camera)
  const prevY = useRef(0)
  const nod = useRef(0)

  useFrame((_, dtRaw) => {
    const dt = Math.min(Math.max(dtRaw, 1 / 240), 1 / 30)
    const reduced = useMotionStore.getState().reduced
    const y = depthYAt(useDescentStore.getState().position)
    camera.position.y = y

    if (!reduced) {
      const vel = (y - prevY.current) / dt
      nod.current = dampAngle(nod.current, clamp(-0.0016 * vel, -0.14, 0.14), 6, dt)
      if (!Number.isFinite(nod.current)) nod.current = 0
    } else {
      nod.current = dampAngle(nod.current, 0, 8, dt)
    }
    camera.rotation.x = nod.current
    prevY.current = y
  })

  return null
}
