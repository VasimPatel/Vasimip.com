"use client"

import { useRef, useEffect } from "react"
import { useScroll } from "framer-motion"
import { cn } from "@/lib/utils"
import { usePresenceStore } from "@/lib/stores/presence-store"
import { useWorldStore } from "@/lib/stores/world-store"

interface WorldScrollProps {
  children: React.ReactNode
  className?: string
}

export function WorldScroll({ children, className }: WorldScrollProps) {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress, scrollY } = useScroll({ container: ref })
  const setScroll = usePresenceStore((s) => s.setScroll)
  const setScrollDepth = useWorldStore((s) => s.setScrollDepth)
  const lastScrollY = useRef(0)

  useEffect(() => {
    const unsubY = scrollY.on("change", (y) => {
      const direction = y > lastScrollY.current ? "down" : y < lastScrollY.current ? "up" : "idle"
      lastScrollY.current = y
      const progress = scrollYProgress.get()
      setScroll(y, progress, direction)
      setScrollDepth(progress)
    })

    return () => unsubY()
  }, [scrollY, scrollYProgress, setScroll, setScrollDepth])

  return (
    <div
      ref={ref}
      className={cn("h-screen overflow-y-auto overflow-x-hidden void-scroll scroll-smooth", className)}
    >
      {children}
    </div>
  )
}
