/**
 * [PHASE 2] Oracle state stub (brief §4.6). Reserved for the count of questions
 * asked and the conversation thread when the oracle is awakened. Dormant in Core.
 */
import { create } from 'zustand'

export interface OracleStore {
  asked: number
  lastVoice: string | null
  recordQuestion: (voice: string) => void
}

export const useOracleStore = create<OracleStore>((set, get) => ({
  asked: 0,
  lastVoice: null,
  recordQuestion: (voice) => set({ asked: get().asked + 1, lastVoice: voice }),
}))
