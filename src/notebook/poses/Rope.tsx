export default function Rope() {
  return (
    <g style={{ transformBox: "fill-box", transformOrigin: "50% 96%", animation: "ropewob .85s ease-in-out infinite" }}>
                    <path d="M-3,-14 L-30,0 L-23,5 L-33,20 L-7,11 Z" fill="#ff5ca8" opacity=".55" stroke="#1a1a1a" strokeWidth="3" strokeLinejoin="round" style={{ transformBox: "fill-box", transformOrigin: "100% 0%", animation: "capeidle 1.1s ease-in-out infinite" }}>
    </path>
                    <circle cx="2" cy="-30" r="14" fill="#fffdf6" stroke="#1a1a1a" strokeWidth="4">
    </circle>
                    <path d="M-5,-36 l9,2.5 M9,-34 l9,-2.5" fill="none" stroke="#1a1a1a" strokeWidth="2.6" strokeLinecap="round">
    </path>
                    <circle cx="0" cy="-29" r="2.2" fill="#1a1a1a">
    </circle>
                    <circle cx="11" cy="-29" r="2.2" fill="#1a1a1a">
    </circle>
                    <ellipse cx="6" cy="-20" rx="2.4" ry="3" fill="none" stroke="#1a1a1a" strokeWidth="2.2">
    </ellipse>
                    <path d="M0,-16 L-2,16" fill="none" stroke="#1a1a1a" strokeWidth="5.5" strokeLinecap="round">
    </path>
                    <g transform="translate(1,-10)">
                      <g style={{ transformBox: "fill-box", transformOrigin: "0% 50%", animation: "ropearm .85s ease-in-out infinite" }}>
                        <path d="M0,0 L27,-5" fill="none" stroke="#1a1a1a" strokeWidth="4.5" strokeLinecap="round">
    </path>
                        <circle cx="28" cy="-6" r="3.2" fill="#1a1a1a">
    </circle>
                      </g>
                    </g>
                    <g transform="translate(-1,-10)">
                      <g style={{ transformBox: "fill-box", transformOrigin: "100% 50%", animation: "ropearm .85s ease-in-out -.42s infinite" }}>
                        <path d="M0,0 L-27,-4" fill="none" stroke="#1a1a1a" strokeWidth="4.5" strokeLinecap="round">
    </path>
                        <circle cx="-28" cy="-5" r="3.2" fill="#1a1a1a">
    </circle>
                      </g>
                    </g>
                    <path d="M-2,16 L-4,34 L-5,50 l10,2" fill="none" stroke="#1a1a1a" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
    </path>
                    <g transform="translate(-2,16)">
                      <g style={{ transformBox: "fill-box", transformOrigin: "0% 0%", animation: "ropeleg .85s ease-in-out infinite" }}>
                        <path d="M0,0 L9,15 L11,30 l10,2" fill="none" stroke="#1a1a1a" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
    </path>
                      </g>
                    </g>
                  </g>
  )
}
