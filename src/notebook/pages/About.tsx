import { CONTENT } from '../content'
import type { PageProps } from '../types'

export default function About(p: PageProps) {
  return (
    <div style={{ position: 'absolute', inset: 0, transformOrigin: 'left center', transformStyle: 'preserve-3d', transition: 'transform .78s cubic-bezier(.5,.08,.28,1)', ...p.style }}>
            <div style={{ position: "absolute", inset: "0", backfaceVisibility: "hidden", boxSizing: "border-box", backgroundColor: "#fdfbf3", backgroundImage: "linear-gradient(90deg, transparent 58px, rgba(224,96,96,.5) 58px, rgba(224,96,96,.5) 60px, transparent 60px), repeating-linear-gradient(transparent 0px, transparent 26px, rgba(122,168,204,.38) 26px, rgba(122,168,204,.38) 27.5px)", border: "2.5px solid #26241f", borderRadius: "4px 12px 12px 4px", boxShadow: "8px 10px 22px rgba(0,0,0,.28)" }}>
              <div style={{ position: "absolute", left: "70px", top: "80px", width: "500px", height: "340px", boxSizing: "border-box", background: "#fffdf6", border: "3.5px solid #1a1a1a", borderRadius: "255px 18px 225px 18px/18px 225px 18px 255px", transform: "rotate(-0.4deg)", padding: "16px 22px" }}>
                <div style={{ fontFamily: "'Permanent Marker',cursive", fontSize: "22px" }}><span style={{ background: "linear-gradient(105deg, transparent 3%, rgba(255,210,63,.7) 5%, rgba(255,210,63,.7) 96%, transparent 98%)", padding: "0 6px" }}>THE HERO'S FILE</span></div>
                <div style={{ position: "absolute", right: "22px", top: "62px", width: "230px", boxSizing: "border-box", border: "2.5px solid #1a1a1a", borderRadius: "12px 3px 10px 4px", background: "#fdfbf3", padding: "12px 14px", fontSize: "16px", lineHeight: "1.45" }}>
                  {CONTENT.about.bio} Based in {CONTENT.about.city}.
                </div>
                <svg viewBox="0 0 240 220" width="240" height="220" style={{ position: "absolute", left: "8px", bottom: "2px", overflow: "visible" }}>
                  <g transform="translate(24,186)">
                    <g style={{ transformBox: "fill-box", transformOrigin: "50% 100%", animation: "lungeb 3s ease-in-out infinite" }}>
                      <circle cx="0" cy="-24" r="11" fill="#fffdf6" stroke="#1a1a1a" strokeWidth="3.2"></circle>
                      <path d="M-7,-30 l7,3 M4,-27 l7,-3" fill="none" stroke="#1a1a1a" strokeWidth="2.2" strokeLinecap="round"></path>
                      <circle cx="-2" cy="-24" r="1.7" fill="#1a1a1a"></circle>
                      <circle cx="7" cy="-24" r="1.7" fill="#1a1a1a"></circle>
                      <path d="M0,-13 L0,12" fill="none" stroke="#1a1a1a" strokeWidth="3.6" strokeLinecap="round"></path>
                      <path d="M0,-6 L10,-20 M10,-20 L16,-40 M8,-32 L19,-29" fill="none" stroke="#1a1a1a" strokeWidth="3.2" strokeLinecap="round"></path>
                      <path d="M0,-6 L-10,4" fill="none" stroke="#1a1a1a" strokeWidth="3.2" strokeLinecap="round"></path>
                      <path d="M0,12 L-9,28 l-8,2 M0,12 L10,28 l9,2" fill="none" stroke="#1a1a1a" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round"></path>
                    </g>
                  </g>
                  <g style={{ transformBox: "fill-box", transformOrigin: "50% 50%", animation: "clanga 3s linear infinite", opacity: "0" }}>
                    <path d="M86,168 l3,7 l8,-3 l-4,7 l7,5 l-9,1 l1,9 l-6,-6 l-7,6 l1,-9 l-8,-1 l7,-5 l-4,-7 l8,3 Z" fill="#ffd23f" stroke="#1a1a1a" strokeWidth="1.8" strokeLinejoin="round"></path>
                    <text x="50" y="140" fontFamily="Permanent Marker, cursive" fontSize="17" fill="#1a1a1a" transform="rotate(-6 50 140)">CLANG!</text>
                  </g>
                  <g style={{ transformBox: "fill-box", transformOrigin: "50% 50%", animation: "clangb 3s linear infinite", opacity: "0" }}>
                    <path d="M78,176 l3,7 l8,-3 l-4,7 l7,5 l-9,1 l1,9 l-6,-6 l-7,6 l1,-9 l-8,-1 l7,-5 l-4,-7 l8,3 Z" fill="#ff5ca8" stroke="#1a1a1a" strokeWidth="1.8" strokeLinejoin="round"></path>
                    <text x="46" y="120" fontFamily="Permanent Marker, cursive" fontSize="17" fill="#1a1a1a" transform="rotate(-6 46 120)">CLANK!</text>
                  </g>
                  <path d="M8,214 q60,6 120,0 q56,-5 110,1" fill="none" stroke="#1a1a1a" strokeWidth="2.4" strokeLinecap="round"></path>
                </svg>
                <div style={{ position: "absolute", right: "24px", bottom: "12px", fontFamily: "'Caveat',cursive", fontSize: "16px", color: "#8a8378", width: "220px" }}>the bio is under constant attack. it survives.</div>
              </div>
              <div style={{ position: "absolute", left: "610px", top: "150px", width: "250px", height: "280px", boxSizing: "border-box", background: "#fffdf6", border: "3.5px solid #1a1a1a", borderRadius: "18px 225px 18px 255px/255px 18px 225px 18px", transform: "rotate(0.7deg)", padding: "16px 20px" }}>
                <div style={{ fontFamily: "'Permanent Marker',cursive", fontSize: "18px", marginBottom: "10px" }}>FUN FACTS <span style={{ fontFamily: "'Caveat',cursive", fontSize: "15px", color: "#8a8378" }}>(verified-ish)</span></div>
                <div style={{ display: "flex", flexDirection: "column", gap: "9px", fontSize: "16px", lineHeight: "1.3" }}>
                  {CONTENT.about.funFacts.map((fact) => (
                  <div key={fact}>✓ {fact}</div>
                ))}
                </div>
              </div>
            </div>
            <div style={{ position: "absolute", inset: "0", backfaceVisibility: "hidden", transform: "rotateY(180deg)", background: "#f3edd9", border: "2.5px solid #26241f", borderRadius: "12px 4px 4px 12px" }}></div>
          </div>
  )
}
