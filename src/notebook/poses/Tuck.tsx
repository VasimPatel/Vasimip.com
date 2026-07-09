export default function Tuck() {
  return (
    <g style={{ transformBox: "fill-box", transformOrigin: "50% 50%", animation: "tuckspin .5s linear infinite" }}>
                    <path d="M-13,-10 L-26,2 L-14,6 Z" fill="#ff5ca8" opacity=".55" stroke="#1a1a1a" strokeWidth="3" strokeLinejoin="round">
    </path>
                    <circle cx="0" cy="-14" r="12" fill="#fffdf6" stroke="#1a1a1a" strokeWidth="4">
    </circle>
                    <path d="M-6,-15 l6,1 M6,-14 l6,-1" fill="none" stroke="#1a1a1a" strokeWidth="2.4" strokeLinecap="round">
    </path>
                    <path d="M-12,-4 q-4,18 10,20 q15,2 15,-12" fill="none" stroke="#1a1a1a" strokeWidth="5.5" strokeLinecap="round">
    </path>
                    <path d="M-7,2 L9,-2" fill="none" stroke="#1a1a1a" strokeWidth="4.5" strokeLinecap="round">
    </path>
                    <path d="M-9,-5 L11,1" fill="none" stroke="#1a1a1a" strokeWidth="4.5" strokeLinecap="round">
    </path>
                  </g>
  )
}
