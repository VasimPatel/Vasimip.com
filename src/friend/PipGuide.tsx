// ─────────────────────────────────────────────────────────────────────────────
// PIP, TOUR GUIDE — the judging bird from the notebook, perched at the top
// right of the friend builder with "click me if you're confused." Click him
// and he flies section to section explaining the whole flow (and where a
// submission ends up); click him again for the next stop. Owner request:
// friends were getting lost.
//
// Positioning is ABSOLUTE in document coordinates (the builder is a normal
// scrolling page): each step scrolls its section into view and Pip glides to
// its top-right corner via a CSS top/left transition, wings flapping harder
// while airborne. Art borrowed from the site's PipSnark bird.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from 'react'

interface TourStep {
  /** Substring of the .fr-sec-h heading this stop anchors to. */
  find: string
  text: string
}

const TOUR: TourStep[] = [
  {
    find: 'YOUR PANEL',
    text: "this is YOUR panel — a real square of the notebook. ✏️ draw scribbles right in it, “+ words” adds captions, and the black corner resizes it.",
  },
  {
    find: 'PUT IT ON THE PAGE',
    text: "this is the ACTUAL scrapbook page your panel gets glued onto. drag it wherever you like. four panels fill a page, then the book grows a new one.",
  },
  {
    find: 'DASH AT YOUR PANEL',
    text: "Dash is the stick hero who lives in this book. pick what he does when he visits your panel — and what he says. he WILL keep saying it.",
  },
  {
    find: 'HOW DASH GETS THERE',
    text: "choose how he travels to you — walk, vault, swing… or press the pink button and TEACH HIM YOUR OWN STUNT. (i judge all stunts. professionally.)",
  },
  {
    find: 'SEE IT LIVE',
    text: "this preview is the REAL notebook with your panel already glued in. tap ▶ and watch him arrive. go on, try it.",
  },
  {
    find: 'SIGN & SEND',
    text: "sign your name and send. it lands on Vasim's desk for approval, then your panel is glued into the SCRAPBOOK pages at the back of the book — and your name goes in the GUEST LOG. forever. no pressure.",
  },
]

const IDLE_TEXT = 'click me if you’re confused.'
const DONE_TEXT = 'that’s the tour!! now draw something worthy of the scrapbook.'

type Phase = { kind: 'perch' } | { kind: 'step'; i: number } | { kind: 'done' }

const PERCH = { top: 66, right: 22 }

export default function PipGuide() {
  const [phase, setPhase] = useState<Phase>({ kind: 'perch' })
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null) // null → perch (right-anchored)
  const [flying, setFlying] = useState(false)
  const [bubble, setBubble] = useState<string | null>(IDLE_TEXT)
  const timers = useRef<number[]>([])
  const at = (ms: number, fn: () => void): void => {
    timers.current.push(window.setTimeout(fn, ms))
  }
  useEffect(() => () => { for (const t of timers.current) window.clearTimeout(t) }, [])

  const targetFor = (i: number): { top: number; left: number } | null => {
    const sec = [...document.querySelectorAll('.fr-sec')].find((el) =>
      el.querySelector('.fr-sec-h')?.textContent?.includes(TOUR[i].find))
    if (!sec) return null
    const r = sec.getBoundingClientRect()
    return {
      top: r.top + window.scrollY - 34,
      left: Math.max(8, r.right + window.scrollX - 86),
    }
  }

  const flyTo = useCallback((i: number) => {
    const t = targetFor(i)
    if (!t) return
    setBubble(null)
    setFlying(true)
    setPos(t)
    const sec = [...document.querySelectorAll('.fr-sec')].find((el) =>
      el.querySelector('.fr-sec-h')?.textContent?.includes(TOUR[i].find))
    sec?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    at(1050, () => {
      setFlying(false)
      setBubble(TOUR[i].text)
    })
  }, [])

  const advance = useCallback(() => {
    if (phase.kind === 'perch') {
      setPhase({ kind: 'step', i: 0 })
      flyTo(0)
      return
    }
    if (phase.kind === 'step') {
      const next = phase.i + 1
      if (next < TOUR.length) {
        setPhase({ kind: 'step', i: next })
        flyTo(next)
        return
      }
      // tour over: last words, then glide home and go back to idling
      setPhase({ kind: 'done' })
      setBubble(DONE_TEXT)
      at(3400, () => {
        setBubble(null)
        setFlying(true)
        setPos(null)
        window.scrollTo({ top: 0, behavior: 'smooth' })
        at(1100, () => {
          setFlying(false)
          setBubble(IDLE_TEXT)
          setPhase({ kind: 'perch' })
        })
      })
      return
    }
  }, [phase, flyTo])

  const skip = (e: React.MouseEvent): void => {
    e.stopPropagation()
    setPhase({ kind: 'perch' })
    setPos(null)
    setFlying(false)
    setBubble(IDLE_TEXT)
  }

  const style: React.CSSProperties = pos
    ? { top: pos.top, left: pos.left }
    : { top: PERCH.top, right: PERCH.right }

  return (
    <div
      className={`pip-guide${flying ? ' flying' : ''}`}
      style={style}
      onClick={advance}
      role="button"
      aria-label="Pip the tour guide"
      title={phase.kind === 'perch' ? 'a guided tour, from a bird' : 'next'}
    >
      {bubble && (
        <div className="pip-bubble">
          {bubble}
          {phase.kind === 'step' && <span className="pip-hint">tap me for the next bit ({phase.i + 1}/{TOUR.length})</span>}
          {phase.kind !== 'perch' && <span className="pip-skip" onClick={skip} title="end the tour">✕</span>}
        </div>
      )}
      <svg viewBox="0 0 60 50" width="66" height="55" style={{ overflow: 'visible' }}>
        <circle cx="30" cy="24" r="9.5" fill="#fffdf6" stroke="#1a1a1a" strokeWidth="2.6" />
        <path d="M25,21 h5" stroke="#1a1a1a" strokeWidth="2" strokeLinecap="round" />
        <path d="M39,22 l9,3 l-9,3 Z" fill="#ffd23f" stroke="#1a1a1a" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M27,32 v10 M33,32 v10" stroke="#1a1a1a" strokeWidth="2" strokeLinecap="round" />
        <g className="pip-wing" style={{ transformBox: 'fill-box', transformOrigin: '100% 50%' }}>
          <path d="M28,24 q-10,-8 -14,-2 q4,5 14,4" fill="#fffdf6" stroke="#1a1a1a" strokeWidth="2" />
        </g>
      </svg>
    </div>
  )
}
