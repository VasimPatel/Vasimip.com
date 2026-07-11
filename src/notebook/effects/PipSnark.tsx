import type { PipSnarkProps } from '../types'

export default function PipSnark(p: PipSnarkProps) {
  return (
    <div style={{ position: "absolute", left: "610px", top: "-92px", zIndex: "48", display: "flex", alignItems: "flex-end", gap: "8px" }}>
            <div style={{ border: "2.5px solid #1a1a1a", borderRadius: "14px 4px 14px 4px", background: "#fffdf6", padding: "5px 12px", fontFamily: "'Caveat',cursive", fontWeight: "600", fontSize: "18px", transform: "rotate(-1.5deg)", maxWidth: "210px" }}>{p.text}</div>
            <svg viewBox="0 0 60 50" width="60" height="50" style={{ overflow: "visible" }}>
              <circle cx="30" cy="24" r="9.5" fill="#fffdf6" stroke="#1a1a1a" strokeWidth="2.6">
    </circle>
              <path d="M25,21 h5" stroke="#1a1a1a" strokeWidth="2" strokeLinecap="round">
    </path>
              <path d="M39,22 l9,3 l-9,3 Z" fill="#ffd23f" stroke="#1a1a1a" strokeWidth="1.6" strokeLinejoin="round">
    </path>
              <path d="M27,32 v10 M33,32 v10" stroke="#1a1a1a" strokeWidth="2" strokeLinecap="round">
    </path>
              <g style={{ transformBox: "fill-box", transformOrigin: "100% 50%", animation: "flapr 3.2s ease-in-out infinite" }}>
                <path d="M28,24 q-10,-8 -14,-2 q4,5 14,4" fill="#fffdf6" stroke="#1a1a1a" strokeWidth="2">
    </path>
              </g>
            </svg>
          </div>
  )
}
