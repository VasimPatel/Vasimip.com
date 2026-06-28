/**
 * The spine of the book — the five depths stacked along −Y. Only the active
 * depth and its immediate neighbours are mounted (the mount-window); off-window
 * depths unmount and dispose their generated textures, holding peak GPU memory
 * to ~3 depths (the single biggest mobile-memory lever). The torch, embers, and
 * post live OUTSIDE this group, so they persist as the one constant.
 */
import { useDescentStore } from '@/state/descentStore'
import { DEPTH_LIST } from '@/lib/depths'
import { DepthScene } from './depths/DepthScene'
import { DepthWorks } from './depths/DepthWorks'

export function Spine() {
  const active = useDescentStore((s) => s.depth)
  return (
    <group>
      {DEPTH_LIST.map((d) => {
        if (Math.abs(d.index - active) > 1) return null
        return d.id === 'works' ? (
          <DepthWorks key={d.id} depth={d} />
        ) : (
          <DepthScene key={d.id} depth={d} />
        )
      })}
    </group>
  )
}
