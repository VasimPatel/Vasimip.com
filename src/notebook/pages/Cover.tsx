import { CONTENT } from '../content'
import type { CoverProps } from '../types'

export default function Cover(p: CoverProps) {
  return (
    <div style={{ position: 'absolute', inset: 0, transformOrigin: 'left center', transformStyle: 'preserve-3d', transition: 'transform .78s cubic-bezier(.5,.08,.28,1)', ...p.style }}>
            <div onClick={p.onOpen} style={{ position: "absolute", inset: "0", backfaceVisibility: "hidden", cursor: "pointer", boxSizing: "border-box", backgroundColor: "#23211d", backgroundImage: "radial-gradient(rgba(250,248,240,.14) 1.2px, transparent 1.4px), radial-gradient(rgba(250,248,240,.09) 1px, transparent 1.2px)", backgroundSize: "7px 9px, 11px 7px", backgroundPosition: "0 0, 4px 3px", border: "2.5px solid #14130f", borderRadius: "4px 12px 12px 4px", boxShadow: "8px 10px 22px rgba(0,0,0,.35)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ width: "520px", background: "#fdfbf3", border: "3px solid #1a1a1a", borderRadius: "225px 16px 255px 16px/16px 255px 16px 225px", padding: "30px 36px", textAlign: "center", boxShadow: "0 4px 0 rgba(0,0,0,.35)" }}>
                <div style={{ fontFamily: "'Permanent Marker',cursive", fontSize: "34px", letterSpacing: "3px" }}>COMPOSITION</div>
                <div style={{ borderTop: "2px solid #1a1a1a", margin: "14px 0", paddingTop: "12px", fontSize: "18px", textAlign: "left" }}>Name: <span style={{ fontFamily: "'Caveat',cursive", fontSize: "22px" }}>{CONTENT.cover.name}</span></div>
                <div style={{ fontSize: "18px", textAlign: "left" }}>Subject: <span style={{ fontFamily: "'Caveat',cursive", fontSize: "22px" }}>{CONTENT.cover.subject}</span></div>
                <div style={{ marginTop: "18px", fontFamily: "'Caveat',cursive", fontSize: "22px", color: "#8a4a5e", display: "inline-block", animation: "pulse 1.6s ease-in-out infinite" }}>✎ click to open</div>
              </div>
            </div>
            <div style={{ position: "absolute", inset: "0", backfaceVisibility: "hidden", transform: "rotateY(180deg)", background: "#efe8d2", border: "2.5px solid #26241f", borderRadius: "12px 4px 4px 12px" }}></div>
          </div>
  )
}
