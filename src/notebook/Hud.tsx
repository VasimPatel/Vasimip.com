import type { HudProps } from './types'

// Semantic HUD (parity Stage 7): real <button>s with accessible names, keyboard
// focusability, and aria state — visuals unchanged (hud-btn/hud-tab styles now
// reset the button chrome in styles.css). The smoke harness still finds these
// by text; ARIA state rides aria-pressed for the toggles.
const btnReset = { background: 'none', border: 'none', font: 'inherit', color: 'inherit', padding: 0, cursor: 'pointer' } as const

export default function Hud(p: HudProps) {
  return (
    <nav aria-label="notebook navigation" style={{ position: "fixed", left: "50%", bottom: "16px", transform: "translateX(-50%) rotate(-0.6deg)", background: "#fdfbf3", border: "2.5px solid #1a1a1a", borderRadius: "14px 4px 12px 5px", boxShadow: "3px 4px 10px rgba(0,0,0,.3)", padding: "9px 18px", display: "flex", alignItems: "center", gap: "10px", zIndex: "100", fontSize: "17px", userSelect: "none" }}>
        <div style={{ position: "absolute", top: "-12px", left: "38px", width: "54px", height: "20px", background: "rgba(255,210,63,.55)", transform: "rotate(-4deg)", borderRadius: "3px" }}></div>
        <button type="button" aria-label="previous" onClick={p.onPrev} className="hud-btn" style={btnReset}><span>◀</span></button>
        {p.tabs.map((t) => (
          <button
            type="button"
            key={t.name}
            className="hud-tab"
            onClick={t.go}
            aria-current={t.active ? 'page' : undefined}
            style={{ ...btnReset, ...(t.active ? { background: 'rgba(255,210,63,.6)' } : {}) }}
          >
            <span>{t.name}</span>
          </button>
        ))}
        <button type="button" aria-label="next" onClick={p.onNext} className="hud-btn" style={btnReset}><span>▶</span></button>
        <span style={{ opacity: ".3" }}>|</span>
        <button type="button" onClick={p.onAuto} className="hud-tab" aria-pressed={p.autoLabel.endsWith('ON')} style={btnReset}><span>{p.autoLabel}</span></button>
        <button type="button" onClick={p.onSound} className="hud-tab" aria-pressed={p.soundLabel.endsWith('ON')} style={btnReset}><span>{p.soundLabel}</span></button>
        <span style={{ opacity: ".55", fontSize: "14px" }}>{p.pageLabel}</span>
      </nav>
  )
}
