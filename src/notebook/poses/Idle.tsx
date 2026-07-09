interface IdleProps {
  headTilt: number
  lookXf: number
  lookY: number
  eyeR: number
}

export default function Idle({ headTilt, lookXf, lookY, eyeR }: IdleProps) {
  return (
    <g style={{ transformBox: "fill-box", transformOrigin: "50% 96%", animation: "idlesway 3.2s ease-in-out infinite" }}>
                    <path d="M-3,-14 L-36,4 L-27,9 L-40,26 L-8,13 Z" fill="#ff5ca8" opacity=".55" stroke="#1a1a1a" strokeWidth="3" strokeLinejoin="round" style={{ transformBox: "fill-box", transformOrigin: "100% 0%", animation: "capeidle .9s ease-in-out infinite" }}>
    </path>
                    <g transform={`rotate(${headTilt} 4 -18)`}>
                      <circle cx="2" cy="-30" r="14" fill="#fffdf6" stroke="#1a1a1a" strokeWidth="4">
    </circle>
                      <path d="M-5,-36 l9,2.5 M9,-34 l9,-2.5" fill="none" stroke="#1a1a1a" strokeWidth="2.6" strokeLinecap="round">
    </path>
                      <g style={{ transformBox: "fill-box", transformOrigin: "50% 50%", animation: "blinkk 3.6s linear infinite" }}>
                        <g style={{ transform: `translate(${lookXf}px,${lookY}px)` }}>
                          <circle cx="0" cy="-29" r={eyeR} fill="#1a1a1a">
    </circle>
                          <circle cx="11" cy="-29" r={eyeR} fill="#1a1a1a">
    </circle>
                        </g>
                      </g>
                      <path d="M3,-21 q5,2.5 9,-1" fill="none" stroke="#1a1a1a" strokeWidth="2.6" strokeLinecap="round">
    </path>
                    </g>
                    <path d="M0,-16 L-2,16" fill="none" stroke="#1a1a1a" strokeWidth="5.5" strokeLinecap="round">
    </path>
                    <path d="M0,-9 L15,-1 L6,14" fill="none" stroke="#1a1a1a" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round">
    </path>
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
