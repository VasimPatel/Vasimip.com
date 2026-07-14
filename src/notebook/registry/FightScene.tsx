// The ABOUT-page battle: doodle attackers duel Dash for the fact sheet. One
// shared 3.2s master timeline (matching clanga/clangb's 24%/70% pops) so the
// engine-side battle beats (EngineLayer.scheduleBattle — Dash's lunges) land
// on the same clang moments from a wall-clock phase computation. Dash himself
// is NOT drawn here — he is the live actor standing at the panel anchor
// (x≈135) in the fight skin; this scene arranges the fight AROUND him.
/** A doodle swordsman. Head+brows+body+legs, sword arm with a crossguard. */
function Attacker({ scale = 1, swordUp = true, hideSword = false }: { scale?: number; swordUp?: boolean; hideSword?: boolean }) {
  return (
    <g transform={`scale(${scale})`}>
      <circle cx="0" cy="-24" r="11" fill="#fffdf6" stroke="#1a1a1a" strokeWidth="3.2" />
      {/* angry brows + eyes */}
      <path d="M-7,-30 l7,3 M4,-27 l7,-3" fill="none" stroke="#1a1a1a" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="-2" cy="-24" r="1.7" fill="#1a1a1a" />
      <circle cx="7" cy="-24" r="1.7" fill="#1a1a1a" />
      {/* body */}
      <path d="M0,-13 L0,12" fill="none" stroke="#1a1a1a" strokeWidth="3.6" strokeLinecap="round" />
      {/* sword arm (toward +x) with blade + crossguard */}
      {!hideSword && (swordUp ? (
        <g>
          <path d="M0,-6 L11,-18" fill="none" stroke="#1a1a1a" strokeWidth="3.2" strokeLinecap="round" />
          <path d="M11,-18 L20,-40" fill="none" stroke="#1a1a1a" strokeWidth="3" strokeLinecap="round" />
          <path d="M7,-24 L18,-21" fill="none" stroke="#1a1a1a" strokeWidth="2.6" strokeLinecap="round" />
        </g>
      ) : (
        <g>
          <path d="M0,-6 L12,-4" fill="none" stroke="#1a1a1a" strokeWidth="3.2" strokeLinecap="round" />
          <path d="M12,-4 L30,-8" fill="none" stroke="#1a1a1a" strokeWidth="3" strokeLinecap="round" />
          <path d="M14,-10 L15,1" fill="none" stroke="#1a1a1a" strokeWidth="2.6" strokeLinecap="round" />
        </g>
      ))}
      {/* off arm */}
      <path d="M0,-6 L-10,4" fill="none" stroke="#1a1a1a" strokeWidth="3.2" strokeLinecap="round" />
      {/* legs */}
      <path d="M0,12 L-9,28 l-8,2 M0,12 L10,28 l9,2" fill="none" stroke="#1a1a1a" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
    </g>
  )
}

