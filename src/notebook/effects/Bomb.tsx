import type { EffectProps } from '../types'

export default function Bomb(p: EffectProps) {
  return (
    <div style={{ position: "absolute", width: "30px", height: "36px", zIndex: "53", pointerEvents: "none", transition: "left .58s linear, top .58s linear", ...p.style }}>
            <div style={{ animation: "bombarcy .58s ease-in-out" }}>
              <svg viewBox="0 0 30 36" width="30" height="36" style={{ overflow: "visible", animation: "spin360 .6s linear" }}>
                <circle cx="15" cy="24" r="9" fill="#1a1a1a"></circle>
                <path d="M10,19 a6,6 0 0 1 5,-3" fill="none" stroke="#fffdf6" strokeWidth="2" strokeLinecap="round"></path>
                <path d="M20,16 q4,-6 9,-7" fill="none" stroke="#1a1a1a" strokeWidth="2.4" strokeLinecap="round"></path>
                <g style={{ transformBox: "fill-box", transformOrigin: "50% 50%", animation: "sparkfuse .25s linear infinite" }}>
                  <path d="M27,4 l1.5,3 l3,1.5 l-3,1.5 l-1.5,3 l-1.5,-3 l-3,-1.5 l3,-1.5 Z" fill="#ffd23f" stroke="#1a1a1a" strokeWidth="1.2"></path>
                </g>
              </svg>
            </div>
          </div>
  )
}
