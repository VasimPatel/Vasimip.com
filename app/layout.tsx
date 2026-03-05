import type React from "react"
import type { Metadata } from "next"
import { Geist, Geist_Mono, Caveat, Bangers, Press_Start_2P } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import { ThemeProvider } from "@/components/theme-provider"
import "./globals.css"

const geistSans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" })
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" })
const caveat = Caveat({ subsets: ["latin"], variable: "--font-caveat" })
const bangers = Bangers({ weight: "400", subsets: ["latin"], variable: "--font-bangers" })
const pressStart = Press_Start_2P({ weight: "400", subsets: ["latin"], variable: "--font-press-start" })

export const metadata: Metadata = {
  title: "Vasim Patel | Comic Book RPG Portfolio",
  description:
    "A comic book x RPG adventure portfolio — explore zones, earn XP, collect items, and discover the story of a software engineer.",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${caveat.variable} ${bangers.variable} ${pressStart.variable} font-sans antialiased bg-background text-foreground`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  )
}
