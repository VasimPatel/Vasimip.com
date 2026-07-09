import { CONTENT } from '../content'
import type { PageProps } from '../types'

export default function Work(p: PageProps) {
  return (
    <div style={{ position: 'absolute', inset: 0, transformOrigin: 'left center', transformStyle: 'preserve-3d', transition: 'transform .78s cubic-bezier(.5,.08,.28,1)', ...p.style }}>
            <div style={{ position: "absolute", inset: "0", backfaceVisibility: "hidden", boxSizing: "border-box", backgroundColor: "#fdfbf3", backgroundImage: "linear-gradient(90deg, transparent 58px, rgba(224,96,96,.5) 58px, rgba(224,96,96,.5) 60px, transparent 60px), repeating-linear-gradient(transparent 0px, transparent 26px, rgba(122,168,204,.38) 26px, rgba(122,168,204,.38) 27.5px)", border: "2.5px solid #26241f", borderRadius: "4px 12px 12px 4px", boxShadow: "8px 10px 22px rgba(0,0,0,.28)" }}>
              <div style={{ position: "absolute", left: "60px", top: "80px", width: "390px", height: "280px", boxSizing: "border-box", background: "#fffdf6", border: "3.5px solid #1a1a1a", borderRadius: "255px 18px 225px 18px/18px 225px 18px 255px", transform: "rotate(-0.5deg)", padding: "14px 20px", display: "flex", flexDirection: "column", gap: "10px" }}>
                <div style={{ fontFamily: "'Permanent Marker',cursive", fontSize: "19px" }}><span style={{ background: "linear-gradient(105deg, transparent 3%, rgba(255,210,63,.7) 5%, rgba(255,210,63,.7) 96%, transparent 98%)", padding: "0 6px" }}>{CONTENT.work.projects[0].title}</span></div>
                <div style={{ flex: "1", border: "2.5px dashed rgba(26,26,26,.45)", borderRadius: "8px", background: "repeating-linear-gradient(45deg, rgba(26,26,26,.05) 0px, rgba(26,26,26,.05) 12px, transparent 12px, transparent 24px)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "ui-monospace,monospace", fontSize: "12px", color: "#6a6458" }}>project shot goes here</div>
                <div style={{ fontSize: "16px" }}>{CONTENT.work.projects[0].blurb}</div>
              </div>
              <div style={{ position: "absolute", left: "480px", top: "120px", width: "380px", height: "280px", boxSizing: "border-box", background: "#fffdf6", border: "3.5px solid #1a1a1a", borderRadius: "18px 225px 18px 255px/255px 18px 225px 18px", transform: "rotate(0.6deg)", padding: "14px 20px", display: "flex", flexDirection: "column", gap: "10px" }}>
                <div style={{ fontFamily: "'Permanent Marker',cursive", fontSize: "19px" }}><span style={{ background: "linear-gradient(105deg, transparent 3%, rgba(255,92,168,.55) 5%, rgba(255,92,168,.55) 96%, transparent 98%)", padding: "0 6px" }}>{CONTENT.work.projects[1].title}</span></div>
                <div style={{ flex: "1", border: "2.5px dashed rgba(26,26,26,.45)", borderRadius: "8px", background: "repeating-linear-gradient(45deg, rgba(26,26,26,.05) 0px, rgba(26,26,26,.05) 12px, transparent 12px, transparent 24px)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "ui-monospace,monospace", fontSize: "12px", color: "#6a6458" }}>project shot goes here</div>
                <div style={{ fontSize: "16px" }}>{CONTENT.work.projects[1].blurb}</div>
              </div>
              <div style={{ position: "absolute", left: "170px", top: "440px", width: "560px", height: "160px", boxSizing: "border-box", background: "#fffdf6", border: "3.5px solid #1a1a1a", borderRadius: "225px 18px 255px 18px/18px 255px 18px 225px", transform: "rotate(0.2deg)", padding: "16px 24px" }}>
                <div style={{ fontFamily: "'Permanent Marker',cursive", fontSize: "19px", marginBottom: "6px" }}>THE VAULT</div>
                <div style={{ fontSize: "17px", lineHeight: "1.4" }}>{CONTENT.work.vaultNote}</div>
              </div>
            </div>
            <div style={{ position: "absolute", inset: "0", backfaceVisibility: "hidden", transform: "rotateY(180deg)", background: "#f3edd9", border: "2.5px solid #26241f", borderRadius: "12px 4px 4px 12px" }}></div>
          </div>
  )
}
