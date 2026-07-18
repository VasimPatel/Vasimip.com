// The ABOUT-page battle: ONE doodle duelist actually fighting Dash for the
// fact sheet. The ENGINE is the choreographer (EngineLayer's exchange director
// cues this scene over battleBus) — every knockback, clash burst, and stagger
// here is an ANSWER to something Dash just did, so the fight reads as call and
// response instead of a looping tableau (owner: the old three-man cycle felt
// "soft, like they're not actually fighting each other"). Dash himself is NOT
// drawn here — he is the live actor at the panel anchor (x≈135, facing left);
// the duelist fights from x≈86, blades meeting between them (~x 114).
import { useEffect, useState } from 'react'
import { battleBus, FOE_ATTACK_CONTACT_MS, type BattleCue } from '../battleBus'

type FoeState = 'idle' | 'gone' | BattleCue

/** After a cue's animation plays out, where the duelist settles. */
const SETTLE: Partial<Record<FoeState, { after: number; to: FoeState }>> = {
  attack: { after: 920, to: 'idle' },
  parried: { after: 580, to: 'idle' },
  staggered: { after: 1020, to: 'idle' },
  kicked: { after: 760, to: 'gone' },
  poofin: { after: 580, to: 'idle' },
}

/** Whole-body animation per state (feet-origin lunges/knockbacks; the kicked
 * tumble spins about his middle instead). */
const BODY_ANIM: Partial<Record<FoeState, string>> = {
  idle: 'foeidle 1.5s ease-in-out infinite',
  attack: 'foeattack .9s cubic-bezier(.4,.05,.35,1)',
  parried: 'foeparried .56s cubic-bezier(.25,.1,.3,1)',
  staggered: 'foestagger 1s cubic-bezier(.3,.1,.3,1)',
  kicked: 'foekicked .75s cubic-bezier(.45,.15,.7,1) forwards',
  poofin: 'foepoofin .56s cubic-bezier(.3,1.45,.45,1)',
}

/** Sword-arm animation per state — the blade menaces, thrusts, and BOUNCES off
 * Dash's parries (origin '0% 100%' of the arm bbox == the shoulder). */
const ARM_ANIM: Partial<Record<FoeState, string>> = {
  idle: 'foearm 1.5s ease-in-out infinite',
  attack: 'foeatkarm .9s cubic-bezier(.4,.05,.35,1)',
  parried: 'foeparryarm .56s cubic-bezier(.25,.1,.3,1)',
  staggered: 'foeparryarm .6s cubic-bezier(.25,.1,.3,1)',
  poofin: 'foearm 1.5s ease-in-out infinite',
}

