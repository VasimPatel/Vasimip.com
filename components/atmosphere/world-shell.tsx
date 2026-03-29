"use client"

import { InkLayer } from "@/components/ink/ink-layer"
import { WorldScroll } from "@/components/world/world-scroll"
import { ZoneSection } from "@/components/world/zone-section"
import { Threshold } from "@/components/atmosphere/threshold"
import { OpeningSequence } from "@/components/atmosphere/opening-sequence"
import { InkReveal } from "@/components/ink/ink-reveal"
import { PhysicsPanel } from "@/components/panels/physics-panel"
import { ParallaxLayer } from "@/components/world/parallax-layer"
import { ProximityReveal } from "@/components/atmosphere/proximity-reveal"
import { PatienceReveal } from "@/components/atmosphere/patience-reveal"
import { useWorldStore } from "@/lib/stores/world-store"
import { getPassageForDepth } from "@/lib/data/passages"

export function WorldShell() {
  const scrollDepth = useWorldStore((s) => s.scrollDepth)

  const vhDepth = scrollDepth * 1100
  const currentPassage = getPassageForDepth(vhDepth)

  return (
    <div
      className="relative min-h-screen w-full overflow-hidden"
      style={{ backgroundColor: "var(--void)" }}
    >
      <OpeningSequence />
      <InkLayer
        lampRadius={currentPassage.lampRadius}
        particleDensity={currentPassage.particleDensity}
      />

      <WorldScroll>
        <div
          className="cursor-none-desktop"
          role="region"
          aria-label="Ink & Ember"
        >
          {/* ═══ Passage 1: The Surface ═══ */}
          {/* Pure void. The visitor learns the light. */}
          <ZoneSection passageIndex={0} passageId="surface" minHeight="100vh">
            <div className="relative h-screen flex flex-col items-center justify-center">
              <div className="absolute inset-x-[10vw] top-[20%] bottom-[20%]">
                <div className="structural-line border-l h-full" />
                <div className="structural-line border-t absolute top-1/3 inset-x-0" />
                <div className="structural-line border-t absolute top-2/3 inset-x-0" />
              </div>

              {/* Scroll indicator — the only invitation */}
              <div
                className="absolute bottom-12 flex flex-col items-center gap-2"
                style={{ opacity: 0.15 }}
              >
                <div
                  className="w-px h-10"
                  style={{
                    background: "linear-gradient(to bottom, transparent, var(--ember))",
                  }}
                />
                <div
                  className="w-1.5 h-1.5 rounded-full"
                  style={{
                    backgroundColor: "var(--ember)",
                    animation: "ember-pulse 2s ease-in-out infinite",
                  }}
                />
              </div>
            </div>
          </ZoneSection>

          {/* ═══ Threshold ═══ */}
          <Threshold text="Deeper, then." />

          {/* ═══ Passage 2: First marks ═══ */}
          {/* Content emerges from darkness. Sparse. Asymmetric. */}
          <ZoneSection passageIndex={1} passageId="first-room" minHeight="200vh">
            <div className="px-[10vw] py-40 space-y-32">
              <InkReveal direction="left">
                <PhysicsPanel className="p-10 sm:p-14 max-w-xl">
                  <p
                    className="font-display text-2xl sm:text-3xl leading-snug"
                    style={{ color: "var(--ink)" }}
                  >
                    Something is being built here.
                  </p>
                </PhysicsPanel>
              </InkReveal>

              <InkReveal direction="right" delay={0.1}>
                <div className="flex justify-end">
                  <PhysicsPanel className="p-8 sm:p-10 max-w-md" delay={0.2}>
                    <p
                      className="text-base leading-relaxed"
                      style={{ color: "var(--ink-dim)" }}
                    >
                      Not ready to show itself yet.
                      But the structure is here — the lines,
                      the weight, the way things respond to your attention.
                    </p>
                  </PhysicsPanel>
                </div>
              </InkReveal>

              <ParallaxLayer speed={0.3}>
                <div className="ml-[18vw]">
                  <ProximityReveal className="text-lg italic">
                    You found this by looking closely.
                  </ProximityReveal>
                </div>
              </ParallaxLayer>

              <InkReveal direction="left" delay={0.15}>
                <PhysicsPanel className="p-8 max-w-xs ml-[5vw]" delay={0.3}>
                  <p
                    className="text-sm leading-relaxed"
                    style={{ color: "var(--ink-dim)" }}
                  >
                    Try clicking. Try waiting.
                    Try moving slowly.
                  </p>
                </PhysicsPanel>
              </InkReveal>
            </div>
          </ZoneSection>

          {/* ═══ Threshold ═══ */}
          <Threshold text="You stayed." />

          {/* ═══ Passage 3: The room breathes ═══ */}
          {/* Denser. More panels. The atmosphere tightens. */}
          <ZoneSection passageIndex={2} passageId="the-craft" minHeight="200vh">
            <div className="px-[10vw] py-40 space-y-32">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-10 max-w-4xl mx-auto">
                <InkReveal direction="left">
                  <PhysicsPanel className="p-8" delay={0.1}>
                    <div
                      className="w-full h-24 rounded"
                      style={{
                        border: "1px solid rgba(212,160,84,0.12)",
                        background: "linear-gradient(135deg, rgba(212,160,84,0.03) 0%, transparent 60%)",
                      }}
                    />
                    <p
                      className="text-xs mt-4 font-mono"
                      style={{ color: "var(--ink-dim)" }}
                    >
                      placeholder / 01
                    </p>
                  </PhysicsPanel>
                </InkReveal>
                <InkReveal direction="right" delay={0.1}>
                  <PhysicsPanel className="p-8" delay={0.2}>
                    <div
                      className="w-full h-24 rounded"
                      style={{
                        border: "1px solid rgba(212,160,84,0.12)",
                        background: "linear-gradient(225deg, rgba(212,160,84,0.03) 0%, transparent 60%)",
                      }}
                    />
                    <p
                      className="text-xs mt-4 font-mono"
                      style={{ color: "var(--ink-dim)" }}
                    >
                      placeholder / 02
                    </p>
                  </PhysicsPanel>
                </InkReveal>
              </div>

              <InkReveal direction="center" delay={0.1}>
                <div className="max-w-lg mx-auto">
                  <PhysicsPanel className="p-10" delay={0.3}>
                    <div className="space-y-3">
                      {[...Array(4)].map((_, i) => (
                        <div
                          key={i}
                          className="h-px"
                          style={{
                            backgroundColor: "var(--ink)",
                            opacity: 0.08 + i * 0.03,
                            width: `${85 - i * 12}%`,
                          }}
                        />
                      ))}
                    </div>
                    <p
                      className="text-xs mt-6 font-mono"
                      style={{ color: "var(--ink-dim)" }}
                    >
                      content arrives when it&apos;s ready
                    </p>
                  </PhysicsPanel>
                </div>
              </InkReveal>

              <PatienceReveal className="text-center mt-16">
                <p
                  className="font-caveat text-lg"
                  style={{ color: "var(--ember)", opacity: 0.4 }}
                >
                  Patience is its own kind of looking.
                </p>
              </PatienceReveal>
            </div>
          </ZoneSection>

          {/* ═══ Threshold ═══ */}
          <Threshold text="This is where it gets interesting." />

          {/* ═══ Passage 4: Deeper structure ═══ */}
          {/* Things respond. The space knows you're here. */}
          <ZoneSection passageIndex={3} passageId="the-work" minHeight="200vh">
            <div className="px-[10vw] py-40 space-y-32">
              <InkReveal direction="left">
                <PhysicsPanel className="p-10 sm:p-14 max-w-2xl" draggable>
                  <p
                    className="font-display text-xl sm:text-2xl leading-relaxed"
                    style={{ color: "var(--ink)" }}
                  >
                    This panel moves. Drag it.
                  </p>
                  <p
                    className="text-sm mt-4 leading-relaxed"
                    style={{ color: "var(--ink-dim)" }}
                  >
                    Everything here is built to respond —
                    to tilt, to proximity, to attention.
                    The craft is in the feel.
                  </p>
                </PhysicsPanel>
              </InkReveal>

              <div className="flex justify-end">
                <InkReveal direction="right" delay={0.1}>
                  <PhysicsPanel className="p-8 max-w-sm" delay={0.2} draggable>
                    <p
                      className="text-sm leading-relaxed"
                      style={{ color: "var(--ink-dim)" }}
                    >
                      Hover close. Watch the border brighten.
                      Pull away. Watch it dim.
                    </p>
                  </PhysicsPanel>
                </InkReveal>
              </div>

              <ParallaxLayer speed={0.4}>
                <div className="ml-[12vw]">
                  <ProximityReveal className="text-base italic">
                    The light remembers where you&apos;ve been.
                  </ProximityReveal>
                </div>
              </ParallaxLayer>

              <InkReveal direction="center" delay={0.15}>
                <div className="max-w-xs mx-auto">
                  <PhysicsPanel className="p-6" delay={0.3}>
                    <div
                      className="w-8 h-8 rounded-full mx-auto"
                      style={{
                        background: "radial-gradient(circle, var(--ember) 0%, transparent 70%)",
                        opacity: 0.4,
                      }}
                    />
                  </PhysicsPanel>
                </div>
              </InkReveal>
            </div>
          </ZoneSection>

          {/* ═══ Threshold ═══ */}
          <Threshold text="Almost there." />

          {/* ═══ Passage 5: The quiet ═══ */}
          {/* Sparse again. Intimate. The lamp is tighter now. */}
          <ZoneSection passageIndex={4} passageId="the-depth" minHeight="150vh">
            <div className="px-[10vw] py-40 space-y-40">
              <InkReveal direction="center">
                <div className="max-w-md mx-auto text-center">
                  <p
                    className="font-display text-xl leading-relaxed"
                    style={{ color: "var(--ink)" }}
                  >
                    You went all the way down.
                  </p>
                </div>
              </InkReveal>

              <PatienceReveal className="text-center" delay={6000}>
                <p
                  className="font-caveat text-base"
                  style={{ color: "var(--ember)", opacity: 0.35 }}
                >
                  Most people don&apos;t make it here.
                </p>
              </PatienceReveal>
            </div>
          </ZoneSection>

          {/* ═══ Threshold ═══ */}
          <Threshold text="You found it." />

          {/* ═══ Passage 6: The ember ═══ */}
          {/* The warmest point. A single, small offering. */}
          <ZoneSection passageIndex={5} passageId="the-ember" minHeight="100vh">
            <div className="px-[10vw] py-40">
              <div className="max-w-sm mx-auto text-center space-y-12">
                <InkReveal direction="center">
                  <p
                    className="font-display text-lg"
                    style={{ color: "var(--ember-bright)" }}
                  >
                    This will be something, soon.
                  </p>
                </InkReveal>

                <InkReveal direction="center" delay={0.15}>
                  <p
                    className="text-sm leading-relaxed"
                    style={{ color: "var(--ink-dim)" }}
                  >
                    For now, it&apos;s a space — waiting to be filled.
                  </p>
                </InkReveal>

                <PatienceReveal className="mt-24" delay={8000}>
                  <p
                    className="font-caveat text-sm"
                    style={{ color: "var(--ember-deep)", opacity: 0.25 }}
                  >
                    Thank you for going this deep.
                  </p>
                </PatienceReveal>
              </div>
            </div>
          </ZoneSection>

          <div className="h-32" />
        </div>
      </WorldScroll>
    </div>
  )
}
