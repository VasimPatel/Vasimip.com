import type { EffectProps } from '../types'

export default function Crack(p: EffectProps) {
  return (
    <div style={{ position: "absolute", width: "120px", height: "150px", zIndex: "47", pointerEvents: "none", ...p.style }}>
            <svg viewBox="0 0 120 150" width="120" height="150" style={{ overflow: "visible" }}>
              <g style={{ transformBox: "fill-box", transformOrigin: "50% 50%", animation: "crackin .3s ease-out forwards" }}>
                <path d="M60,2 L46,28 L64,44 L48,74 L68,96 L50,120 L60,148" fill="none" stroke="#fdfbf3" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round"></path>
                <path d="M60,2 L46,28 L64,44 L48,74 L68,96 L50,120 L60,148" fill="none" stroke="#1a1a1a" strokeWidth="3.4" strokeLinejoin="round"></path>
                <path d="M52,60 l-14,-8 M62,84 l15,7 M56,34 l-11,4" fill="none" stroke="#1a1a1a" strokeWidth="2.4" strokeLinecap="round"></path>
                <text x="70" y="24" fontFamily="Permanent Marker, cursive" fontSize="19" fill="#1a1a1a" transform="rotate(-8 70 24)">KRAK!</text>
              </g>
            </svg>
          </div>
  )
}
