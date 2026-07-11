export default function Fight() {
  return (
    <g style={{ transformBox: "fill-box", transformOrigin: "50% 96%", animation: "fightshift 2.6s ease-in-out infinite" }}>
                    <path d="M-3,-14 L-36,4 L-27,9 L-40,26 L-8,13 Z" fill="#ff5ca8" opacity=".55" stroke="#1a1a1a" strokeWidth="3" strokeLinejoin="round" style={{ transformBox: "fill-box", transformOrigin: "100% 0%", animation: "capewalk .9s ease-in-out infinite" }}>
    </path>
                    <circle cx="2" cy="-30" r="14" fill="#fffdf6" stroke="#1a1a1a" strokeWidth="4">
    </circle>
                    <path d="M-6,-38 l11,5 M17,-38 l-11,5" fill="none" stroke="#1a1a1a" strokeWidth="2.8" strokeLinecap="round">
    </path>
                    <circle cx="0" cy="-28" r="2" fill="#1a1a1a">
    </circle>
                    <circle cx="11" cy="-28" r="2" fill="#1a1a1a">
    </circle>
                    <path d="M2,-20 h10" fill="none" stroke="#1a1a1a" strokeWidth="2.6" strokeLinecap="round">
    </path>
                    <path d="M2,-17 L-3,16" fill="none" stroke="#1a1a1a" strokeWidth="5.5" strokeLinecap="round">
    </path>
                    <g transform="translate(0,-10)">
                      <g style={{ transformBox: "fill-box", transformOrigin: "0% 0%", animation: "fback 2.6s ease-in-out infinite" }}>
                        <path d="M0,0 L-11,6 L-19,-2" fill="none" stroke="#1a1a1a" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round">
    </path>
                        <circle cx="-20" cy="-3" r="3.5" fill="#1a1a1a">
    </circle>
                      </g>
                    </g>
                    <g transform="translate(1,-8)">
                      <g style={{ transformBox: "fill-box", transformOrigin: "0% 50%", animation: "fswing 2.6s cubic-bezier(.3,.05,.35,1) infinite" }}>
                        <path d="M0,0 L13,-3" fill="none" stroke="#1a1a1a" strokeWidth="4.5" strokeLinecap="round">
    </path>
                        <g transform="translate(13,-3)">
                          <g style={{ transformBox: "fill-box", transformOrigin: "0% 50%", animation: "fjab 2.6s cubic-bezier(.3,.05,.35,1) infinite" }}>
                            <path d="M0,0 L12,-5" fill="none" stroke="#1a1a1a" strokeWidth="4.5" strokeLinecap="round">
    </path>
                            <path d="M12,-5 L34,-13" fill="none" stroke="#1a1a1a" strokeWidth="4" strokeLinecap="round">
    </path>
                            <path d="M14,-15 L18,-2" fill="none" stroke="#1a1a1a" strokeWidth="3" strokeLinecap="round">
    </path>
                          </g>
                        </g>
                      </g>
                    </g>
                    <path d="M-3,16 L12,24 L13,44 l11,2" fill="none" stroke="#1a1a1a" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
    </path>
                    <path d="M-3,16 L-16,28 L-20,45 l-9,2" fill="none" stroke="#1a1a1a" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
    </path>
                  </g>
  )
}
