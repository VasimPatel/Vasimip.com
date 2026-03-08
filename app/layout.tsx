import type React from "react"
import type { Metadata } from "next"
import { Geist, Geist_Mono, Caveat, Instrument_Serif } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import "./globals.css"

const geistSans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" })
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" })
const caveat = Caveat({ subsets: ["latin"], variable: "--font-caveat" })
const instrumentSerif = Instrument_Serif({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-instrument-serif",
})

export const metadata: Metadata = {
  title: "Ink & Ember",
  description: "A dark, atmospheric interactive experience. Move. Discover. Go deeper.",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${caveat.variable} ${instrumentSerif.variable} font-sans antialiased`}
      >
        {children}
        <Analytics />
      </body>
    </html>
  )
}
