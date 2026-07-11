export default function BirdFin() {
  return (
    <svg viewBox="0 0 120 80" width="120" height="80" style={{ marginTop: "10px", overflow: "visible" }}>
      <path d="M20,66 h56" stroke="#1a1a1a" strokeWidth="2.6" strokeLinecap="round"></path>
      <circle cx="44" cy="50" r="9.5" fill="#fffdf6" stroke="#1a1a1a" strokeWidth="2.6"></circle>
      <path d="M39,47 h5" stroke="#1a1a1a" strokeWidth="2" strokeLinecap="round"></path>
      <path d="M53,48 l9,3 l-9,3 Z" fill="#ffd23f" stroke="#1a1a1a" strokeWidth="1.6" strokeLinejoin="round"></path>
      <path d="M41,56 v8 M47,56 v8" stroke="#1a1a1a" strokeWidth="2" strokeLinecap="round"></path>
      <g style={{ transformBox: "fill-box", transformOrigin: "100% 50%", animation: "flapr 3.2s ease-in-out infinite" }}>
        <path d="M42,50 q-10,-8 -14,-2 q4,5 14,4" fill="#fffdf6" stroke="#1a1a1a" strokeWidth="2"></path>
      </g>
      <text x="66" y="36" fontFamily="Caveat, cursive" fontWeight="600" fontSize="16" fill="#5a544a">fin.</text>
    </svg>
  )
}
