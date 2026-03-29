"use client"

import { useState, useEffect } from "react"
import { cn } from "@/lib/utils"
import { useReducedMotion } from "@/hooks/use-reduced-motion"

interface TypingTextProps {
  text: string
  speed?: number // ms per character
  delay?: number // ms before starting
  className?: string
  onComplete?: () => void
}

export function TypingText({
  text,
  speed = 50,
  delay = 0,
  className,
  onComplete,
}: TypingTextProps) {
  const [displayedText, setDisplayedText] = useState("")
  const [started, setStarted] = useState(false)
  const reducedMotion = useReducedMotion()

  useEffect(() => {
    if (reducedMotion) {
      setDisplayedText(text)
      onComplete?.()
      return
    }

    const delayTimer = setTimeout(() => setStarted(true), delay)
    return () => clearTimeout(delayTimer)
  }, [delay, reducedMotion, text, onComplete])

  useEffect(() => {
    if (!started || reducedMotion) return

    let index = 0
    const interval = setInterval(() => {
      index++
      setDisplayedText(text.slice(0, index))
      if (index >= text.length) {
        clearInterval(interval)
        onComplete?.()
      }
    }, speed)

    return () => clearInterval(interval)
  }, [started, text, speed, reducedMotion, onComplete])

  return (
    <span className={cn("inline", className)}>
      {displayedText}
      {!reducedMotion && displayedText.length < text.length && (
        <span className="inline-block w-[2px] h-[1em] bg-[var(--comic-ink)] animate-pulse ml-0.5 align-text-bottom" />
      )}
    </span>
  )
}
