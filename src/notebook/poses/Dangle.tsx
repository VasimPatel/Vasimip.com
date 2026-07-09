export default function Dangle() {
  return (
    <g style={{ transformBox: "fill-box", transformOrigin: "50% 6%", animation: "dangleswing 1s ease-in-out infinite" }}>
                    <path d="M-3,-14 L-15,9 L-8,10 L-13,28 L-2,13 Z" fill="#ff5ca8" opacity=".55" stroke="#1a1a1a" strokeWidth="3" strokeLinejoin="round">
    </path>
                    <circle cx="2" cy="-30" r="14" fill="#fffdf6" stroke="#1a1a1a" strokeWidth="4">
    </circle>
                    <path d="M-6,-39 l10,4 M19,-39 l-10,4" fill="none" stroke="#1a1a1a" strokeWidth="2.6" strokeLinecap="round">
    </path>
                    <circle cx="0" cy="-28" r="2.4" fill="#1a1a1a">
    </circle>
                    <circle cx="11" cy="-28" r="2.4" fill="#1a1a1a">
    </circle>
                    <circle cx="6" cy="-20" r="2.4" fill="none" stroke="#1a1a1a" strokeWidth="2.2">
    </circle>
                    <path d="M0,-16 L-2,16" fill="none" stroke="#1a1a1a" strokeWidth="5.5" strokeLinecap="round">
    </path>
                    <path d="M0,-9 L13,1 M-1,-9 L-14,2" fill="none" stroke="#1a1a1a" strokeWidth="4.5" strokeLinecap="round">
    </path>
                    <g transform="translate(-2,16)">
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
