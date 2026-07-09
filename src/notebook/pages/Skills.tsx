import { CONTENT } from '../content'
import type { SkillsProps } from '../types'

export default function Skills(p: SkillsProps) {
  return (
    <div style={{ position: 'absolute', inset: 0, transformOrigin: 'left center', transformStyle: 'preserve-3d', transition: 'transform .78s cubic-bezier(.5,.08,.28,1)', ...p.style }}>
            <div style={{ position: "absolute", inset: "0", backfaceVisibility: "hidden", boxSizing: "border-box", backgroundColor: "#fdfbf3", backgroundImage: "linear-gradient(90deg, transparent 58px, rgba(224,96,96,.5) 58px, rgba(224,96,96,.5) 60px, transparent 60px), repeating-linear-gradient(transparent 0px, transparent 26px, rgba(122,168,204,.38) 26px, rgba(122,168,204,.38) 27.5px)", border: "2.5px solid #26241f", borderRadius: "4px 12px 12px 4px", boxShadow: "8px 10px 22px rgba(0,0,0,.28)" }}>
              <div style={{ position: "absolute", left: "70px", top: "90px", width: "520px", height: "330px", boxSizing: "border-box", background: "#fffdf6", border: "3.5px solid #1a1a1a", borderRadius: "255px 18px 225px 18px/18px 225px 18px 255px", transform: "rotate(-0.3deg)", padding: "16px 22px" }}>
                <div style={{ fontFamily: "'Permanent Marker',cursive", fontSize: "22px" }}>SKILLS <span style={{ fontFamily: "'Caveat',cursive", fontSize: "16px", color: "#8a8378" }}>(certified-ish)</span></div>
                {p.skillsOn && (
                  <svg viewBox="0 0 470 240" width="470" height="240" style={{ display: "block", marginTop: "6px", overflow: "visible" }}>
                    <path d="M110,36 L420,32" pathLength="100" fill="none" stroke="#ff5ca8" strokeWidth="30" strokeLinecap="round" opacity=".5" strokeDasharray="101" style={{ strokeDashoffset: "101", animation: "swipeonce .6s ease-out .1s forwards" }}></path>
                    <text x="118" y="44" fontFamily="Permanent Marker, cursive" fontSize="25" fill="#1a1a1a" style={{ opacity: "0", animation: "fadeonce .3s ease-out .5s forwards" }}>{CONTENT.skills.skills[0]}</text>
                    <path d="M110,94 L390,90" pathLength="100" fill="none" stroke="#ffd23f" strokeWidth="30" strokeLinecap="round" opacity=".55" strokeDasharray="101" style={{ strokeDashoffset: "101", animation: "swipeonce .6s ease-out .5s forwards" }}></path>
                    <text x="118" y="102" fontFamily="Permanent Marker, cursive" fontSize="25" fill="#1a1a1a" style={{ opacity: "0", animation: "fadeonce .3s ease-out .9s forwards" }}>{CONTENT.skills.skills[1]}</text>
                    <path d="M110,152 L430,148" pathLength="100" fill="none" stroke="#ff5ca8" strokeWidth="30" strokeLinecap="round" opacity=".5" strokeDasharray="101" style={{ strokeDashoffset: "101", animation: "swipeonce .6s ease-out .9s forwards" }}></path>
                    <text x="118" y="160" fontFamily="Permanent Marker, cursive" fontSize="25" fill="#1a1a1a" style={{ opacity: "0", animation: "fadeonce .3s ease-out 1.3s forwards" }}>{CONTENT.skills.skills[2]}</text>
                    <path d="M110,210 L400,206" pathLength="100" fill="none" stroke="#ffd23f" strokeWidth="30" strokeLinecap="round" opacity=".55" strokeDasharray="101" style={{ strokeDashoffset: "101", animation: "swipeonce .6s ease-out 1.3s forwards" }}></path>
                    <text x="118" y="218" fontFamily="Permanent Marker, cursive" fontSize="25" fill="#1a1a1a" style={{ opacity: "0", animation: "fadeonce .3s ease-out 1.7s forwards" }}>{CONTENT.skills.skills[3]}</text>
                  </svg>
                )}
                <div style={{ position: "absolute", right: "20px", bottom: "10px", fontFamily: "'Caveat',cursive", fontSize: "16px", color: "#8a8378" }}>fresh paint — wet</div>
              </div>
              <div style={{ position: "absolute", left: "630px", top: "140px", width: "230px", height: "260px", boxSizing: "border-box", background: "#fffdf6", border: "3.5px solid #1a1a1a", borderRadius: "18px 225px 18px 255px/255px 18px 225px 18px", transform: "rotate(0.6deg)", padding: "16px 20px" }}>
                <div style={{ fontFamily: "'Permanent Marker',cursive", fontSize: "18px", marginBottom: "8px" }}>TOOLBELT</div>
                <svg viewBox="0 0 180 160" width="180" height="160" style={{ overflow: "visible" }}>
                  <rect x="14" y="18" width="64" height="14" fill="#ffd23f" stroke="#1a1a1a" strokeWidth="2.4"></rect>
                  <path d="M78,18 L94,25 L78,32 Z" fill="#fffdf6" stroke="#1a1a1a" strokeWidth="2.4" strokeLinejoin="round"></path>
                  <text x="104" y="30" fontFamily="Caveat, cursive" fontWeight="600" fontSize="16" fill="#5a544a">{CONTENT.skills.toolbelt[0]}</text>
                  <circle cx="38" cy="74" r="13" fill="#1a1a1a"></circle>
                  <path d="M46,64 q7,-8 13,-8" fill="none" stroke="#1a1a1a" strokeWidth="2.4" strokeLinecap="round"></path>
                  <text x="70" y="80" fontFamily="Caveat, cursive" fontWeight="600" fontSize="16" fill="#5a544a">{CONTENT.skills.toolbelt[1]}</text>
                  <rect x="26" y="112" width="18" height="30" rx="3" fill="#fffdf6" stroke="#1a1a1a" strokeWidth="2.4"></rect>
                  <circle cx="35" cy="108" r="2.4" fill="#1a1a1a"></circle>
                  <text x="60" y="132" fontFamily="Caveat, cursive" fontWeight="600" fontSize="16" fill="#5a544a">{CONTENT.skills.toolbelt[2]}</text>
                </svg>
              </div>
            </div>
            <div style={{ position: "absolute", inset: "0", backfaceVisibility: "hidden", transform: "rotateY(180deg)", background: "#f3edd9", border: "2.5px solid #26241f", borderRadius: "12px 4px 4px 12px" }}></div>
          </div>
  )
}
