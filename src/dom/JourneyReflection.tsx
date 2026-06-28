/**
 * The Arrival's closing illumination — the codex reflecting the reader's path
 * back to them (brief §III.V / §4.5). What it shows depends on what they found
 * and whether they've descended before. A quiet Reset returns the codex to a
 * stranger (privacy + repeat-visit testing).
 */
import { useJourneyStore } from '@/state/journeyStore'
import { useDiscoveryStore } from '@/state/discoveryStore'
import { CONTENT } from '@/content/depths'

const TOTAL_ILLUMINATIONS = Object.values(CONTENT).reduce(
  (n, c) => n + c.blocks.filter((b) => b.kind === 'aside').length,
  0,
)

export function JourneyReflection() {
  const visits = useJourneyStore((s) => s.visits)
  const foundPersisted = useJourneyStore((s) => s.illuminationsFound)
  const foundSession = useDiscoveryStore((s) => s.found)
  const found = new Set([...foundPersisted, ...foundSession]).size

  const reset = () => {
    useJourneyStore.getState().reset()
    // clear the per-element floors and re-darken the margins
    if (typeof window !== 'undefined') window.location.reload()
  }

  return (
    <div className="reflection reveal">
      <p>You took up the torch and went all the way down.</p>
      <p>
        Of the {TOTAL_ILLUMINATIONS} illuminations hidden in the margins, you found{' '}
        <strong>{found}</strong>
        {found === TOTAL_ILLUMINATIONS ? ' — all of them.' : '.'}
      </p>
      {visits > 1 ? (
        <p className="reflection-return">
          You have descended {visits} times. The embers you kindled were still warm.
        </p>
      ) : null}
      <button type="button" className="reflection-reset" onClick={reset}>
        Reset the codex
      </button>
    </div>
  )
}
