// Performance-cue scheduler (L6, Phase 7b). A cue is a NON-MOVEMENT performance beat
// (`say` / `sfx` / `camera` / `strikePose` / `playClip`) anchored to an intent
// MILESTONE rather than an absolute time — this is what replaces the legacy
// compile-to-absolute-time cue scheduler. When the milestone fires on the character's
// event bus, the cue's intent runs CONCURRENTLY with the ongoing movement (it never
// enters the behavior's step sequence, so it cannot pause the move).
//
// ── MILESTONE → 7a EVENT MAPPING (normative; the authoring contract) ───────────────
//   onLaunch → 'jump:launch'   (the tick a jump leaves the ground, marker-synced)
//   onLand   → 'jump:land'     (the tick a jump touches down, before the settle)
//   onArrive → 'intent:arrived' (the movement intent completed at its target)
//   onBlocked→ 'intent:blocked' (the movement intent was stopped by geometry)
// NOTE: the plan's prose also lists `onStart → intent:start`, but the CLOSED schema
// `Milestone` set (schema/behavior.ts MILESTONES) is exactly the four above — adding
// `onStart` would widen a closed set and needs owner sign-off, so it is intentionally
// NOT schedulable as a cue milestone here. (Flagged in the phase report.)

import type { Cue, Intent, Milestone } from '@dash/schema'
import type { EventBus } from './events'

/** Milestone → the 7a locomotion bus event that fires it. */
export const MILESTONE_EVENTS: Record<Milestone, string> = {
  onLaunch: 'jump:launch',
  onLand: 'jump:land',
  onArrive: 'intent:arrived',
  onBlocked: 'intent:blocked',
}

export interface CueSchedulerDeps {
  events: EventBus
  characterId: string
  /** The running behavior's cues (re-read each fire so a behavior swap is picked up). */
  cues: () => readonly Cue[]
  /** A behavior is currently running (cues only fire during a live behavior). */
  running: () => boolean
  /** Execute a cue's intent concurrently (say sets the speech bubble; the rest trace). */
  execCue: (intent: Intent, milestone: Milestone) => void
}

export interface CueScheduler {
  dispose(): void
}

/** Subscribe a cue scheduler to the character's bus. For every milestone event that
 * names THIS character, run each matching cue's intent. Milestones can fire many
 * times in one behavior (e.g. a jump per leg) — each firing runs its cues again,
 * which is exactly the per-milestone flourish semantics. */
export function createCueScheduler(deps: CueSchedulerDeps): CueScheduler {
  const { events, characterId } = deps
  const unsubs: Array<() => void> = []

  for (const [milestone, evt] of Object.entries(MILESTONE_EVENTS) as [Milestone, string][]) {
    unsubs.push(
      events.on(evt, (payload) => {
        if (!deps.running()) return
        // Milestone events carry { characterId, ... } — ignore other characters' events.
        if ((payload as { characterId?: string })?.characterId !== characterId) return
        for (const cue of deps.cues()) {
          if (cue.at === milestone) deps.execCue(cue.do, milestone)
        }
      }),
    )
  }

  return {
    dispose() {
      for (const u of unsubs) u()
      unsubs.length = 0
    },
  }
}