export default function FightScene() {
  // Lock every 3.2s animation to the WALL CLOCK (negative delay): the engine's
  // battle scheduler computes clang phases from performance.now()%3200, so the
  // cycles must share that origin — a mount-time start would give an arbitrary
  // offset (codex finding: beats only aligned by accident).
  const lock = `${(-((performance.now() % 3200) / 1000)).toFixed(3)}s`
  return (
    <svg viewBox="0 0 500 340" width="500" height="340" style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none' }}>
      {/* ground scuff under the melee */}
      <path d="M12,330 q60,6 120,0 q56,-5 116,1 q40,3 80,-1" fill="none" stroke="#1a1a1a" strokeWidth="2.4" strokeLinecap="round" />

      {/* THE DUELIST — trades blows with Dash at the 24% clang */}
      <g transform="translate(88,300)">
        <g style={{ transformBox: 'fill-box', transformOrigin: '50% 100%', animation: 'duelistlunge 3.2s ease-in-out infinite', animationDelay: lock }}>
          <Attacker />
        </g>
      </g>

      {/* THE QUEUE — charges at 62%, takes the CLANK, goes flying */}
      <g transform="translate(34,304)">
        <g style={{ transformBox: 'fill-box', transformOrigin: '50% 100%', animation: 'queuecharge 3.2s ease-in-out infinite', animationDelay: lock }}>
          <Attacker scale={0.92} hideSword />
          {/* held sword — vanishes at the 70% disarm (the loose one takes over) */}
          <g style={{ animation: 'heldsword 3.2s linear infinite', animationDelay: lock }}>
            <path d="M0,-6 L12,-4 M12,-4 L30,-8 M14,-10 L15,1" fill="none" stroke="#1a1a1a" strokeWidth="3" strokeLinecap="round" />
          </g>
        </g>
        {/* his sword, knocked loose at 70%: spins up, sticks in the page */}
        <g style={{ transformBox: 'fill-box', transformOrigin: '50% 50%', animation: 'loosesword 3.2s ease-in infinite', animationDelay: lock, opacity: 0 }}>
          <path d="M52,-36 L64,-58" fill="none" stroke="#1a1a1a" strokeWidth="3" strokeLinecap="round" />
          <path d="M51,-44 L61,-41" fill="none" stroke="#1a1a1a" strokeWidth="2.6" strokeLinecap="round" />
        </g>
      </g>

      {/* THE KO'D — already dispatched behind Dash: flat, X-eyes, orbiting stars */}
      <g transform="translate(206,318)">
        <g transform="rotate(84)">
          <g transform="translate(0,6)">
            <circle cx="0" cy="-24" r="11" fill="#fffdf6" stroke="#1a1a1a" strokeWidth="3.2" />
            <path d="M-6,-27 l5,5 M-1,-27 l-5,5 M4,-27 l5,5 M9,-27 l-5,5" fill="none" stroke="#1a1a1a" strokeWidth="2" strokeLinecap="round" />
            <path d="M0,-13 L0,12" fill="none" stroke="#1a1a1a" strokeWidth="3.6" strokeLinecap="round" />
            <path d="M0,-6 L-11,2 M0,-6 L12,-2" fill="none" stroke="#1a1a1a" strokeWidth="3.2" strokeLinecap="round" />
            <path d="M0,12 L-8,26 M0,12 L11,24" fill="none" stroke="#1a1a1a" strokeWidth="3.6" strokeLinecap="round" />
          </g>
        </g>
        <g transform="translate(0,-38)">
          {[0, 1, 2].map((i) => (
            <path
              key={i}
              d="M0,0 l2,4 l4.4,0.6 l-3.2,3 l0.8,4.4 l-4,-2.2 l-4,2.2 l0.8,-4.4 l-3.2,-3 l4.4,-0.6 Z"
              fill="#ffd23f"
              stroke="#1a1a1a"
              strokeWidth="1.4"
              strokeLinejoin="round"
              style={{ transformBox: 'fill-box', transformOrigin: '50% 50%', animation: 'kostar 2.2s linear infinite', animationDelay: `${-i * 0.733}s` }}
            />
          ))}
        </g>
      </g>

      {/* impact bursts at the sword-contact point (24% / 70% of the cycle) */}
      <g style={{ transformBox: 'fill-box', transformOrigin: '50% 50%', animation: 'clanga 3.2s linear infinite', animationDelay: lock, opacity: 0 }}>
        <path d="M112,290 l3,7 l8,-3 l-4,7 l7,5 l-9,1 l1,9 l-6,-6 l-7,6 l1,-9 l-8,-1 l7,-5 l-4,-7 l8,3 Z" fill="#ffd23f" stroke="#1a1a1a" strokeWidth="1.8" strokeLinejoin="round" />
        <text x="80" y="258" fontFamily="Permanent Marker, cursive" fontSize="17" fill="#1a1a1a" transform="rotate(-6 80 258)">CLANG!</text>
      </g>
      <g style={{ transformBox: 'fill-box', transformOrigin: '50% 50%', animation: 'clangb 3.2s linear infinite', animationDelay: lock, opacity: 0 }}>
        <path d="M104,296 l3,7 l8,-3 l-4,7 l7,5 l-9,1 l1,9 l-6,-6 l-7,6 l1,-9 l-8,-1 l7,-5 l-4,-7 l8,3 Z" fill="#ff5ca8" stroke="#1a1a1a" strokeWidth="1.8" strokeLinejoin="round" />
        <text x="72" y="240" fontFamily="Permanent Marker, cursive" fontSize="17" fill="#1a1a1a" transform="rotate(5 72 240)">CLANK!</text>
      </g>

      {/* swish arcs off Dash's blade, flashing with each clang */}
      <path d="M150,268 q-18,10 -22,30" fill="none" stroke="#1a1a1a" strokeWidth="2" strokeLinecap="round" strokeDasharray="3 5" style={{ transformBox: 'fill-box', transformOrigin: '50% 50%', animation: 'clanga 3.2s linear infinite', animationDelay: lock, opacity: 0 }} />
      <path d="M146,278 q-16,8 -19,26" fill="none" stroke="#1a1a1a" strokeWidth="2" strokeLinecap="round" strokeDasharray="3 5" style={{ transformBox: 'fill-box', transformOrigin: '50% 50%', animation: 'clangb 3.2s linear infinite', animationDelay: lock, opacity: 0 }} />

      {/* charge speed-lines behind the queue attacker */}
      <g style={{ transformBox: 'fill-box', transformOrigin: '50% 50%', animation: 'chargelines 3.2s linear infinite', animationDelay: lock, opacity: 0 }}>
        <path d="M4,286 h16 M0,296 h20 M6,306 h14" fill="none" stroke="#1a1a1a" strokeWidth="2" strokeLinecap="round" />
      </g>
    </svg>
  )
}
