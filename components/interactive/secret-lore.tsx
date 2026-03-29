"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"

interface SecretLoreProps {
  children: React.ReactNode
  className?: string
  onDecode?: () => void
}

// "Encrypted" rune-like characters
const RUNE_MAP: Record<string, string> = {
  a: "ᚨ", b: "ᛒ", c: "ᚲ", d: "ᛞ", e: "ᛖ", f: "ᚠ", g: "ᚷ", h: "ᚺ",
  i: "ᛁ", j: "ᛃ", k: "ᚲ", l: "ᛚ", m: "ᛗ", n: "ᚾ", o: "ᛟ", p: "ᛈ",
  q: "ᛩ", r: "ᚱ", s: "ᛊ", t: "ᛏ", u: "ᚢ", v: "ᚡ", w: "ᚹ", x: "ᛪ",
  y: "ᛦ", z: "ᛉ", " ": " ",
}

function encryptText(text: string): string {
  return text
    .toLowerCase()
    .split("")
    .map((char) => RUNE_MAP[char] || char)
    .join("")
}

export function SecretLore({ children, className, onDecode }: SecretLoreProps) {
  const [decoded, setDecoded] = useState(false)

  const handleSelect = () => {
    if (!decoded) {
      setDecoded(true)
      onDecode?.()
    }
  }

  const text = typeof children === "string" ? children : ""

  return (
    <span
      className={cn(
        "relative inline cursor-pointer transition-all duration-500",
        decoded
          ? "text-[var(--comic-ink)]"
          : "text-[var(--comic-purple)] font-mono tracking-wider",
        className
      )}
      onClick={handleSelect}
      onMouseUp={handleSelect}
      title={decoded ? undefined : "Select to decode..."}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && handleSelect()}
      aria-label={decoded ? undefined : "Encrypted text — click to decode"}
    >
      {decoded ? children : encryptText(text)}
      {!decoded && (
        <span className="ml-1 text-xs opacity-50">🔐</span>
      )}
    </span>
  )
}
