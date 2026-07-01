/**
 * The codex's words, in the shape the DOM expects — DERIVED from the single
 * authoring file `src/content/pages.ts`. To edit the prose, edit THAT file, not
 * this one. (`Block` is re-exported here so existing imports keep working.)
 */
import { DEPTHS, type DepthId } from '@/lib/depths'
import { PAGES, type Block } from './pages'

export type { Block }

export interface DepthContent {
  id: DepthId
  epigraph?: string
  blocks: Block[]
}

export const CONTENT: Record<DepthId, DepthContent> = Object.fromEntries(
  DEPTHS.map((id) => [id, { id, epigraph: PAGES[id].epigraph, blocks: PAGES[id].blocks }]),
) as Record<DepthId, DepthContent>
