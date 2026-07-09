interface SprayProps {
  lookXf: number
  lookY: number
}

export default function Spray({ lookXf, lookY }: SprayProps) {
  return (
    <g style={{ animation: "breathe 1.2s ease-in-out infinite" }}>
                    <path d="M-3,-14 L-36,4 L-27,9 L-40,26 L-8,13 Z" fill="#ff5ca8" opacity=".55" stroke="#1a1a1a" strokeWidth="3" strokeLinejoin="round" style={{ transformBox: "fill-box", transformOrigin: "100% 0%", animation: "capeidle .9s ease-in-out infinite" }}>
    </path>
                    <circle cx="2" cy="-30" r="14" fill="#fffdf6" stroke="#1a1a1a" strokeWidth="4">
    </circle>
                    <path d="M-5,-36 l9,2.5 M9,-34 l9,-2.5" fill="none" stroke="#1a1a1a" strokeWidth="2.6" strokeLinecap="round">
    </path>
                    <g style={{ transform: `translate(${lookXf}px,${lookY}px)` }}>
                      <circle cx="0" cy="-29" r="2" fill="#1a1a1a">
    </circle>
                      <circle cx="11" cy="-29" r="2" fill="#1a1a1a">
    </circle>
                    </g>
                    <path d="M3,-21 q5,2.5 9,-1" fill="none" stroke="#1a1a1a" strokeWidth="2.6" strokeLinecap="round">
    </path>
                    <path d="M0,-16 L-2,16" fill="none" stroke="#1a1a1a" strokeWidth="5.5" strokeLinecap="round">
    </path>
                    <path d="M0,-9 L14,-8 L24,-12" fill="none" stroke="#1a1a1a" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round">
    </path>
                    <rect x="24" y="-26" width="9" height="15" rx="2" fill="#fffdf6" stroke="#1a1a1a" strokeWidth="2.5">
    </rect>
                    <circle cx="28.5" cy="-27.5" r="1.6" fill="#1a1a1a">
    </circle>
                    <g style={{ animation: "sprayjit .3s linear infinite" }}>
                      <circle cx="40" cy="-22" r="2.2" fill="#ff5ca8" opacity=".8">
    </circle>
                      <circle cx="46" cy="-18" r="1.7" fill="#ff5ca8" opacity=".7">
    </circle>
                      <circle cx="44" cy="-26" r="1.7" fill="#ff5ca8" opacity=".7">
    </circle>
                      <circle cx="52" cy="-21" r="1.4" fill="#ff5ca8" opacity=".6">
    </circle>
                    </g>
                    <path d="M-1,-9 L-15,3 L-11,17" fill="none" stroke="#1a1a1a" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round">
    </path>
                    <circle cx="-11" cy="19" r="4" fill="#1a1a1a">
    </circle>
                    <path d="M-2,16 L11,33 L13,50 l11,2" fill="none" stroke="#1a1a1a" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
    </path>
                    <path d="M-2,16 L-13,34 L-15,50 l-10,2" fill="none" stroke="#1a1a1a" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
    </path>
                  </g>
  )
}
