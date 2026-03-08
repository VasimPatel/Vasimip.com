"use client"

import { useRef, useEffect } from "react"
import { cn } from "@/lib/utils"
import { useWorldStore } from "@/lib/stores/world-store"

interface ZoneSectionProps {
  children: React.ReactNode
  passageIndex: number
  passageId: string
  className?: string
  minHeight?: string
}

export function ZoneSection({
  children,
  passageIndex,
  passageId,
  className,
  minHeight = "100vh",
}: ZoneSectionProps) {
  const ref = useRef<HTMLDivElement>(null)
  const setPassage = useWorldStore((s) => s.setPassage)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setPassage(passageIndex)
        }
      },
      {
        rootMargin: "-40% 0px -40% 0px",
        threshold: 0,
      }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [passageIndex, setPassage])

  return (
    <section
      ref={ref}
      id={passageId}
      className={cn("relative", className)}
      style={{ minHeight }}
    >
      {children}
    </section>
  )
}
