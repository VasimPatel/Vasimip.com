// Dev-only side-by-side review harness (NOT part of the prod build — nothing in
// src/ imports it). Left column renders the legacy React SVG pose components;
// right column renders the same six poses through the new solveFk +
// createCharacterRenderer. Served via:
//   ~/.bun/bin/bunx vite packages/renderer-svg/dev --port 5197
import { StrictMode, useEffect, useRef, type ReactElement } from 'react'
import { createRoot } from 'react-dom/client'

// Legacy pose components (read-only import from the site — allowed by the phase brief).
import Idle from '../../../src/notebook/poses/Idle'
import Walk from '../../../src/notebook/poses/Walk'
import Tuck from '../../../src/notebook/poses/Tuck'
import Cheer from '../../../src/notebook/poses/Cheer'
import Think from '../../../src/notebook/poses/Think'
import Land from '../../../src/notebook/poses/Land'

// New engine + renderer (relative imports so workspace resolution is unambiguous).
import { solveFk } from '../../engine/src/index'
import { createCharacterRenderer } from '../src/index'
import { tryValidateRig, tryValidateCharacter, validatePoseAgainstRig } from '../../schema/src/index'

import rigDoc from '../../../content/engine/rig.dash.json'
import characterDoc from '../../../content/engine/character.dash.json'
import standPose from '../../../content/engine/poses/stand.json'
import walkPose from '../../../content/engine/poses/walk-mid.json'
import tuckPose from '../../../content/engine/poses/jump-tuck.json'
import cheerPose from '../../../content/engine/poses/cheer.json'
import thinkPose from '../../../content/engine/poses/think.json'
import landPose from '../../../content/engine/poses/squash-land.json'

const VIEWBOX = '-60 -75 120 130'
const DIM = 170

const rigR = tryValidateRig(rigDoc)
if (!rigR.ok) throw new Error('rig invalid: ' + rigR.errors.join('; '))
const rig = rigR.doc
const charR = tryValidateCharacter(characterDoc)
if (!charR.ok) throw new Error('character invalid: ' + charR.errors.join('; '))
const character = charR.doc

interface RowDef {
  id: string
  label: string
  legacy: ReactElement
  poseDoc: unknown
}

const ROWS: RowDef[] = [
  { id: 'stand', label: 'stand', legacy: <Idle headTilt={0} lookXf={0} lookY={0} eyeR={2} />, poseDoc: standPose },
  { id: 'walk-mid', label: 'walk-mid', legacy: <Walk />, poseDoc: walkPose },
  { id: 'jump-tuck', label: 'jump-tuck', legacy: <Tuck />, poseDoc: tuckPose },
  { id: 'cheer', label: 'cheer', legacy: <Cheer />, poseDoc: cheerPose },
  { id: 'think', label: 'think', legacy: <Think />, poseDoc: thinkPose },
  { id: 'squash-land', label: 'squash-land', legacy: <Land />, poseDoc: landPose },
]

function NewPose({ poseDoc }: { poseDoc: unknown }): ReactElement {
  const ref = useRef<SVGSVGElement | null>(null)
  useEffect(() => {
    const svg = ref.current
    if (!svg) return
    const poseR = validatePoseAgainstRig(poseDoc, rig)
    if (!poseR.ok) throw new Error('pose invalid: ' + poseR.errors.join('; '))
    const renderer = createCharacterRenderer(svg, character, rig)
    renderer.render(solveFk(rig, poseR.doc, { proportions: character.proportions }))
    return () => renderer.destroy()
  }, [poseDoc])
  return <svg ref={ref} viewBox={VIEWBOX} width={DIM} height={DIM} style={{ overflow: 'visible' }} />
}

function App(): ReactElement {
  return (
    <div className="grid">
      <div className="head">pose</div>
      <div className="head">legacy</div>
      <div className="head">new engine</div>
      {ROWS.map((r) => (
        <div className="row" key={r.id} data-row={r.id}>
          <div className="cell label">{r.label}</div>
          <div className="cell legacy" data-legacy={r.id}>
            <svg viewBox={VIEWBOX} width={DIM} height={DIM} style={{ overflow: 'visible' }}>
              {r.legacy}
            </svg>
          </div>
          <div className="cell new" data-new={r.id}>
            <NewPose poseDoc={r.poseDoc} />
          </div>
        </div>
      ))}
    </div>
  )
}

createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
