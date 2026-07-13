import { createCharacterRuntime, createContext, createMutableWorld, createVerletWorld, STEP_MS } from '../src/index'
import rig from '../../../content/engine/rig.dash.json'
import character from '../../../content/engine/character.dash.json'
import idle from '../../../content/engine/clips/idle-shuffle.json'
import walk from '../../../content/engine/clips/walk-cycle.json'
import jump from '../../../content/engine/clips/jump.json'
import stand from '../../../content/engine/poses/stand.json'

const ctx = createContext({ seed: 42 })
const verlet = createVerletWorld()
const world = { entities: [{ id: 'floor', components: { surface: {}, collider: { segments: [{ x1: -400, y1: 100, x2: 800, y2: 100 }] } } }] }
const mw = createMutableWorld(world as never, { character: character as never, events: ctx.events, stepMs: STEP_MS })
const rt = createCharacterRuntime({
  rig: rig as never, character: character as never, world: mw, verlet, rng: ctx.rng, events: ctx.events,
  clips: { 'idle-shuffle': idle as never, 'walk-cycle': walk as never, jump: jump as never },
  poses: { stand: stand as never },
  names: { idle: 'idle-shuffle', walk: 'walk-cycle', jump: 'jump', tuck: 'jump-tuck', jumpLand: 'squash-land' },
  restPose: stand as never,
  initialTransform: { x: 0, y: 60, rot: 0, facing: -1 },
  accessories: false,
})
for (let i = 0; i < 240; i++) { ctx.clock.advance(); rt.tick(); verlet.step(); mw.stepMutations() }
const solved = rt.solved()
for (const b of solved.bones) {
  if (['upperArmR', 'upperArmL', 'thighR', 'thighL', 'foreArmR', 'foreArmL', 'shinR', 'shinL', 'footR', 'footL'].includes(b.id))
    console.log(b.id.padEnd(10), 'world angle', (b.worldAngle * 180 / Math.PI).toFixed(1) + '°', 'end', b.ex.toFixed(1), b.ey.toFixed(1))
}
console.log('overrides:', JSON.stringify(rt.overrides()))
const fk = solved.bones.filter((b) => b.id.startsWith('foreArm')).map((b) => `${b.id} fk(${b.ex.toFixed(1)},${b.ey.toFixed(1)})`)
console.log(fk.join(' '))
