import { createCharacterRuntime, createContext, createMutableWorld, createVerletWorld, panelEdges, sweptCapsuleVsSegments, STEP_MS } from '../src/index'
import rig from '../../../content/engine/rig.dash.json'
import character from '../../../content/engine/character.dash.json'
import idle from '../../../content/engine/clips/idle-shuffle.json'
import walk from '../../../content/engine/clips/walk-cycle.json'
import jump from '../../../content/engine/clips/jump.json'
import stand from '../../../content/engine/poses/stand.json'

const BOX = { x: 100, y: 100, w: 160, h: 160 }
const world = {
  schemaVersion: 2,
  seed: 1,
  entities: [
    { id: 'cell', components: { transform: { x: BOX.x, y: BOX.y }, surface: { box: BOX, anchor: { dx: BOX.w / 2, dy: BOX.h / 2 } }, collidable: { shape: 'segments', segments: panelEdges(BOX) } } },
    { id: 'goal', components: { transform: { x: 500, y: BOX.y + BOX.h / 2 } } },
  ],
}
const ctx = createContext({ seed: 1 })
const verlet = createVerletWorld()
const mw = createMutableWorld(world as never, { character: character as never, events: ctx.events, stepMs: STEP_MS })
const rt = createCharacterRuntime({
  rig: rig as never,
  character: character as never,
  world: mw,
  verlet,
  rng: ctx.rng,
  events: ctx.events,
  clips: { 'idle-shuffle': idle as never, 'walk-cycle': walk as never, jump: jump as never },
  poses: { stand: stand as never },
  behaviors: {},
  names: { idle: 'idle-shuffle', walk: 'walk-cycle', jump: 'jump', tuck: 'jump-tuck', jumpLand: 'squash-land' },
  restPose: stand as never,
  initialTransform: { x: BOX.x + BOX.w / 2, y: BOX.y + BOX.h / 2, rot: 0, facing: 1 },
})
const cap0 = rt.capsule()
rt.transform.y += BOX.y + BOX.h / 2 - Math.max(cap0.y0, cap0.y1) - cap0.r
const evs: string[] = []
for (const t of ['intent:blocked', 'intent:failed', 'intent:arrived', 'behavior:halted', 'behavior:complete', 'behavior:ended', 'path:route'])
  ctx.events.on(t, (p) => evs.push(t + ' @x' + rt.transform.x.toFixed(0) + ' ' + JSON.stringify(p).slice(0, 100)))
rt.runBehavior({ schemaVersion: 2, id: 'bare', steps: [{ verb: 'moveTo', target: 'entity:goal' }] } as never)
for (let i = 0; i < 3000 && rt.running(); i++) {
  ctx.clock.advance()
  rt.tick()
  verlet.step()
  mw.stepMutations()
  if (rt.transform.x > 246 && rt.transform.x < 254) {
    const c = rt.capsule()
    const dx = 0.93
    const hit = sweptCapsuleVsSegments(c, dx, 0, mw.collision().segments)
    console.log('x', rt.transform.x.toFixed(2), 'y0', c.y0.toFixed(1), 'y1', c.y1.toFixed(1),
      'hit', hit ? `t=${hit.t.toFixed(3)} nx=${hit.nx.toFixed(2)} ny=${hit.ny.toFixed(2)} seg=(${hit.seg.x1},${hit.seg.y1})-(${hit.seg.x2},${hit.seg.y2})` : 'none')
  }
}
console.log(evs.join('\n') || 'NO EVENTS')
console.log('final x', rt.transform.x.toFixed(1), 'y', rt.transform.y.toFixed(1), 'running', rt.running())
