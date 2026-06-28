/**
 * The descent HUD — a column of depth markers (where you are, how deep you've
 * gone) and a clear "descend" control. Makes the discrete navigation legible:
 * the reader always knows there are five depths and how to move between them.
 * Every marker is a real button (click / keyboard) so navigation isn't gesture-only.
 */
import { useDescentStore } from '@/state/descentStore'
import { DEPTH_LIST, lastDepthIndex } from '@/lib/depths'
import { goTo, descend } from '@/lib/descentNav'

export function DescentHud() {
  const depth = useDescentStore((s) => s.depth)
  const atBottom = depth >= lastDepthIndex

  return (
    <div className="hud">
      <nav className="hud-depths" aria-label="Depths of the codex">
        {DEPTH_LIST.map((d, i) => (
          <button
            key={d.id}
            type="button"
            className={
              'hud-dot' + (i === depth ? ' is-current' : '') + (i < depth ? ' is-passed' : '')
            }
            aria-label={`${d.roman}. ${d.title}`}
            aria-current={i === depth ? 'true' : undefined}
            onClick={() => goTo(i)}
          >
            <span className="hud-dot-roman" aria-hidden="true">
              {d.roman}
            </span>
          </button>
        ))}
      </nav>

      <button
        type="button"
        className="hud-descend"
        onClick={() => descend()}
        disabled={atBottom}
        aria-label={atBottom ? 'You have reached the bottom' : 'Descend to the next depth'}
      >
        <span className="hud-descend-label">{atBottom ? 'the bottom' : 'descend'}</span>
        <span className="hud-descend-chevron" aria-hidden="true" />
      </button>
    </div>
  )
}
