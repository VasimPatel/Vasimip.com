import { cn } from "@/lib/utils"

interface MarginLineProps {
  className?: string
}

export function MarginLine({ className }: MarginLineProps) {
  return (
    <div
      className={cn(
        "absolute left-[64px] top-0 bottom-0 w-[2px] bg-[var(--notebook-margin)]",
        className
      )}
      aria-hidden="true"
    />
  )
}
