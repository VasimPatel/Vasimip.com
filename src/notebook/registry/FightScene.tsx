export default function FightScene() {
  return (
    <svg viewBox="0 0 240 220" width="240" height="220" style={{ position: "absolute", left: "8px", bottom: "2px", overflow: "visible" }}>
      <g transform="translate(24,186)">
        <g style={{ transformBox: "fill-box", transformOrigin: "50% 100%", animation: "lungeb 3s ease-in-out infinite" }}>
          <circle cx="0" cy="-24" r="11" fill="#fffdf6" stroke="#1a1a1a" strokeWidth="3.2"></circle>
          <path d="M-7,-30 l7,3 M4,-27 l7,-3" fill="none" stroke="#1a1a1a" strokeWidth="2.2" strokeLinecap="round"></path>
          <circle cx="-2" cy="-24" r="1.7" fill="#1a1a1a"></circle>
          <circle cx="7" cy="-24" r="1.7" fill="#1a1a1a"></circle>
          <path d="M0,-13 L0,12" fill="none" stroke="#1a1a1a" strokeWidth="3.6" strokeLinecap="round"></path>
          <path d="M0,-6 L10,-20 M10,-20 L16,-40 M8,-32 L19,-29" fill="none" stroke="#1a1a1a" strokeWidth="3.2" strokeLinecap="round"></path>
          <path d="M0,-6 L-10,4" fill="none" stroke="#1a1a1a" strokeWidth="3.2" strokeLinecap="round"></path>
          <path d="M0,12 L-9,28 l-8,2 M0,12 L10,28 l9,2" fill="none" stroke="#1a1a1a" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round"></path>
        </g>
      </g>
      <g style={{ transformBox: "fill-box", transformOrigin: "50% 50%", animation: "clanga 3s linear infinite", opacity: "0" }}>
        <path d="M86,168 l3,7 l8,-3 l-4,7 l7,5 l-9,1 l1,9 l-6,-6 l-7,6 l1,-9 l-8,-1 l7,-5 l-4,-7 l8,3 Z" fill="#ffd23f" stroke="#1a1a1a" strokeWidth="1.8" strokeLinejoin="round"></path>
        <text x="50" y="140" fontFamily="Permanent Marker, cursive" fontSize="17" fill="#1a1a1a" transform="rotate(-6 50 140)">CLANG!</text>
      </g>
      <g style={{ transformBox: "fill-box", transformOrigin: "50% 50%", animation: "clangb 3s linear infinite", opacity: "0" }}>
        <path d="M78,176 l3,7 l8,-3 l-4,7 l7,5 l-9,1 l1,9 l-6,-6 l-7,6 l1,-9 l-8,-1 l7,-5 l-4,-7 l8,3 Z" fill="#ff5ca8" stroke="#1a1a1a" strokeWidth="1.8" strokeLinejoin="round"></path>
        <text x="46" y="120" fontFamily="Permanent Marker, cursive" fontSize="17" fill="#1a1a1a" transform="rotate(-6 46 120)">CLANK!</text>
      </g>
      <path d="M8,214 q60,6 120,0 q56,-5 110,1" fill="none" stroke="#1a1a1a" strokeWidth="2.4" strokeLinecap="round"></path>
    </svg>
  )
}
