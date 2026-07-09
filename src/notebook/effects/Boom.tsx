import type { EffectProps } from '../types'

export default function Boom(p: EffectProps) {
  return (
    <div style={{ position: "absolute", width: "180px", height: "170px", zIndex: "52", pointerEvents: "none", ...p.style }}>
            <svg viewBox="0 0 180 170" width="180" height="170" style={{ overflow: "visible" }}>
              <g style={{ transformBox: "fill-box", transformOrigin: "50% 50%", animation: "burstonce .5s ease-out forwards" }}>
                <path d="M90,60 l8,16 l18,-7 l-9,17 l16,10 l-19,4 l2,19 l-16,-13 l-16,13 l2,-19 l-19,-4 l16,-10 l-9,-17 l18,7 Z" fill="#ffd23f" stroke="#1a1a1a" strokeWidth="2.8" strokeLinejoin="round"></path>
                <circle cx="90" cy="98" r="12" fill="#ff5ca8" opacity=".7"></circle>
              </g>
              <g style={{ transformBox: "fill-box", transformOrigin: "50% 50%", animation: "boomonce .9s ease-out forwards" }}>
                <path d="M104,26 h74" stroke="#ffd23f" strokeWidth="18" strokeLinecap="round" opacity=".6"></path>
                <text x="100" y="34" fontFamily="Permanent Marker, cursive" fontSize="24" fill="#1a1a1a">BOOM!</text>
              </g>
            </svg>
          </div>
  )
}
