// Dev-only Phase 3 clip review (NOT part of the prod build — nothing in src/
// imports it). Two modes:
//  • FRAME STRIP — each clip sampled at 10 evenly-spaced times across its duration,
//    rendered side by side with ms labels (markers highlighted). This is what the
//    orchestrator reviews motion from.
//  • LIVE PLAY — a real createLoop + createBlender driving one clip through the
//    renderer via rAF, for hands-on iteration.
// Served via:  ~/.bun/bin/bunx vite packages/renderer-svg/dev --port 5197
//   then open /clips.html
import { StrictMode, useEffect, useRef, useState, type ReactElement } from 'react'
import { createRoot } from 'react-dom/client'

import { solveFk, sampleClip, clipDuration, createBlender, createLoop, type Blender } from '../../engine/src/index'
import { createCharacterRenderer } from '../src/index'
import { tryValidateRig, tryValidateCharacter, validateClipAgainstRig } from '../../schema/src/index'
import type { Clip } from '../../schema/src/index'

import rigDoc from '../../../content/engine/rig.dash.json'
import characterDoc from '../../../content/engine/character.dash.json'
import walkClip from '../../../content/engine/clips/walk-cycle.json'
import idleClip from '../../../content/engine/clips/idle-shuffle.json'
import jumpClip from '../../../content/engine/clips/jump.json'
import standPose from '../../../content/engine/poses/stand.json'

const VIEWBOX = '-70 -100 140 190'
const FRAME_DIM = 118
const N_FRAMES = 10

const rigR = tryValidateRig(rigDoc)
if (!rigR.ok) throw new Error('rig invalid: ' + rigR.errors.join('; '))
const rig = rigR.doc
const charR = tryValidateCharacter(characterDoc)
if (!charR.ok) throw new Error('character invalid: ' + charR.errors.join('; '))
const character = charR.doc

function loadClip(doc: unknown): Clip {
  const r = validateClipAgainstRig(doc, rig)
  if (!r.ok) throw new Error('clip invalid: ' + r.errors.join('; '))
  return r.doc
}
const CLIPS: Clip[] = [loadClip(idleClip), loadClip(walkClip), loadClip(jumpClip)]

function Frame({ clip, t, isMarker }: { clip: Clip; t: number; isMarker: boolean }): ReactElement {
  const ref = useRef<SVGSVGElement | null>(null)
  useEffect(() => {
    const svg = ref.current
    if (!svg) return
    const renderer = createCharacterRenderer(svg, character, rig)
    const sample = sampleClip(clip, t)
    renderer.render(solveFk(rig, { id: clip.id, angles: sample.angles }, { proportions: character.proportions, rootTransform: sample.root }))
    return () => renderer.destroy()
  }, [clip, t])
  return (
    <div className={'frame' + (isMarker ? ' marker' : '')}>
      <svg ref={ref} viewBox={VIEWBOX} width={FRAME_DIM} height={FRAME_DIM * 1.35} style={{ overflow: 'visible' }} data-t={Math.round(t)} />
      <div className="t">{Math.round(t)}ms{isMarker ? ' •' : ''}</div>
    </div>
  )
}

function markerAt(clip: Clip, t: number, step: number): boolean {
  if (!clip.markers) return false
  return clip.markers.some((m) => Math.abs(m.t - t) <= step / 2)
}

function Strip({ clip }: { clip: Clip }): ReactElement {
  const dur = clipDuration(clip)
  const step = dur / (N_FRAMES - 1)
  const times = Array.from({ length: N_FRAMES }, (_, i) => i * step)
  return (
    <section data-clip={clip.id}>
      <h2>{clip.id}</h2>
      <div className="meta">
        duration {Math.round(dur)}ms · {clip.loop ? 'loop' : 'one-shot'} · {clip.tracks.length} tracks
        {clip.markers ? ' · markers ' + clip.markers.map((m) => `${m.event}@${m.t}`).join(', ') : ''}
      </div>
      <div className="strip">
        {times.map((t, i) => (
          <Frame key={i} clip={clip} t={t} isMarker={markerAt(clip, t, step)} />
        ))}
      </div>
    </section>
  )
}

function Live(): ReactElement {
  const ref = useRef<SVGSVGElement | null>(null)
  const [which, setWhich] = useState(1)
  useEffect(() => {
    const svg = ref.current
    if (!svg) return
    const renderer = createCharacterRenderer(svg, character, rig)
    const blender: Blender = createBlender(rig, { initialPose: { id: 'stand', angles: standPose.angles, root: standPose.root } })
    blender.setSource(CLIPS[which], { durationMs: 400 })
    const loop = createLoop(() => {
      const { pose } = blender.tick()
      renderer.render(solveFk(rig, { id: 'live', angles: pose.angles }, { proportions: character.proportions, rootTransform: pose.root }))
    })
    let raf = 0
    let last = 0
    const frame = (now: number): void => {
      if (last === 0) last = now
      loop.advance(now - last)
      last = now
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      renderer.destroy()
    }
  }, [which])
  return (
    <div className="live">
      <h2>live play (loop + blender)</h2>
      <div className="meta">
        {CLIPS.map((c, i) => (
          <button key={c.id} onClick={() => setWhich(i)} style={{ fontWeight: which === i ? 700 : 400 }}>
            {c.id}
          </button>
        ))}
      </div>
      <svg ref={ref} viewBox={VIEWBOX} width={220} height={300} style={{ overflow: 'visible' }} />
    </div>
  )
}

function App(): ReactElement {
  return (
    <div>
      {CLIPS.map((c) => (
        <Strip key={c.id} clip={c} />
      ))}
      <Live />
    </div>
  )
}

createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
