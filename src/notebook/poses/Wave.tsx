export default function Wave() {
  return (
    <g style={{ transformBox: "fill-box", transformOrigin: "50% 96%", animation: "idlesway 3.2s ease-in-out infinite" }}>
                    <path d="M-3,-14 L-36,4 L-27,9 L-40,26 L-8,13 Z" fill="#ff5ca8" opacity=".55" stroke="#1a1a1a" strokeWidth="3" strokeLinejoin="round" style={{ transformBox: "fill-box", transformOrigin: "100% 0%", animation: "capeidle .9s ease-in-out infinite" }}>
    </path>
                    <circle cx="2" cy="-30" r="14" fill="#fffdf6" stroke="#1a1a1a" strokeWidth="4">
    </circle>
                    <path d="M-5,-36 l9,2.5 M9,-34 l9,-2.5" fill="none" stroke="#1a1a1a" strokeWidth="2.6" strokeLinecap="round">
    </path>
                    <circle cx="0" cy="-29" r="2" fill="#1a1a1a">
    </circle>
                    <circle cx="11" cy="-29" r="2" fill="#1a1a1a">
    </circle>
                    <path d="M2,-21 q5,4 10,-1" fill="none" stroke="#1a1a1a" strokeWidth="2.6" strokeLinecap="round">
    </path>
                    <path d="M0,-16 L-2,16" fill="none" stroke="#1a1a1a" strokeWidth="5.5" strokeLinecap="round">
    </path>
                    <path d="M-1,-9 L-14,1 L-7,9" fill="none" stroke="#1a1a1a" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round">
    </path>
                    <g transform="translate(1,-10)">
                      <path d="M0,0 L10,-10" fill="none" stroke="#1a1a1a" strokeWidth="4.5" strokeLinecap="round">
    </path>
                      <g transform="translate(10,-10)">
                        <g style={{ transformBox: "fill-box", transformOrigin: "10% 90%", animation: "waveh .35s ease-in-out infinite alternate" }}>
                          <path d="M0,0 L7,-11" fill="none" stroke="#1a1a1a" strokeWidth="4.5" strokeLinecap="round">
    </path>
                          <circle cx="8" cy="-13" r="3" fill="#1a1a1a">
    </circle>
                        </g>
                      </g>
                    </g>
                    <path d="M-2,16 L11,33 L13,50 l11,2" fill="none" stroke="#1a1a1a" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
    </path>
                    <path d="M-2,16 L-13,34 L-15,50 l-10,2" fill="none" stroke="#1a1a1a" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
    </path>
                  </g>
  )
}
