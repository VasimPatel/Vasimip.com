import { createCharacterRuntime, createContext, createMutableWorld, createVerletWorld, worldFromNotebook, STEP_MS } from '../src/index'
import { migrateNotebookV1 } from '../../schema/src/index'
import rig from '../../../content/engine/rig.dash.json'
import character from '../../../content/engine/character.dash.json'
import idle from '../../../content/engine/clips/idle-shuffle.json'
import walk from '../../../content/engine/clips/walk-cycle.json'
import jump from '../../../content/engine/clips/jump.json'
import stand from '../../../content/engine/poses/stand.json'
import tuck from '../../../content/engine/poses/jump-tuck.json'
import land from '../../../content/engine/poses/squash-land.json'
import bHop from '../../../content/engine/behaviors/builtin/hop.json'
import notebook from '../../../src/notebook/notebook.json'

const { doc } = migrateNotebookV1(notebook, {
  rigs: { dash: rig as never }, characters: { dash: character as never },
  poses: { stand: stand as never, 'jump-tuck': tuck as never, 'squash-land': land as never },
  clips: { 'idle-shuffle': idle as never, 'walk-cycle': walk as never, jump: jump as never },
  behaviors: { 'builtin:hop': bHop as never },
})
const pws = worldFromNotebook(doc.pages as never)
const pw = pws[0]
const ctx = createContext({ seed: 7 })
const verlet = createVerletWorld()
const mw = createMutableWorld(pw.world, { character: character as never, events: ctx.events, stepMs: STEP_MS })
const rt = createCharacterRuntime({
  rig: rig as never, character: character as never, world: mw, verlet, rng: ctx.rng, events: ctx.events,
  clips: { 'idle-shuffle': idle as never, 'walk-cycle': walk as never, jump: jump as never },
  poses: { stand: stand as never, 'jump-tuck': tuck as never, 'squash-land': land as never },
  behaviors: doc.behaviors as never,
  names: { idle: 'idle-shuffle', walk: 'walk-cycle', jump: 'jump', tuck: 'jump-tuck', jumpLand: 'squash-land' },
  restPose: stand as never,
  initialTransform: { x: 0, y: 0, rot: 0, facing: 1 },
})
const p0 = doc.pages[0].panels[0]
const p1 = doc.pages[0].panels[1]
console.log('anchor0', p0.x + p0.anchor.dx, p0.y + p0.anchor.dy, 'anchor1', p1.x + p1.anchor.dx, p1.y + p1.anchor.dy)
rt.transform.x = p0.x + p0.anchor.dx
const cap = rt.capsule()
rt.transform.y += (p0.y + p0.anchor.dy) - (cap.y1 + cap.r)
const evs: string[] = []
for (const t of ['path:route', 'path:leg', 'jump:windup', 'jump:launch', 'jump:land', 'intent:blocked', 'intent:failed', 'behavior:complete', 'behavior:ended'])
  ctx.events.on(t, (p) => evs.push(t + ' ' + JSON.stringify(p)))
rt.runBehavior(doc.behaviors['builtin:hop'] as never, { travel: { from: 'panel:0:0', to: 'panel:0:1' } })
for (let i = 0; i < 600 && rt.running(); i++) { ctx.clock.advance(); rt.tick(); verlet.step(); mw.stepMutations() }
console.log(evs.join('\n'))
console.log('final x', rt.transform.x.toFixed(1), 'y', rt.transform.y.toFixed(1))
