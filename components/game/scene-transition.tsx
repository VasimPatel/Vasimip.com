"use client"

import { AnimatePresence, motion } from "framer-motion"
import { useGameStore } from "@/lib/stores/game-store"
import { useReducedMotion } from "@/hooks/use-reduced-motion"
import { ZONES } from "@/lib/data/zones"

interface SceneTransitionProps {
  children: React.ReactNode
  zoneKey: number
}

function getTransitionVariants(type: string, direction: number) {
  switch (type) {
    case "diagonal":
      return {
        enter: {
          clipPath: direction > 0
            ? "polygon(100% 0%, 100% 0%, 100% 0%)"
            : "polygon(0% 100%, 0% 100%, 0% 100%)",
          opacity: 0,
        },
        center: {
          clipPath: "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)",
          opacity: 1,
        },
        exit: {
          clipPath: direction > 0
            ? "polygon(0% 100%, 0% 100%, 0% 100%)"
            : "polygon(100% 0%, 100% 0%, 100% 0%)",
          opacity: 0,
        },
      }

    case "horizontal":
      return {
        enter: {
          x: direction > 0 ? "100%" : "-100%",
          opacity: 0,
        },
        center: {
          x: 0,
          opacity: 1,
        },
        exit: {
          x: direction > 0 ? "-100%" : "100%",
          opacity: 0,
        },
      }

    case "vertical":
      return {
        enter: {
          y: direction > 0 ? "100%" : "-100%",
          opacity: 0,
        },
        center: {
          y: 0,
          opacity: 1,
        },
        exit: {
          y: direction > 0 ? "-100%" : "100%",
          opacity: 0,
        },
      }

    case "radial":
      return {
        enter: {
          clipPath: "circle(0% at 50% 50%)",
          opacity: 0,
        },
        center: {
          clipPath: "circle(75% at 50% 50%)",
          opacity: 1,
        },
        exit: {
          clipPath: "circle(0% at 50% 50%)",
          opacity: 0,
        },
      }

    case "smash":
      return {
        enter: {
          scale: 3,
          opacity: 0,
          rotate: direction > 0 ? 15 : -15,
        },
        center: {
          scale: 1,
          opacity: 1,
          rotate: 0,
        },
        exit: {
          scale: 0,
          opacity: 0,
          rotate: direction > 0 ? -15 : 15,
        },
      }

    default: // fade
      return {
        enter: { opacity: 0 },
        center: { opacity: 1 },
        exit: { opacity: 0 },
      }
  }
}

export function SceneTransition({ children, zoneKey }: SceneTransitionProps) {
  const zoneDirection = useGameStore((s) => s.zoneDirection)
  const reducedMotion = useReducedMotion()

  const zone = ZONES[zoneKey] || ZONES[0]
  const transitionType = zone.transition

  const variants = reducedMotion
    ? {
        enter: { opacity: 0 },
        center: { opacity: 1 },
        exit: { opacity: 0 },
      }
    : getTransitionVariants(transitionType, zoneDirection)

  return (
    <AnimatePresence mode="wait" custom={zoneDirection}>
      <motion.div
        key={zoneKey}
        custom={zoneDirection}
        variants={variants}
        initial="enter"
        animate="center"
        exit="exit"
        transition={
          reducedMotion
            ? { duration: 0.15 }
            : {
                duration: 0.5,
                ease: [0.22, 1, 0.36, 1],
              }
        }
        className="absolute inset-0"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}
