import type { EffectProps } from '../types'

export default function Hole(p: EffectProps) {
  return (
    <div style={{ position: "absolute", width: "140px", height: "60px", zIndex: "46", pointerEvents: "none", ...p.style }}>
            <svg viewBox="0 0 140 60" width="140" height="60">
              <ellipse cx="70" cy="30" rx="56" ry="17" fill="#17150f"></ellipse>
              <ellipse cx="70" cy="30" rx="61" ry="20" fill="none" stroke="#1a1a1a" strokeWidth="2.4" strokeDasharray="6 5"></ellipse>
            </svg>
          </div>
  )
}
