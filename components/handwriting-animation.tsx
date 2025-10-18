"use client"

import { useEffect, useRef } from "react"

interface HandwritingAnimationProps {
  /**
   * The text to animate with handwriting effect
   */
  text: string
  /**
   * Total duration of the animation in milliseconds
   */
  duration?: number
  /**
   * Color of the handwriting
   */
  color?: string
  /**
   * Callback fired when animation completes
   */
  onComplete?: () => void
}

/**
 * Letter stroke definitions for realistic handwriting animation.
 * Each letter is broken down into individual strokes that are drawn in order,
 * simulating how a person would actually write each letter.
 */
const LETTER_STROKES: Record<string, Array<{ path: string; delay: number }>> = {
  V: [
    { path: "M 2,0 Q 4,8 8,20 Q 10,26 11,32", delay: 0 }, // Left diagonal with slight curve
    { path: "M 11,32 Q 13,26 17,16 Q 19,8 22,0", delay: 0.3 }, // Right diagonal with curve
  ],
  a: [
    {
      path: "M 18,18 Q 16,14 12,14 Q 6,14 4,19 Q 2,24 6,28 Q 10,32 16,30 Q 18,29 18,26 L 18,18 Q 18,32 18,32",
      delay: 0,
    }, // Cursive 'a' with flowing tail
  ],
  s: [
    {
      path: "M 18,16 Q 16,13 12,13 Q 6,13 5,18 Q 4,22 8,24 Q 12,26 14,28 Q 16,30 12,32 Q 8,33 6,30",
      delay: 0,
    }, // Flowing S curve
  ],
  i: [
    { path: "M 6,18 Q 6,22 6,28 Q 6,32 8,32", delay: 0 }, // Vertical with slight curve at bottom
    { path: "M 6,12 Q 6.5,12.5 6,13", delay: 0.2 }, // Dot with slight curve
  ],
  m: [
    {
      path: "M 2,32 L 2,18 Q 2,16 4,16",
      delay: 0,
    }, // Left vertical with entry stroke
    {
      path: "M 4,16 Q 8,14 10,16 Q 11,18 11,24 L 11,32",
      delay: 0.25,
    }, // First hump with curve
    {
      path: "M 11,18 Q 15,14 18,16 Q 19,18 19,24 L 19,32",
      delay: 0.5,
    }, // Second hump with curve
  ],
  P: [
    { path: "M 2,36 Q 2,32 2,16 Q 2,4 2,0", delay: 0 }, // Vertical line with slight curve
    {
      path: "M 2,0 Q 4,0 8,0 Q 16,0 18,6 Q 20,12 16,16 Q 12,18 6,18 L 2,18",
      delay: 0.3,
    }, // Rounded top loop
  ],
  t: [
    {
      path: "M 10,6 Q 10,12 10,24 Q 10,30 12,32 Q 14,34 18,33",
      delay: 0,
    }, // Vertical with curved bottom
    { path: "M 4,18 Q 8,17 12,17 Q 16,17 18,18", delay: 0.3 }, // Curved cross
  ],
  e: [
    {
      path: "M 4,22 L 18,22 Q 20,22 20,19 Q 20,14 16,12 Q 10,10 6,14 Q 2,18 4,24 Q 6,30 12,32 Q 16,33 18,30",
      delay: 0,
    }, // Flowing 'e' with natural curves
  ],
  l: [
    { path: "M 6,2 Q 6,8 6,20 Q 6,28 6,32", delay: 0 }, // Vertical line with slight natural variation
  ],
  " ": [], // Space has no strokes
}

/**
 * HandwritingAnimation Component
 *
 * Renders text with a realistic letter-by-letter handwriting animation.
 * Each letter is drawn stroke-by-stroke in the order a human would write it.
 *
 * ## How it works:
 * 1. Text is split into individual letters
 * 2. Each letter is rendered as SVG paths representing individual pen strokes
 * 3. Strokes are animated sequentially using stroke-dasharray technique
 * 4. Letters appear left-to-right as they're "written"
 *
 * ## Extending:
 * - Add more letters to LETTER_STROKES object with their stroke paths
 * - Adjust stroke delays for different writing speeds
 * - Modify strokeWidth for pen thickness
 * - Change duration for overall animation speed
 *
 * @example
 * \`\`\`tsx
 * <HandwritingAnimation
 *   text="Hello"
 *   duration={3000}
 *   color="#2c3e50"
 * />
 * \`\`\`
 *
 * @component
 */
export function HandwritingAnimation({
  text,
  duration = 4000,
  color = "#2c3e50",
  onComplete,
}: HandwritingAnimationProps) {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!svgRef.current) return

    const svg = svgRef.current
    const letters = text.split("")

    // Calculate timing for each letter
    const timePerLetter = duration / letters.length
    let currentX = 0
    const letterSpacing = 26 // Space between letters

    // Clear previous content
    while (svg.firstChild) {
      svg.removeChild(svg.firstChild)
    }

    // Create a group for each letter
    letters.forEach((letter, letterIndex) => {
      const strokes = LETTER_STROKES[letter] || []
      const letterGroup = document.createElementNS("http://www.w3.org/2000/svg", "g")
      letterGroup.setAttribute("transform", `translate(${currentX}, 0)`)

      strokes.forEach((stroke, strokeIndex) => {
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path")
        path.setAttribute("d", stroke.path)
        path.setAttribute("fill", "none")
        path.setAttribute("stroke", color)
        path.setAttribute("stroke-width", "2.2")
        path.setAttribute("stroke-linecap", "round")
        path.setAttribute("stroke-linejoin", "round")

        // Calculate path length for animation
        const pathLength = path.getTotalLength()
        path.style.strokeDasharray = `${pathLength}`
        path.style.strokeDashoffset = `${pathLength}`

        // Calculate animation timing
        const letterStartTime = letterIndex * timePerLetter
        const strokeDuration = timePerLetter * 0.5 // Each stroke takes 60% of letter time
        const strokeDelay = letterStartTime + stroke.delay * timePerLetter

        // Animate the stroke
        setTimeout(() => {
          path.style.transition = `stroke-dashoffset ${strokeDuration}ms ease-in-out`
          path.style.strokeDashoffset = "0"
        }, strokeDelay)

        letterGroup.appendChild(path)
      })

      svg.appendChild(letterGroup)

      // Update X position for next letter
      if (letter === " ") {
        currentX += letterSpacing * 1.2 // Smaller space for actual spaces
      } else {
        currentX += letterSpacing
      }
    })

    // Set viewBox to fit all letters
    const totalWidth = currentX
    svg.setAttribute("viewBox", `0 0 ${totalWidth} 40`)
    svg.setAttribute("width", `${totalWidth}`)
    svg.setAttribute("height", "40")

    // Call onComplete callback
    if (onComplete) {
      const timer = setTimeout(onComplete, duration)
      return () => clearTimeout(timer)
    }
  }, [text, duration, color, onComplete])

  return (
    <div className="relative w-full flex items-center" style={{ minHeight: "60px" }}>
      <svg ref={svgRef} className="h-auto" style={{ maxWidth: "100%" }} />
    </div>
  )
}
