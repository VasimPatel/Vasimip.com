import { cn } from "@/lib/utils"

interface DeskSurfaceProps {
  children: React.ReactNode
  className?: string
}

export function DeskSurface({ children, className }: DeskSurfaceProps) {
  return (
    <div
      className={cn(
        "min-h-screen w-full bg-[var(--notebook-desk)] flex items-center justify-center p-4 sm:p-8 transition-colors duration-500",
        className
      )}
      style={{
        backgroundImage: `
          radial-gradient(ellipse at 30% 20%, rgba(255,235,180,0.15) 0%, transparent 60%),
          linear-gradient(180deg, var(--notebook-desk) 0%, var(--notebook-desk-dark) 100%)
        `,
      }}
    >
      {children}
    </div>
  )
}
