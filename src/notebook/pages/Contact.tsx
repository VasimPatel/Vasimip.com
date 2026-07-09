import { CONTENT } from '../content'
import type { PageProps } from '../types'

export default function Contact(p: PageProps) {
  return (
    <div style={{ position: 'absolute', inset: 0, transformOrigin: 'left center', transformStyle: 'preserve-3d', transition: 'transform .78s cubic-bezier(.5,.08,.28,1)', ...p.style }}>
            <div style={{ position: "absolute", inset: "0", backfaceVisibility: "hidden", boxSizing: "border-box", backgroundColor: "#fdfbf3", backgroundImage: "linear-gradient(90deg, transparent 58px, rgba(224,96,96,.5) 58px, rgba(224,96,96,.5) 60px, transparent 60px), repeating-linear-gradient(transparent 0px, transparent 26px, rgba(122,168,204,.38) 26px, rgba(122,168,204,.38) 27.5px)", border: "2.5px solid #26241f", borderRadius: "4px 12px 12px 4px", boxShadow: "8px 10px 22px rgba(0,0,0,.28)" }}>
              <div style={{ position: "absolute", left: "90px", top: "90px", width: "480px", height: "300px", boxSizing: "border-box", background: "#fffdf6", border: "3.5px solid #1a1a1a", borderRadius: "255px 18px 225px 18px/18px 225px 18px 255px", transform: "rotate(-0.4deg)", padding: "30px 34px", display: "flex", flexDirection: "column", gap: "14px" }}>
                <div style={{ fontFamily: "'Permanent Marker',cursive", fontSize: "60px", transform: "rotate(-1deg)" }}><span style={{ background: "linear-gradient(105deg, transparent 3%, rgba(255,92,168,.55) 5%, rgba(255,92,168,.55) 96%, transparent 98%)", padding: "0 10px" }}>SAY HI.</span></div>
                <div style={{ fontSize: "22px" }}>{CONTENT.contact.email}</div>
                <div style={{ fontSize: "17px", color: "#5a544a" }}>{CONTENT.contact.responseLine}</div>
              </div>
              <div style={{ position: "absolute", left: "610px", top: "130px", width: "250px", height: "240px", boxSizing: "border-box", background: "#fffdf6", border: "3.5px solid #1a1a1a", borderRadius: "18px 225px 18px 255px/255px 18px 225px 18px", transform: "rotate(0.7deg)", padding: "18px 22px" }}>
                <div style={{ fontFamily: "'Permanent Marker',cursive", fontSize: "26px" }}>THE END?</div>
                <div style={{ fontSize: "16px", marginTop: "8px", lineHeight: "1.4" }}>{CONTENT.contact.theEndNote}</div>
                <svg viewBox="0 0 120 80" width="120" height="80" style={{ marginTop: "10px", overflow: "visible" }}>
                  <path d="M20,66 h56" stroke="#1a1a1a" strokeWidth="2.6" strokeLinecap="round"></path>
                  <circle cx="44" cy="50" r="9.5" fill="#fffdf6" stroke="#1a1a1a" strokeWidth="2.6"></circle>
                  <path d="M39,47 h5" stroke="#1a1a1a" strokeWidth="2" strokeLinecap="round"></path>
                  <path d="M53,48 l9,3 l-9,3 Z" fill="#ffd23f" stroke="#1a1a1a" strokeWidth="1.6" strokeLinejoin="round"></path>
                  <path d="M41,56 v8 M47,56 v8" stroke="#1a1a1a" strokeWidth="2" strokeLinecap="round"></path>
                  <g style={{ transformBox: "fill-box", transformOrigin: "100% 50%", animation: "flapr 3.2s ease-in-out infinite" }}>
                    <path d="M42,50 q-10,-8 -14,-2 q4,5 14,4" fill="#fffdf6" stroke="#1a1a1a" strokeWidth="2"></path>
                  </g>
                  <text x="66" y="36" fontFamily="Caveat, cursive" fontWeight="600" fontSize="16" fill="#5a544a">fin.</text>
                </svg>
              </div>
            </div>
            <div style={{ position: "absolute", inset: "0", backfaceVisibility: "hidden", transform: "rotateY(180deg)", background: "#f3edd9", border: "2.5px solid #26241f", borderRadius: "12px 4px 4px 12px" }}></div>
          </div>
  )
}
