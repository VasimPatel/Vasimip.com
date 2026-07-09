import type { EffectProps } from '../types'

export default function FocusRing(p: EffectProps) {
  return <div style={{ position: "absolute", pointerEvents: "none", border: "6px solid rgba(255,210,63,.6)", borderRadius: "22px 8px 26px 9px/9px 26px 8px 22px", transition: "all .8s cubic-bezier(.5,0,.2,1)", zIndex: "44", ...p.style }}></div>
}
