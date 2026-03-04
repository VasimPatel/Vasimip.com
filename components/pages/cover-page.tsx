"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { HandwritingAnimation } from "@/components/handwriting-animation"
import { useNotebookStore } from "@/lib/stores/notebook-store"
import { useReducedMotion } from "@/hooks/use-reduced-motion"

export function CoverPage() {
  const [isClient, setIsClient] = useState(false)
  const [nameComplete, setNameComplete] = useState(false)
  const nextPage = useNotebookStore((s) => s.nextPage)
  const reducedMotion = useReducedMotion()

  useEffect(() => {
    setIsClient(true)
  }, [])

  return (
    <div
      className="relative w-full h-full cursor-pointer overflow-hidden"
      onClick={nextPage}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") nextPage()
      }}
      aria-label="Click to open notebook"
    >
      {/* Marble pattern background */}
      <svg className="absolute inset-0 w-full h-full" aria-hidden="true">
        <defs>
          <filter id="marble-cover">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.015 0.08"
              numOctaves="6"
              seed="5"
              stitchTiles="stitch"
            />
            <feColorMatrix
              type="saturate"
              values="0"
            />
            <feComponentTransfer>
              <feFuncR type="table" tableValues="0.05 0.1 0.2 0.9 0.95 1" />
              <feFuncG type="table" tableValues="0.05 0.1 0.2 0.9 0.95 1" />
              <feFuncB type="table" tableValues="0.05 0.1 0.2 0.9 0.95 1" />
            </feComponentTransfer>
          </filter>
        </defs>
        <rect width="100%" height="100%" filter="url(#marble-cover)" />
      </svg>

      {/* Subtle vignette */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.3) 100%)",
        }}
      />

      {/* Center label area */}
      <div className="absolute inset-0 flex items-center justify-center">
        <motion.div
          className="bg-white border-2 border-gray-800 px-8 py-6 sm:px-12 sm:py-8 shadow-lg"
          initial={reducedMotion ? {} : { scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <div className="space-y-3 sm:space-y-4 text-center">
            {/* Name line */}
            <div className="border-b border-gray-400 pb-1">
              <span className="text-[10px] sm:text-xs text-gray-500 tracking-wider uppercase">
                Name
              </span>
              <div className="h-10 flex items-center justify-center">
                {isClient && (
                  <HandwritingAnimation
                    text="Vasim Patel"
                    duration={2500}
                    color="#2c3e50"
                    onComplete={() => setNameComplete(true)}
                  />
                )}
              </div>
            </div>

            {/* Subject line */}
            <div className="border-b border-gray-400 pb-1">
              <span className="text-[10px] sm:text-xs text-gray-500 tracking-wider uppercase">
                Subject
              </span>
              <motion.p
                className="font-[var(--font-caveat)] text-lg sm:text-xl text-gray-800 mt-1"
                initial={{ opacity: 0 }}
                animate={{ opacity: nameComplete || reducedMotion ? 1 : 0 }}
                transition={{ duration: 0.5 }}
              >
                Engineering & Design
              </motion.p>
            </div>

            {/* Period / Date */}
            <div className="border-b border-gray-400 pb-1">
              <span className="text-[10px] sm:text-xs text-gray-500 tracking-wider uppercase">
                Period
              </span>
              <motion.p
                className="font-[var(--font-caveat)] text-base sm:text-lg text-gray-800 mt-1"
                initial={{ opacity: 0 }}
                animate={{ opacity: nameComplete || reducedMotion ? 1 : 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
              >
                2024 – Present
              </motion.p>
            </div>
          </div>
        </motion.div>
      </div>

      {/* "Click to open" hint */}
      <motion.div
        className="absolute bottom-6 left-0 right-0 text-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: nameComplete || reducedMotion ? 0.6 : 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
      >
        <span className="text-xs text-gray-500 font-[var(--font-caveat)] tracking-wide">
          click anywhere to open →
        </span>
      </motion.div>
    </div>
  )
}
