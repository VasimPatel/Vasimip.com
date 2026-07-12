// P9a pose-draft review — ALL 18 extracted poses beside their legacy components
// (the P2 page keeps the original six). Dev-only; not part of the prod build.
//   bunx vite packages/renderer-svg/dev --port 5197  →  /poses9a.html
import { StrictMode, useEffect, useRef, type ReactElement } from 'react'
import { createRoot } from 'react-dom/client'

import Fight from '../../../src/notebook/poses/Fight'
import Spray from '../../../src/notebook/poses/Spray'
import Dangle from '../../../src/notebook/poses/Dangle'
import Throw from '../../../src/notebook/poses/Throw'
import Wave from '../../../src/notebook/poses/Wave'
import Trip from '../../../src/notebook/poses/Trip'
import Sneeze from '../../../src/notebook/poses/Sneeze'
import Vault from '../../../src/notebook/poses/Vault'
import Wallrun from '../../../src/notebook/poses/Wallrun'
import Rope from '../../../src/notebook/poses/Rope'
import Swing from '../../../src/notebook/poses/Swing'
import Slide from '../../../src/notebook/poses/Slide'
import Surf from '../../../src/notebook/poses/Surf'
import Shove from '../../../src/notebook/poses/Shove'
import Punch from '../../../src/notebook/poses/Punch'
import Peek from '../../../src/notebook/poses/Peek'
import Hang from '../../../src/notebook/poses/Hang'
import Knock from '../../../src/notebook/poses/Knock'

import { solveFk } from '../../engine/src/index'
import { createCharacterRenderer } from '../src/index'
import { tryValidateRig, tryValidateCharacter } from '../../schema/src/index'
import rigDoc from '../../../content/engine/rig.dash.json'
import characterDoc from '../../../content/engine/character.dash.json'

import fight from '../../../content/engine/poses/fight.json'
import spray from '../../../content/engine/poses/spray.json'
import dangle from '../../../content/engine/poses/dangle.json'
import throwP from '../../../content/engine/poses/throw.json'
import wave from '../../../content/engine/poses/wave.json'
import trip from '../../../content/engine/poses/trip.json'
import sneeze from '../../../content/engine/poses/sneeze.json'
import vault from '../../../content/engine/poses/vault.json'
import wallrun from '../../../content/engine/poses/wallrun.json'
import rope from '../../../content/engine/poses/rope.json'
import swing from '../../../content/engine/poses/swing.json'
import slide from '../../../content/engine/poses/slide.json'
import surf from '../../../content/engine/poses/surf.json'
import shove from '../../../content/engine/poses/shove.json'
import punch from '../../../content/engine/poses/punch.json'
import peek from '../../../content/engine/poses/peek.json'
import hang from '../../../content/engine/poses/hang.json'
import knock from '../../../content/engine/poses/knock.json'

const VIEWBOX = '-70 -80 140 145'
const DIM = 150

const rig = (() => { const r = tryValidateRig(rigDoc); if (!r.ok) throw new Error(r.errors.join('; ')); return r.doc })()
const character = (() => { const r = tryValidateCharacter(characterDoc); if (!r.ok) throw new Error(r.errors.join('; ')); return r.doc })()

const ROWS: { id: string; legacy: ReactElement; poseDoc: unknown }[] = [
  { id: 'fight', legacy: <Fight />, poseDoc: fight },
  { id: 'spray', legacy: <Spray lookXf={0} lookY={0} />, poseDoc: spray },
  { id: 'dangle', legacy: <Dangle />, poseDoc: dangle },
  { id: 'throw', legacy: <Throw />, poseDoc: throwP },
  { id: 'wave', legacy: <Wave />, poseDoc: wave },
  { id: 'trip', legacy: <Trip />, poseDoc: trip },
  { id: 'sneeze', legacy: <Sneeze />, poseDoc: sneeze },
  { id: 'vault', legacy: <Vault />, poseDoc: vault },
  { id: 'wallrun', legacy: <Wallrun />, poseDoc: wallrun },
  { id: 'rope', legacy: <Rope />, poseDoc: rope },
  { id: 'swing', legacy: <Swing />, poseDoc: swing },
  { id: 'slide', legacy: <Slide />, poseDoc: slide },
  { id: 'surf', legacy: <Surf />, poseDoc: surf },
  { id: 'shove', legacy: <Shove />, poseDoc: shove },
  { id: 'punch', legacy: <Punch />, poseDoc: punch },
  { id: 'peek', legacy: <Peek />, poseDoc: peek },
  { id: 'hang', legacy: <Hang />, poseDoc: hang },
  { id: 'knock', legacy: <Knock />, poseDoc: knock },
]

function NewPose({ poseDoc }: { poseDoc: unknown }): ReactElement {
  const ref = useRef<SVGSVGElement | null>(null)
  useEffect(() => {
    const svg = ref.current
    if (!svg) return
    const renderer = createCharacterRenderer(svg, character, rig)
    const pose = poseDoc as { angles: Record<string, number>; root?: { x: number; y: number; rot: number } }
    // Draft roots carry the legacy hip position; rebase so the figure centres.
    const solved = solveFk(rig, { id: 'p', angles: pose.angles } as never, {
      proportions: character.proportions,
      rootTransform: { x: pose.root?.x ?? 0, y: pose.root?.y ?? 16, rot: pose.root?.rot ?? 0 },
    })
    renderer.render(solved)
    return () => renderer.destroy()
  }, [poseDoc])
  return <svg ref={ref} viewBox={VIEWBOX} width={DIM} height={DIM} />
}

function App(): ReactElement {
  return (
    <div style={{ fontFamily: 'sans-serif', background: '#f2ede2', padding: 16 }}>
      <h1 style={{ fontSize: 18 }}>P9a pose drafts — legacy vs engine</h1>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, max-content)', gap: 10 }}>
        {ROWS.map((r) => (
          <div key={r.id} data-pose={r.id} style={{ background: '#fffdf6', border: '2px solid #1a1a1a', borderRadius: 6, padding: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.08em' }}>{r.id}</div>
            <div style={{ display: 'flex' }}>
              <svg viewBox={VIEWBOX} width={DIM} height={DIM}><g>{r.legacy}</g></svg>
              <NewPose poseDoc={r.poseDoc} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
