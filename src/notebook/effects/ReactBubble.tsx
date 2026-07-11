import type { ReactBubbleProps } from '../types'

export default function ReactBubble(p: ReactBubbleProps) {
  return (
    <div style={{ position: "absolute", zIndex: "53", pointerEvents: "none", ...p.style }}>
            <div style={{ border: "2.5px solid #1a1a1a", borderRadius: "12px 12px 12px 3px", background: "#ffd23f", padding: "3px 11px", fontFamily: "'Permanent Marker',cursive", fontSize: "15px", transform: "rotate(-3deg)", whiteSpace: "nowrap", animation: "popout .42s cubic-bezier(.3,.7,.4,1)" }}>{p.text}</div>
          </div>
  )
}