export default function FightScene() {
  // Presence survives page flips (bus-owned): kicked off on the last visit →
  // he's still gone now, and pops back only when the engine cues 'poofin'.
  const [st, setSt] = useState<{ cue: FoeState; seq: number }>({
    cue: battleBus.foePresent() ? 'idle' : 'gone',
    seq: 0,
  })
  useEffect(() => battleBus.on((c: BattleCue) => setSt((s) => ({ cue: c, seq: s.seq + 1 }))), [])
  useEffect(() => {
    const settle = SETTLE[st.cue]
    if (!settle) return
    const t = window.setTimeout(() => setSt((s) => (s.seq === st.seq ? { ...s, cue: settle.to } : s)), settle.after)
    return () => window.clearTimeout(t)
  }, [st.cue, st.seq])

  const s = st.cue
  const shocked = s === 'staggered' || s === 'kicked'
  const foeOn = s !== 'gone'
  return (
    <svg viewBox="0 0 500 340" width="500" height="340" style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none' }}>
      {/* ground scuff under the melee */}
      <path d="M12,330 q60,6 120,0 q56,-5 116,1 q40,3 80,-1" fill="none" stroke="#1a1a1a" strokeWidth="2.4" strokeLinecap="round" />

      {/* THE DUELIST — root at (86,302), feet on the scuff line, facing Dash */}
      {foeOn && (
        <g transform="translate(86,302)">
          <g
            key={`body-${s}-${st.seq}`}
            style={{
              transformBox: 'fill-box',
              transformOrigin: s === 'kicked' ? '50% 50%' : '50% 100%',
              animation: BODY_ANIM[s],
            }}
          >
            {/* head + the bandit headband (tails trailing off the back) */}
            <circle cx="0" cy="-24" r="11" fill="#fffdf6" stroke="#1a1a1a" strokeWidth="3.2" />
            <path d="M-11,-28 q11,-4.5 22,-1.5" fill="none" stroke="#1a1a1a" strokeWidth="2.8" strokeLinecap="round" />
            <path d="M-10,-28 l-9,1 M-10,-27 l-8,5" fill="none" stroke="#1a1a1a" strokeWidth="2.2" strokeLinecap="round" />
            {shocked ? (
              <g>
                {/* wide eyes + a yelp */}
                <circle cx="-2" cy="-24" r="2.6" fill="none" stroke="#1a1a1a" strokeWidth="1.6" />
                <circle cx="7" cy="-24" r="2.6" fill="none" stroke="#1a1a1a" strokeWidth="1.6" />
                <ellipse cx="3" cy="-16.5" rx="2.2" ry="2.8" fill="#1a1a1a" />
              </g>
            ) : (
              <g>
                {/* angry brows + a grit mouth */}
                <path d="M-7,-30 l7,3 M4,-27 l7,-3" fill="none" stroke="#1a1a1a" strokeWidth="2.2" strokeLinecap="round" />
                <circle cx="-2" cy="-24" r="1.7" fill="#1a1a1a" />
                <circle cx="7" cy="-24" r="1.7" fill="#1a1a1a" />
                <path d="M-1,-17 h7" fill="none" stroke="#1a1a1a" strokeWidth="2" strokeLinecap="round" />
              </g>
            )}
            {/* body */}
            <path d="M0,-13 L0,12" fill="none" stroke="#1a1a1a" strokeWidth="3.6" strokeLinecap="round" />
            {/* off arm swept back for balance */}
            <path d="M0,-6 L-10,3" fill="none" stroke="#1a1a1a" strokeWidth="3.2" strokeLinecap="round" />
            {/* en-garde legs: front foot toward Dash, back foot planted */}
            <path d="M0,12 L9,20 L10,30 l8,2 M0,12 L-9,22 L-12,30 l-7,2" fill="none" stroke="#1a1a1a" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
            {/* sword arm — its own animation so the blade menaces and bounces */}
            <g transform="translate(0,-6)">
              <g
                key={`arm-${s}-${st.seq}`}
                style={{ transformBox: 'fill-box', transformOrigin: '0% 100%', animation: ARM_ANIM[s] }}
              >
                <path d="M0,0 L11,-10" fill="none" stroke="#1a1a1a" strokeWidth="3.2" strokeLinecap="round" />
                <path d="M11,-10 L19,-33" fill="none" stroke="#1a1a1a" strokeWidth="3" strokeLinecap="round" />
                <path d="M8,-17 L18,-13" fill="none" stroke="#1a1a1a" strokeWidth="2.6" strokeLinecap="round" />
              </g>
            </g>
          </g>
        </g>
      )}

      {/* ── exchange effects (keyed by seq so each beat restarts its pop) ── */}
      {s === 'attack' && (
        <g key={`fx-${st.seq}`}>
          {/* his charge speed-lines, then the blades meet on Dash's parry */}
          <g style={{ animation: 'duellines .3s ease-out .1s both' }}>
            <path d="M52,286 h16 M48,296 h20 M54,306 h14" fill="none" stroke="#1a1a1a" strokeWidth="2" strokeLinecap="round" />
          </g>
          <Clash x={114} y={287} text="CLANG!" color="#ffd23f" delayMs={FOE_ATTACK_CONTACT_MS} />
        </g>
      )}
      {s === 'parried' && (
        <g key={`fx-${st.seq}`}>
          <Clash x={112} y={285} text={st.seq % 2 ? 'CLANG!' : 'CLANK!'} color={st.seq % 2 ? '#ffd23f' : '#ff5ca8'} />
          <Swish />
          <FootDust x={72} />
        </g>
      )}
      {s === 'staggered' && (
        <g key={`fx-${st.seq}`}>
          <Clash x={112} y={283} text="WHAM!!" color="#ff5ca8" big />
          <Swish />
          <FootDust x={58} />
        </g>
      )}
      {s === 'kicked' && (
        <g key={`fx-${st.seq}`}>
          <Clash x={96} y={278} text="POW!!" color="#ffd23f" big rise />
          {/* launch trail arcing up after him */}
          <g style={{ animation: 'duellines .5s ease-out .06s both' }}>
            <path d="M84,270 q-14,-38 -36,-64 M96,262 q-4,-40 -20,-70" fill="none" stroke="#1a1a1a" strokeWidth="2" strokeLinecap="round" strokeDasharray="5 6" />
          </g>
          <FootDust x={78} />
        </g>
      )}
      {s === 'poofin' && (
        <g key={`fx-${st.seq}`}>
          {[
            { cx: 70, cy: 322, r: 13, d: 0 },
            { cx: 92, cy: 316, r: 15, d: 0.05 },
            { cx: 82, cy: 296, r: 12, d: 0.1 },
            { cx: 100, cy: 330, r: 10, d: 0.08 },
          ].map((c, i) => (
            <circle
              key={i}
              cx={c.cx}
              cy={c.cy}
              r={c.r}
              fill="#fffdf6"
              stroke="#1a1a1a"
              strokeWidth="2.6"
              style={{ transformBox: 'fill-box', transformOrigin: '50% 50%', animation: `duelsmoke .6s ease-out ${c.d}s both` }}
            />
          ))}
        </g>
      )}
    </svg>
  )
}

