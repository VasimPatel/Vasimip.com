export default function Hang() {
  return (
    <g style={{ transformBox: "fill-box", transformOrigin: "50% 4%", animation: "dangleswing 1.3s ease-in-out infinite" }}>
                    <path d="M-2,-12 L-14,10 L-7,11 L-12,28 L-1,14 Z" fill="#ff5ca8" opacity=".55" stroke="#1a1a1a" strokeWidth="3" strokeLinejoin="round">
    </path>
                    <circle cx="-2" cy="-66" r="3.6" fill="#1a1a1a">
    </circle>
                    <circle cx="10" cy="-66" r="3.6" fill="#1a1a1a">
    </circle>
                    <path d="M0,-10 L-4,-40 L-2,-64" fill="none" stroke="#1a1a1a" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round">
    </path>
                    <path d="M3,-10 L8,-40 L10,-64" fill="none" stroke="#1a1a1a" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round">
    </path>
                    <circle cx="3" cy="-28" r="13" fill="#fffdf6" stroke="#1a1a1a" strokeWidth="4">
    </circle>
                    <path d="M-4,-37 l10,4 M17,-37 l-10,4" fill="none" stroke="#1a1a1a" strokeWidth="2.6" strokeLinecap="round">
    </path>
                    <circle cx="1" cy="-30" r="2.3" fill="#1a1a1a">
    </circle>
                    <circle cx="12" cy="-30" r="2.3" fill="#1a1a1a">
    </circle>
                    <ellipse cx="6" cy="-20" rx="2.4" ry="3" fill="none" stroke="#1a1a1a" strokeWidth="2.2">
    </ellipse>
                    <path d="M1,-12 L-2,14" fill="none" stroke="#1a1a1a" strokeWidth="5.5" strokeLinecap="round">
    </path>
                    <g transform="translate(-2,14)">
                      <g style={{ transformBox: "fill-box", transformOrigin: "15% 0%", animation: "kickl .45s ease-in-out infinite" }}>
                        <path d="M0,0 L7,16 L9,31 l10,2" fill="none" stroke="#1a1a1a" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
    </path>
                      </g>
                      <g style={{ transformBox: "fill-box", transformOrigin: "85% 0%", animation: "kickr .45s ease-in-out infinite" }}>
                        <path d="M0,0 L-7,17 L-7,32 l-9,2" fill="none" stroke="#1a1a1a" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
    </path>
                      </g>
                    </g>
                  </g>
  )
}
