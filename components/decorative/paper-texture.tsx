import { cn } from "@/lib/utils"

interface PaperTextureProps {
  className?: string
}

export function PaperTexture({ className }: PaperTextureProps) {
  return (
    <div
      className={cn(
        "absolute inset-0 pointer-events-none opacity-[0.03]",
        className
      )}
      style={{ filter: "url(#paper-grain)" }}
      aria-hidden="true"
    />
  )
}
