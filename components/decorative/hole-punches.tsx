import { cn } from "@/lib/utils"

interface HolePunchesProps {
  className?: string
}

export function HolePunches({ className }: HolePunchesProps) {
  return (
    <div className={cn("absolute left-0 top-0 bottom-0 w-[32px] flex flex-col items-center justify-around py-16 pointer-events-none", className)} aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="w-5 h-5 rounded-full bg-[var(--notebook-desk)] border-2 border-gray-300/50 shadow-inner"
        />
      ))}
    </div>
  )
}
