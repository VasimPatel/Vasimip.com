"use client"

import { useEffect, useState } from "react"
import { HandwritingAnimation } from "./handwriting-animation"

interface CompositionNotebookProps {
  /**
   * The name to be written on the notebook page
   */
  name: string
  /**
   * The line number (1-based) where the name should appear
   * Default: 8 (middle of the page)
   */
  lineNumber?: number
  /**
   * Duration of the writing animation in milliseconds
   * Default: 3000ms
   */
  animationDuration?: number
}

/**
 * CompositionNotebook Component
 *
 * A realistic composition notebook page with ruled lines and a red margin line.
 * Features an animated handwriting effect that simulates human writing stroke-by-stroke.
 *
 * @example
 * ```tsx
 * <CompositionNotebook name="John Doe" lineNumber={5} animationDuration={2500} />
 * ```
 *
 * @component
 */
export default function CompositionNotebook({
  name,
  lineNumber = 8,
  animationDuration = 3000,
}: CompositionNotebookProps) {
  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    setIsClient(true)
  }, [])

  // Calculate the vertical position based on line number
  const lineHeight = 32 // pixels between lines
  const topMargin = 60 // top margin before first line
  const yPosition = topMargin + (lineNumber - 1) * lineHeight

  return (
    <div className="relative w-full max-w-3xl aspect-[8.5/11] bg-white shadow-2xl rounded-sm overflow-hidden">
      {/* Notebook paper texture */}
      <div className="absolute inset-0 bg-[#fefef8]" />

      {/* Red margin line */}
      <div className="absolute left-16 top-0 bottom-0 w-[2px] bg-[#e74c3c]" />

      {/* Horizontal ruled lines */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none">
        <defs>
          <pattern id="lines" x="0" y={topMargin} width="100%" height={lineHeight} patternUnits="userSpaceOnUse">
            <line x1="0" y1="0" x2="100%" y2="0" stroke="#d4e5f7" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#lines)" />
      </svg>

      {/* Handwriting animation */}
      {isClient && (
        <div className="absolute left-20 right-8" style={{ top: `${yPosition - 20}px` }}>
          <HandwritingAnimation text={name} duration={animationDuration} />
        </div>
      )}

      {/* Paper edge shadow for depth */}
      <div className="absolute inset-0 pointer-events-none shadow-inner" />
    </div>
  )
}
