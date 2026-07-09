interface SkillsRevealProps {
  props?: Record<string, unknown>
}

const FALLBACK_LINES = ['', '', '', '']

export default function SkillsReveal({ props }: SkillsRevealProps) {
  const lines = Array.isArray(props?.lines) ? props.lines : FALLBACK_LINES
  return (
    <svg viewBox="0 0 470 240" width="470" height="240" style={{ display: "block", marginTop: "6px", overflow: "visible" }}>
      <path d="M110,36 L420,32" pathLength="100" fill="none" stroke="#ff5ca8" strokeWidth="30" strokeLinecap="round" opacity=".5" strokeDasharray="101" style={{ strokeDashoffset: "101", animation: "swipeonce .6s ease-out .1s forwards" }}></path>
      <text x="118" y="44" fontFamily="Permanent Marker, cursive" fontSize="25" fill="#1a1a1a" style={{ opacity: "0", animation: "fadeonce .3s ease-out .5s forwards" }}>{String(lines[0] ?? '')}</text>
      <path d="M110,94 L390,90" pathLength="100" fill="none" stroke="#ffd23f" strokeWidth="30" strokeLinecap="round" opacity=".55" strokeDasharray="101" style={{ strokeDashoffset: "101", animation: "swipeonce .6s ease-out .5s forwards" }}></path>
      <text x="118" y="102" fontFamily="Permanent Marker, cursive" fontSize="25" fill="#1a1a1a" style={{ opacity: "0", animation: "fadeonce .3s ease-out .9s forwards" }}>{String(lines[1] ?? '')}</text>
      <path d="M110,152 L430,148" pathLength="100" fill="none" stroke="#ff5ca8" strokeWidth="30" strokeLinecap="round" opacity=".5" strokeDasharray="101" style={{ strokeDashoffset: "101", animation: "swipeonce .6s ease-out .9s forwards" }}></path>
      <text x="118" y="160" fontFamily="Permanent Marker, cursive" fontSize="25" fill="#1a1a1a" style={{ opacity: "0", animation: "fadeonce .3s ease-out 1.3s forwards" }}>{String(lines[2] ?? '')}</text>
      <path d="M110,210 L400,206" pathLength="100" fill="none" stroke="#ffd23f" strokeWidth="30" strokeLinecap="round" opacity=".55" strokeDasharray="101" style={{ strokeDashoffset: "101", animation: "swipeonce .6s ease-out 1.3s forwards" }}></path>
      <text x="118" y="218" fontFamily="Permanent Marker, cursive" fontSize="25" fill="#1a1a1a" style={{ opacity: "0", animation: "fadeonce .3s ease-out 1.7s forwards" }}>{String(lines[3] ?? '')}</text>
    </svg>
  )
}
