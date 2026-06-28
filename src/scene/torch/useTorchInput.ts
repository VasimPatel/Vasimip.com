/**
 * One input path for the torch. Cursor (desktop) writes aim directly; touch and
 * gyro (added later) feed the SAME `setAim`. Window listeners (not the canvas)
 * so the fixed, pointer-events:none canvas never has to capture events and the
 * DOM above stays scrollable and clickable.
 */
import { useEffect } from 'react'
import { useTorchStore } from '@/state/torchStore'

export function useTorchInput(): void {
  const setAim = useTorchStore((s) => s.setAim)

  useEffect(() => {
    // seed an initial aim at screen center so the first page is partly lit
    // before the reader moves (and the reveal isn't stuck at the origin)
    setAim(0, 0.1, window.innerWidth / 2, window.innerHeight * 0.45)

    const move = (clientX: number, clientY: number) => {
      const x = (clientX / window.innerWidth) * 2 - 1
      const y = -((clientY / window.innerHeight) * 2 - 1)
      setAim(x, y, clientX, clientY)
    }
    const onPointer = (e: PointerEvent) => move(e.clientX, e.clientY)
    const onTouch = (e: TouchEvent) => {
      const t = e.touches[0]
      if (t) move(t.clientX, t.clientY)
    }
    window.addEventListener('pointermove', onPointer, { passive: true })
    window.addEventListener('touchmove', onTouch, { passive: true })
    return () => {
      window.removeEventListener('pointermove', onPointer)
      window.removeEventListener('touchmove', onTouch)
    }
  }, [setAim])
}
