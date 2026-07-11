import type { EffectProps } from '../types'

export default function Smoke(p: EffectProps) {
  return (
    <div style={{ position: "absolute", width: "150px", height: "120px", zIndex: "54", pointerEvents: "none", ...p.style }}>
            <svg viewBox="0 0 150 120" width="150" height="120" style={{ overflow: "visible" }}>
              <g style={{ transformBox: "fill-box", transformOrigin: "50% 80%", animation: "smokepuff .55s ease-out forwards" }}>
                <circle cx="50" cy="72" r="24" fill="#fffdf6" stroke="#1a1a1a" strokeWidth="3"></circle>
                <circle cx="84" cy="62" r="28" fill="#fdfbf3" stroke="#1a1a1a" strokeWidth="3"></circle>
                <circle cx="108" cy="80" r="20" fill="#fffdf6" stroke="#1a1a1a" strokeWidth="3"></circle>
                <circle cx="72" cy="90" r="19" fill="#fdfbf3" stroke="#1a1a1a" strokeWidth="3"></circle>
                <text x="46" y="28" fontFamily="Permanent Marker, cursive" fontSize="20" fill="#1a1a1a" transform="rotate(-4 46 28)">POOF!</text>
              </g>
            </svg>
          </div>
  )
}
