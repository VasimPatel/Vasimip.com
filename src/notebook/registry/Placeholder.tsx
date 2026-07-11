interface PlaceholderProps {
  props?: Record<string, unknown>
}

/** A dashed, diagonally-striped "art goes here" box. Fills its art-box frame. */
export default function Placeholder({ props }: PlaceholderProps) {
  const label = typeof props?.label === 'string' ? props.label : ''
  return (
    <div style={{ width: "100%", height: "100%", boxSizing: "border-box", border: "2.5px dashed rgba(26,26,26,.45)", borderRadius: "8px", background: "repeating-linear-gradient(45deg, rgba(26,26,26,.05) 0px, rgba(26,26,26,.05) 12px, transparent 12px, transparent 24px)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "ui-monospace,monospace", fontSize: "12px", color: "#6a6458" }}>{label}</div>
  )
}
