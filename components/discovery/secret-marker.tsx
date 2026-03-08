"use client"

import { useState, useRef, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { useDiscovery } from "@/hooks/use-discovery"
import { useReducedMotion } from "@/hooks/use-reduced-motion"
import type { SecretTrigger } from "@/lib/data/secrets"

interface SecretMarkerProps {
  secretId: string
  trigger: SecretTrigger
  children: React.ReactNode
  /** Content shown after discovery */
  revealContent?: React.ReactNode
  className?: string
  /** Proximity distance in px (for "proximity" trigger) */
  proximityRadius?: number
}

export function SecretMarker({
  secretId,
  trigger,
  children,
  revealContent,
  className,
  proximityRadius = 80,
}: SecretMarkerProps) {
  const { discoverSecret, isDiscovered } = useDiscovery()
  const discovered = isDiscovered(secretId)
  const reducedMotion = useReducedMotion()
  const [showReveal, setShowReveal] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const clickCountRef = useRef(0)
  const clickTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  const handleDiscover = useCallback(() => {
    if (discovered) return
    discoverSecret(secretId)
    setShowReveal(true)
  }, [discovered, discoverSecret, secretId])

  // Proximity trigger: discover when mouse enters a close zone
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (trigger !== "proximity" || discovered) return
      if (!ref.current) return
      const rect = ref.current.getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      const dist = Math.hypot(e.clientX - cx, e.clientY - cy)
      if (dist < proximityRadius) {
        handleDiscover()
      }
    },
    [trigger, discovered, proximityRadius, handleDiscover]
  )

  // Click trigger: single click
  const handleClick = useCallback(() => {
    if (trigger === "click" && !discovered) {
      handleDiscover()
    }
    // Break trigger: rapid clicks (5 within 2s)
    if (trigger === "break" && !discovered) {
      clickCountRef.current++
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current)
      clickTimerRef.current = setTimeout(() => {
        clickCountRef.current = 0
      }, 2000)
      if (clickCountRef.current >= 5) {
        handleDiscover()
      }
    }
    // Already discovered — toggle reveal
    if (discovered) {
      setShowReveal((v) => !v)
    }
  }, [trigger, discovered, handleDiscover])

  // Drag trigger: handle drag end
  const handleDragEnd = useCallback(() => {
    if (trigger === "drag" && !discovered) {
      handleDiscover()
    }
  }, [trigger, discovered, handleDiscover])

  const isDraggable = trigger === "drag" && !discovered
  const isClickable = trigger === "click" || trigger === "break" || discovered

  return (
    <motion.div
      ref={ref}
      className={cn("relative", className)}
      onMouseMove={handleMouseMove}
      onClick={isClickable ? handleClick : undefined}
      drag={isDraggable}
      dragConstraints={{ top: 0, left: 0, right: 0, bottom: 0 }}
      dragElastic={0.3}
      onDragEnd={isDraggable ? handleDragEnd : undefined}
      style={{ cursor: isClickable ? "pointer" : isDraggable ? "grab" : undefined }}
    >
      {/* Undiscovered hint glow */}
      {!discovered && (
        <motion.div
          className="absolute inset-0 rounded pointer-events-none"
          style={{
            boxShadow: "0 0 12px 2px var(--comic-yellow)",
            opacity: 0,
          }}
          animate={{ opacity: [0, 0.4, 0] }}
          transition={{
            duration: 2.5,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      )}

      {/* Discovery flash */}
      <AnimatePresence>
        {discovered && showReveal && (
          <motion.div
            className="absolute inset-0 rounded pointer-events-none z-10"
            initial={{ opacity: 1, scale: 1 }}
            animate={{ opacity: 0, scale: 1.3 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            style={{ backgroundColor: "var(--comic-yellow)" }}
          />
        )}
      </AnimatePresence>

      {children}

      {/* Revealed content */}
      <AnimatePresence>
        {discovered && showReveal && revealContent && (
          <motion.div
            initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.95 }}
            animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.95 }}
            className="mt-2"
          >
            {revealContent}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Discovered badge */}
      {discovered && (
        <motion.div
          className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-[var(--comic-yellow)] border-2 border-[var(--comic-panel-border)] flex items-center justify-center z-20"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 400, damping: 15 }}
        >
          <span className="text-[8px]">✦</span>
        </motion.div>
      )}
    </motion.div>
  )
}