/** Impact burst + marker word at the blade-contact point. `delayMs` holds it
 * until the beat's contact moment ('both' fill keeps it hidden before). */
function Clash({ x, y, text, color, delayMs = 0, big = false, rise = false }: { x: number; y: number; text: string; color: string; delayMs?: number; big?: boolean; rise?: boolean }) {
  const k = big ? 1.45 : 1
  return (
    <g style={{ transformBox: 'fill-box', transformOrigin: '50% 50%', animation: `${rise ? 'duelpow' : 'duelclash'} .5s cubic-bezier(.2,.7,.3,1) ${delayMs / 1000}s both` }}>
      <g transform={`translate(${x},${y}) scale(${k}) translate(${-x},${-y})`}>
        <path
          d={`M${x - 6},${y - 8} l3,7 l8,-3 l-4,7 l7,5 l-9,1 l1,9 l-6,-6 l-7,6 l1,-9 l-8,-1 l7,-5 l-4,-7 l8,3 Z`}
          fill={color}
          stroke="#1a1a1a"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </g>
      <text x={x - 36} y={y - 32} fontFamily="Permanent Marker, cursive" fontSize={big ? 19 : 17} fill="#1a1a1a" transform={`rotate(-6 ${x - 36} ${y - 32})`}>
        {text}
      </text>
    </g>
  )
}

/** Swish arcs off Dash's blade as his lunge connects. */
function Swish() {
  return (
    <g style={{ animation: 'duelswish .45s ease-out both' }}>
      <path d="M150,268 q-18,10 -22,30" fill="none" stroke="#1a1a1a" strokeWidth="2" strokeLinecap="round" strokeDasharray="3 5" />
      <path d="M146,278 q-16,8 -19,26" fill="none" stroke="#1a1a1a" strokeWidth="2" strokeLinecap="round" strokeDasharray="3 5" />
    </g>
  )
}

/** A scuff puff where his feet skid on a knockback. */
function FootDust({ x }: { x: number }) {
  return (
    <g style={{ animation: 'duelswish .5s ease-out .05s both' }}>
      <path d={`M${x},330 q6,-7 14,-6 M${x + 4},333 q8,-3 14,-1`} fill="none" stroke="#1a1a1a" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
    </g>
  )
}
