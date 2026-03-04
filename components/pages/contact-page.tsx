"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import { NotebookPage } from "@/components/notebook/notebook-page"
import { useReducedMotion } from "@/hooks/use-reduced-motion"

const contactSchema = z.object({
  name: z.string().min(1, "Write your name!"),
  message: z.string().min(1, "Don't leave it blank!"),
  reason: z.enum(["hi", "job", "collab"]),
})

type ContactForm = z.infer<typeof contactSchema>

export function ContactPage() {
  const [submitted, setSubmitted] = useState(false)
  const [isFlying, setIsFlying] = useState(false)
  const reducedMotion = useReducedMotion()

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ContactForm>({
    resolver: zodResolver(contactSchema),
    defaultValues: { reason: "hi" },
  })

  const onSubmit = () => {
    setIsFlying(true)
    setTimeout(() => {
      setIsFlying(false)
      setSubmitted(true)
    }, reducedMotion ? 100 : 1200)
  }

  return (
    <NotebookPage>
      <motion.h1
        className="font-[var(--font-caveat)] text-3xl sm:text-4xl text-[var(--notebook-ink)] mb-1 leading-[32px]"
        initial={reducedMotion ? {} : { opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
      >
        Pass Me a Note
      </motion.h1>
      <div className="w-24 h-[2px] bg-[var(--notebook-ink)] opacity-30 mb-4" />

      <AnimatePresence mode="wait">
        {!submitted ? (
          <motion.div
            key="form"
            initial={reducedMotion ? {} : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={
              isFlying && !reducedMotion
                ? {
                    x: 300,
                    y: -200,
                    rotate: 45,
                    scale: 0.3,
                    opacity: 0,
                  }
                : { opacity: 0 }
            }
            transition={{ duration: isFlying ? 0.8 : 0.3, ease: "easeIn" }}
          >
            <form
              onSubmit={handleSubmit(onSubmit)}
              className="space-y-4 max-w-sm"
              style={{
                transform: "rotate(-0.5deg)",
              }}
            >
              {/* Name field */}
              <div>
                <label className="font-[var(--font-caveat)] text-base text-[var(--notebook-ink)] opacity-60">
                  From:
                </label>
                <input
                  {...register("name")}
                  className="w-full bg-transparent border-b border-[var(--notebook-ink)]/30 focus:border-[var(--notebook-ink)] outline-none font-[var(--font-caveat)] text-lg text-[var(--notebook-ink)] py-1 px-1 transition-colors"
                  placeholder="Your name"
                  autoComplete="name"
                />
                {errors.name && (
                  <span className="text-red-500 text-sm font-[var(--font-caveat)] italic">
                    ← {errors.name.message}
                  </span>
                )}
              </div>

              {/* Reason radio buttons */}
              <div>
                <label className="font-[var(--font-caveat)] text-base text-[var(--notebook-ink)] opacity-60">
                  I&apos;m:
                </label>
                <div className="flex flex-wrap gap-3 mt-1">
                  {[
                    { value: "hi", label: "Saying hi" },
                    { value: "job", label: "Job opportunity" },
                    { value: "collab", label: "Let's collaborate" },
                  ].map((option) => (
                    <label
                      key={option.value}
                      className="flex items-center gap-1.5 font-[var(--font-caveat)] text-base text-[var(--notebook-ink)] cursor-pointer"
                    >
                      <input
                        type="radio"
                        value={option.value}
                        {...register("reason")}
                        className="accent-[var(--notebook-ink)]"
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
              </div>

              {/* Message field */}
              <div>
                <label className="font-[var(--font-caveat)] text-base text-[var(--notebook-ink)] opacity-60">
                  Message:
                </label>
                <textarea
                  {...register("message")}
                  rows={4}
                  className="w-full bg-transparent border-b border-[var(--notebook-ink)]/30 focus:border-[var(--notebook-ink)] outline-none font-[var(--font-caveat)] text-lg text-[var(--notebook-ink)] py-1 px-1 resize-none transition-colors leading-[32px]"
                  style={{
                    backgroundImage:
                      "repeating-linear-gradient(transparent, transparent 31px, var(--notebook-lines) 31px, var(--notebook-lines) 32px)",
                  }}
                  placeholder="Write something..."
                />
                {errors.message && (
                  <span className="text-red-500 text-sm font-[var(--font-caveat)] italic">
                    ← {errors.message.message}
                  </span>
                )}
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={isFlying}
                className="font-[var(--font-caveat)] text-lg text-[var(--notebook-ink)] border-2 border-dashed border-[var(--notebook-ink)]/40 px-6 py-2 rounded-sm hover:bg-[var(--notebook-ink)]/5 transition-colors disabled:opacity-50"
              >
                {isFlying ? "✈️ Sending..." : "Fold & Send ✈️"}
              </button>
            </form>
          </motion.div>
        ) : (
          <motion.div
            key="success"
            initial={reducedMotion ? { opacity: 1 } : { opacity: 0, y: 20, rotate: 2 }}
            animate={{ opacity: 1, y: 0, rotate: -1 }}
            transition={{ type: "spring", stiffness: 200, damping: 20 }}
            className="max-w-sm p-6 bg-[#fff9b1] shadow-md"
          >
            <p className="font-[var(--font-caveat)] text-2xl text-gray-800 mb-2">
              Note received! ✉️
            </p>
            <p className="font-[var(--font-caveat)] text-lg text-gray-600">
              Thanks for reaching out! I&apos;ll get back to you soon.
            </p>
            <p className="font-[var(--font-caveat)] text-base text-gray-500 mt-3 italic">
              (This is a demo — connect via the links below for real!)
            </p>
            <div className="mt-3 flex gap-3 font-[var(--font-caveat)] text-base">
              <a href="https://github.com/VasimPatel" className="underline text-gray-700 hover:text-gray-900">
                GitHub
              </a>
              <a href="https://linkedin.com/in/" className="underline text-gray-700 hover:text-gray-900">
                LinkedIn
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Paper airplane doodle */}
      <div className="absolute bottom-4 right-4 opacity-20 pointer-events-none" aria-hidden="true">
        <svg viewBox="0 0 40 40" className="w-16 h-16" fill="none" stroke="var(--notebook-ink)" strokeWidth="1" strokeLinecap="round">
          <path d="M5 35 L35 20 L5 5 L12 20 Z" />
          <path d="M12 20 L35 20" />
        </svg>
      </div>
    </NotebookPage>
  )
}
