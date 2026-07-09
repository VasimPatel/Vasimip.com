interface ToolbeltProps {
  props?: Record<string, unknown>
}

const FALLBACK_LABELS = ['', '', '']

export default function Toolbelt({ props }: ToolbeltProps) {
  const labels = Array.isArray(props?.labels) ? props.labels : FALLBACK_LABELS
  return (
    <svg viewBox="0 0 180 160" width="180" height="160" style={{ overflow: "visible" }}>
      <rect x="14" y="18" width="64" height="14" fill="#ffd23f" stroke="#1a1a1a" strokeWidth="2.4"></rect>
      <path d="M78,18 L94,25 L78,32 Z" fill="#fffdf6" stroke="#1a1a1a" strokeWidth="2.4" strokeLinejoin="round"></path>
      <text x="104" y="30" fontFamily="Caveat, cursive" fontWeight="600" fontSize="16" fill="#5a544a">{String(labels[0] ?? '')}</text>
      <circle cx="38" cy="74" r="13" fill="#1a1a1a"></circle>
      <path d="M46,64 q7,-8 13,-8" fill="none" stroke="#1a1a1a" strokeWidth="2.4" strokeLinecap="round"></path>
      <text x="70" y="80" fontFamily="Caveat, cursive" fontWeight="600" fontSize="16" fill="#5a544a">{String(labels[1] ?? '')}</text>
      <rect x="26" y="112" width="18" height="30" rx="3" fill="#fffdf6" stroke="#1a1a1a" strokeWidth="2.4"></rect>
      <circle cx="35" cy="108" r="2.4" fill="#1a1a1a"></circle>
      <text x="60" y="132" fontFamily="Caveat, cursive" fontWeight="600" fontSize="16" fill="#5a544a">{String(labels[2] ?? '')}</text>
    </svg>
  )
}
