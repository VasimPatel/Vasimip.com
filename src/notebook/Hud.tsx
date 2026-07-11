import type { HudProps } from './types'

export default function Hud(p: HudProps) {
  return (
    <div style={{ position: "fixed", left: "50%", bottom: "16px", transform: "translateX(-50%) rotate(-0.6deg)", background: "#fdfbf3", border: "2.5px solid #1a1a1a", borderRadius: "14px 4px 12px 5px", boxShadow: "3px 4px 10px rgba(0,0,0,.3)", padding: "9px 18px", display: "flex", alignItems: "center", gap: "10px", zIndex: "100", fontSize: "17px", userSelect: "none" }}>
        <div style={{ position: "absolute", top: "-12px", left: "38px", width: "54px", height: "20px", background: "rgba(255,210,63,.55)", transform: "rotate(-4deg)", borderRadius: "3px" }}></div>
        <span onClick={p.onPrev} className="hud-btn">◀</span>
        {p.tabs.map((t) => <span key={t.name} className="hud-tab" onClick={t.go} style={t.active ? { background: 'rgba(255,210,63,.6)' } : undefined}>{t.name}</span>)}
        <span onClick={p.onNext} className="hud-btn">▶</span>
        <span style={{ opacity: ".3" }}>|</span>
        <span onClick={p.onAuto} className="hud-tab">{p.autoLabel}</span>
        <span onClick={p.onSound} className="hud-tab">{p.soundLabel}</span>
        <span style={{ opacity: ".55", fontSize: "14px" }}>{p.pageLabel}</span>
      </div>
  )
}
