/**
 * Depth II — The Drowned Archive. The lit page on its hinge (alive on capable
 * tiers, static otherwise), plus the constellation: the flooded library's
 * catalogue as a torch-lit star-field laid over the cold verdigris spread. The
 * map isn't a separate widget; it's another illuminated region of the same book.
 */
import { VellumPlane } from '@/scene/VellumPlane'
import { LivingPage } from '@/scene/LivingPage'
import { LivingMap } from '@/scene/map/LivingMap'
import { DepthPage } from './DepthPage'
import { usePerfStore } from '@/state/perfStore'
import { PAGE_CONTENT } from './DepthScene'
import type { DepthDef } from '@/lib/depths'

export function DepthWorks({ depth }: { depth: DepthDef }) {
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
      <LivingMap />
    </DepthPage>
  )
}
