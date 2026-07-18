// The duel wire (ABOUT-page sword fight): the ENGINE choreographs the battle —
// EngineLayer picks each exchange and cues the FightScene's doodle duelist so
// he actually answers Dash blow for blow (the old scene ran a fixed CSS cycle
// the engine only decorated; the owner read it as "not actually fighting").
// Module singleton on purpose: the scene is a registry component the imperative
// layer can't reach through props, and foe presence must survive page flips
// (kicked off on THIS visit → still gone when Dash wanders back NEXT visit,
// so the poof-in re-entrance can play).

/** What the duelist does next. 'kicked'/'poofin' also flip his presence. */
export type BattleCue =
  /** He winds up and lunges at Dash — contact at FOE_ATTACK_CONTACT_MS. */
  | 'attack'
  /** Dash's lunge lands on his blade — knocked back a step, springs back. */
  | 'parried'
  /** Dash's lunge lands HARD — big stagger, wobble, back into stance. */
  | 'staggered'
  /** Dash boots him — launched up and off the top of the page. */
  | 'kicked'
  /** Smoke pop: he's back, sword first. */
  | 'poofin'

// ── shared beat timings (the scene's keyframes and the engine's reaction
//    scheduling must agree on contact moments) ─────────────────────────────────
/** foeattack runs 900ms; blades meet at ~42% — Dash's shoved recoil lands here. */
export const FOE_ATTACK_CONTACT_MS = 380
/** battlelunge runs 460ms with its reach at 26% — the foe's knockback cues here. */
export const DASH_LUNGE_CONTACT_MS = 120
/** dashkick snaps the boot out at ~30% of 460ms — the launch cues here. */
export const KICK_CONTACT_MS = 150
/** Full kick beat: departure choreography waits this long before traveling. */
export const KICK_CLEAR_MS = 620
/** The duelist fights from Dash's LEFT (scene-local x 86 vs anchor 135). */
export const FOE_SIDE: -1 | 1 = -1

type Listener = (cue: BattleCue) => void
const listeners = new Set<Listener>()
let foeUp = true

export const battleBus = {
  /** A FightScene is mounted and listening (the battle panel is on stage). */
  live(): boolean {
    return listeners.size > 0
  },
  /** Is the duelist on his feet (not booted off the page)? */
  foePresent(): boolean {
    return foeUp
  },
  /** Fire a cue at the scene. Presence flips here so the engine and any scene
   * mounted LATER agree on it even if no listener saw the cue. */
  cue(c: BattleCue): void {
    if (c === 'kicked') foeUp = false
    else if (c === 'poofin') foeUp = true
    for (const fn of [...listeners]) fn(c)
  },
  on(fn: Listener): () => void {
    listeners.add(fn)
    return () => {
      listeners.delete(fn)
    }
  },
}
