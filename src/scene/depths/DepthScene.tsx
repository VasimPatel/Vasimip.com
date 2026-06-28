/**
 * Generic 3D side of a depth: a lit page on its turning hinge. When the boot
 * probe says the device can take it, the page is ALIVE — a per-depth inked story
 * plays on it (LivingPage). Otherwise it's the static vellum page. The choice is
 * boot-fixed and the page sizes are constants, so the live perf watchdog can
 * shed bloom/shadows for frame-rate WITHOUT ever remounting or killing the scene.
 */
import { VellumPlane } from '@/scene/VellumPlane'
import { LivingPage } from '@/scene/LivingPage'
import { DepthPage } from './DepthPage'
import { usePerfStore } from '@/state/perfStore'
import type { DepthDef } from '@/lib/depths'
import type { PageContent } from '@/scene/materials/composePage'

export const PAGE_CONTENT: PageContent = { lines: 0, border: true, dropCap: true, flourish: true }

export function DepthScene({ depth }: { depth: DepthDef }) {
  const games = usePerfStore((s) => s.games)
  return (
    <DepthPage depth={depth}>
      {games ? (
        <LivingPage depthId={depth.id} index={depth.index} width={7} height={9} />
      ) : (
        <VellumPlane
          seedKey={depth.id}
          res={256}
          coldOverride={depth.mood.rampCold}
          content={PAGE_CONTENT}
          width={7}
          height={9}
        />
      )}
    </DepthPage>
  )
}
