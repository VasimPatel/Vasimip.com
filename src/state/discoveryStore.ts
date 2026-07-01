/**
 * Hidden illuminations found this session. The torch lingering over a margin
 * latches its id here; the Arrival reflects them back, and journey memory keeps
 * them lit on return (brief §4.2/§4.5). Transient — journeyStore persists.
 */
import { create } from 'zustand'

export interface DiscoveryStore {
  found: ReadonlySet<string>
  discover: (id: string) => void
  has: (id: string) => boolean
}

export const useDiscoveryStore = create<DiscoveryStore>((set, get) => ({
  found: new Set<string>(),
  discover: (id) => {
    if (get().found.has(id)) return
    const next = new Set(get().found)
    next.add(id)
    set({ found: next })
  },
  has: (id) => get().found.has(id),
}))
