import { CONTENT } from '../content'
import type { PageProps } from '../types'

export default function Intro(p: PageProps) {
  return (
    <div style={{ position: 'absolute', inset: 0, transformOrigin: 'left center', transformStyle: 'preserve-3d', transition: 'transform .78s cubic-bezier(.5,.08,.28,1)', ...p.style }}>
            <div style={{ position: "absolute", inset: "0", backfaceVisibility: "hidden", boxSizing: "border-box", backgroundColor: "#fdfbf3", backgroundImage: "linear-gradient(90deg, transparent 58px, rgba(224,96,96,.5) 58px, rgba(224,96,96,.5) 60px, transparent 60px), repeating-linear-gradient(transparent 0px, transparent 26px, rgba(122,168,204,.38) 26px, rgba(122,168,204,.38) 27.5px)", border: "2.5px solid #26241f", borderRadius: "4px 12px 12px 4px", boxShadow: "8px 10px 22px rgba(0,0,0,.28)" }}>
              <div style={{ position: "absolute", left: "60px", top: "90px", width: "480px", height: "300px", boxSizing: "border-box", background: "#fffdf6", border: "3.5px solid #1a1a1a", borderRadius: "255px 18px 225px 18px/18px 225px 18px 255px", transform: "rotate(-0.5deg)", padding: "34px 30px", display: "flex", flexDirection: "column", gap: "16px" }}>
                <div style={{ fontFamily: "'Permanent Marker',cursive", fontSize: "46px", lineHeight: "1.1", transform: "rotate(-1deg)" }}>{CONTENT.intro.titlePre} <span style={{ background: "linear-gradient(105deg, transparent 3%, rgba(255,210,63,.75) 5%, rgba(255,210,63,.75) 96%, transparent 98%)", padding: "0 6px" }}>{CONTENT.intro.name}</span></div>
                <div style={{ fontFamily: "'Caveat',cursive", fontSize: "24px", color: "#5a544a" }}>{CONTENT.intro.subtitle}</div>
                <div style={{ fontSize: "16px", color: "#8a8378" }}>{CONTENT.intro.issue}</div>
              </div>
              <div style={{ position: "absolute", left: "580px", top: "120px", width: "280px", height: "240px", boxSizing: "border-box", background: "#fffdf6", border: "3.5px solid #1a1a1a", borderRadius: "18px 225px 18px 255px/255px 18px 225px 18px", transform: "rotate(0.6deg)", padding: "18px 22px" }}>
                <div style={{ fontFamily: "'Permanent Marker',cursive", fontSize: "20px" }}><span style={{ background: "linear-gradient(105deg, transparent 3%, rgba(255,92,168,.55) 5%, rgba(255,92,168,.55) 96%, transparent 98%)", padding: "0 6px" }}>STARRING</span></div>
                <div style={{ display: "flex", alignItems: "flex-end", gap: "14px", marginTop: "10px" }}>
                  <svg viewBox="-60 -75 120 130" width="88" height="95" style={{ overflow: "visible" }}>
                    <path d="M-3,-14 L-36,4 L-27,9 L-40,26 L-8,13 Z" fill="#ff5ca8" opacity=".55" stroke="#1a1a1a" strokeWidth="3" strokeLinejoin="round"></path>
                    <circle cx="2" cy="-30" r="14" fill="#fffdf6" stroke="#1a1a1a" strokeWidth="4"></circle>
                    <path d="M-5,-36 l9,2.5 M9,-34 l9,-2.5" fill="none" stroke="#1a1a1a" strokeWidth="2.6" strokeLinecap="round"></path>
                    <circle cx="0" cy="-29" r="2" fill="#1a1a1a"></circle>
                    <circle cx="11" cy="-29" r="2" fill="#1a1a1a"></circle>
                    <path d="M3,-21 q5,2.5 9,-1" fill="none" stroke="#1a1a1a" strokeWidth="2.6" strokeLinecap="round"></path>
                    <path d="M0,-16 L-2,16" fill="none" stroke="#1a1a1a" strokeWidth="5.5" strokeLinecap="round"></path>
                    <path d="M0,-9 L15,-1 L6,14" fill="none" stroke="#1a1a1a" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round"></path>
                    <path d="M-1,-9 L-15,3 L-11,17" fill="none" stroke="#1a1a1a" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round"></path>
                    <circle cx="-11" cy="19" r="4" fill="#1a1a1a"></circle>
                    <path d="M-2,16 L11,33 L13,50 l11,2" fill="none" stroke="#1a1a1a" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"></path>
                    <path d="M-2,16 L-13,34 L-15,50 l-10,2" fill="none" stroke="#1a1a1a" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"></path>
                  </svg>
                  <div style={{ fontSize: "16px", lineHeight: "1.35" }}>{CONTENT.intro.starringDash}<br />{CONTENT.intro.starringPip}</div>
                </div>
              </div>
              <div style={{ position: "absolute", left: "200px", top: "430px", width: "520px", height: "170px", boxSizing: "border-box", background: "#fffdf6", border: "3.5px solid #1a1a1a", borderRadius: "225px 18px 255px 18px/18px 255px 18px 225px", transform: "rotate(0.3deg)", padding: "16px 24px" }}>
                <div style={{ fontFamily: "'Permanent Marker',cursive", fontSize: "19px", marginBottom: "8px" }}>HOW TO READ THIS THING</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 18px", fontSize: "17px", alignItems: "center" }}>
                  <span><span style={{ border: "2px solid #1a1a1a", borderRadius: "6px", padding: "0 8px" }}>←</span> <span style={{ border: "2px solid #1a1a1a", borderRadius: "6px", padding: "0 8px" }}>→</span> hop panels & turn pages</span>
                  <span><span style={{ border: "2px solid #1a1a1a", borderRadius: "6px", padding: "0 8px" }}>space</span> next</span>
                  <span>tabs below teleport</span>
                  <span><b>poke / drag</b> Dash. he's fine.</span>
                  <span><b>auto</b> plays it like a movie</span>
                </div>
                <div style={{ fontFamily: "'Caveat',cursive", fontSize: "17px", color: "#8a8378", marginTop: "8px" }}>Dash picks his own commute — walking, rolling, hopping, or ninja-poofing. going back involves explosives (thrown responsibly) or smoke.</div>
              </div>
            </div>
            <div style={{ position: "absolute", inset: "0", backfaceVisibility: "hidden", transform: "rotateY(180deg)", background: "#f3edd9", border: "2.5px solid #26241f", borderRadius: "12px 4px 4px 12px" }}></div>
          </div>
  )
}
