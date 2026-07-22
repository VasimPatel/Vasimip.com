// ─────────────────────────────────────────────────────────────────────────────
// PIP, LIVE — the judging bird as a real inhabitant of the engine page.
//
// He perches on panel corners, flies spot to spot, delivers the page's snark
// line when Dash enters a page, follows travels to judge the landings, and
// heckles the recess loitering. And he is PHYSICAL: every frame the layer
// hands him Dash's capsule and sim velocity — if Dash (jumping, vaulting,
// being thrown by the visitor) hits him, he takes the impulse, tumbles
// ballistically, bounces off panel stand lines and the page floor, lies there
// dizzy, and gets back up himself. Indignant about it.
//
// DOM-driven like the rope and poke hitbox: the layer owns a container in
// stage coordinates; this class builds its elements once and writes transforms
// per rAF — React never re-renders for him. Visible CHOICES (acts, perch
// targets, quips, follow gates/delays) go through pick/chance/scalar so the
// review harness can force them ('pip.*'); raw Math.random is reserved for
// physics micro-jitter (knock spin) that no screenshot run needs to pin.
// ─────────────────────────────────────────────────────────────────────────────
import { pick, chance, scalar } from '../review'
import { PAGE_H, STAGE_W } from '../doc/spread'

export interface PipDashInfo {
  x: number
  y: number
  /** Root last frame — the collision SWEEPS prev→cur so a fast drag can't
   * step Dash across the bird between frames (codex). */
  prevX: number
  prevY: number
  /** Windowed root velocity, px/s (0 across teleports). */
  vx: number
  vy: number
  /** Live collision capsule (null while Dash is hidden). */
  cap: { x0: number; y0: number; x1: number; y1: number; r: number } | null
  /** Dash has agency right now (behavior/airborne/script/drag) — a knock needs
   * motion WITH intent; standing overlap must never launch the bird. */
  moving: boolean
}

interface Pt {
  x: number
  y: number
}

/** A horizontal line Pip can land on: a panel stand line or the page floor. */
interface FloorLine {
  x0: number
  x1: number
  y: number
}

type Mode = 'perch' | 'fly' | 'knocked' | 'stunned' | 'getup' | 'recover'

const BODY_R = 13 // collision radius around the body centre
const GRAV = 2400 // px/s² — reads slightly floatier than Dash; he's a bird
const REST = 0.45
const WALL_L = 16
const WALL_R = STAGE_W - 16

const QUIPS = {
  ambient: ['*preens*', 'chirp.', 'i work here.', 'security detail. unpaid.', 'nice spread today.', 'still no bird panel. noted.'],
  judge: ['8.6.', 'he practiced that in private.', 'the landing? a generous 7.', "i've seen cleaner.", 'show-off.', 'my commute is better than that.'],
  loiter: ['he thinks no one is watching.', 'i am also watching.', 'this is his "cardio".', 'majestic. truly.'],
  cut: ['AWK—', 'SQUAWK', '—!!'],
  hit: ['RUDE.', 'i was STANDING there.', 'assault. documented.', 'the AUDACITY.', 'fine. FINE.', 'my lawyer is a crow.'],
  poke: ['cheep.', 'no autographs.', 'careful. i bite (small).', 'what.'],
} as const

export class PipActor {
  private wrap: HTMLDivElement
  private fig: HTMLDivElement
  private tilt: HTMLDivElement
  private bubble: HTMLDivElement

  private mode: Mode = 'perch'
  private x = 610
  private y = -36
  private facing: 1 | -1 = 1
  private rot = 0

  private perches: Pt[] = []
  private floors: FloorLine[] = []

  // fly
  private flyFrom: Pt = { x: 0, y: 0 }
  private flyTo: Pt = { x: 0, y: 0 }
  private flyT0 = 0
  private flyDur = 1
  private pendingSay: string | null = null

  // knocked / recovery
  private vx = 0
  private vy = 0
  private spinV = 0
  private grounded = false
  private stunAt = 0
  private getupAt = 0
  private recoverAt = 0
  private cooldownUntil = 0

  // scheduling
  private lastTickAt = 0
  private nextActAt = 0
  private sayUntil = 0
  private follow: { at: number; dest: Pt } | null = null

  constructor(
    host: HTMLElement,
    private sfx: (kind: string) => void,
    private onKnocked?: () => void,
  ) {
    this.wrap = document.createElement('div')
    this.wrap.className = 'pip-live pip-perch'
    this.wrap.style.cssText = 'position:absolute;left:0;top:0;z-index:57;pointer-events:none'

    this.bubble = document.createElement('div')
    this.bubble.className = 'pip-say'
    this.bubble.style.display = 'none'
    this.wrap.appendChild(this.bubble)

    this.fig = document.createElement('div')
    this.fig.style.cssText = 'position:absolute;left:-33px;top:-46px;width:66px;height:55px;pointer-events:auto;cursor:pointer'
    this.tilt = document.createElement('div')
    this.tilt.className = 'pip-tilt'
    this.tilt.style.cssText = 'width:100%;height:100%;transform-origin:50% 58%'
    this.tilt.innerHTML =
      '<svg class="pip-svg" viewBox="0 0 60 50" width="66" height="55" style="overflow:visible">' +
      '<circle cx="30" cy="24" r="9.5" fill="#fffdf6" stroke="#1a1a1a" stroke-width="2.6"/>' +
      '<path class="pip-eye" d="M25,21 h5" stroke="#1a1a1a" stroke-width="2" stroke-linecap="round" fill="none"/>' +
      '<path class="pip-eye-dizzy" d="M23,18 l5,5 M28,18 l-5,5" stroke="#1a1a1a" stroke-width="1.8" stroke-linecap="round" fill="none" style="display:none"/>' +
      '<path d="M39,22 l9,3 l-9,3 Z" fill="#ffd23f" stroke="#1a1a1a" stroke-width="1.6" stroke-linejoin="round"/>' +
      '<path d="M27,32 v10 M33,32 v10" stroke="#1a1a1a" stroke-width="2" stroke-linecap="round"/>' +
      '<g class="pip-wing" style="transform-box:fill-box;transform-origin:100% 50%">' +
      '<path d="M28,24 q-10,-8 -14,-2 q4,5 14,4" fill="#fffdf6" stroke="#1a1a1a" stroke-width="2"/>' +
      '</g></svg>'
    this.fig.appendChild(this.tilt)
    this.fig.addEventListener('click', () => this.poked())
    this.wrap.appendChild(this.fig)
    host.appendChild(this.wrap)

    if (import.meta.env.DEV) {
      ;(window as unknown as { __dashPip?: unknown }).__dashPip = {
        state: () => ({ mode: this.mode, x: Math.round(this.x), y: Math.round(this.y) }),
        knock: (vx = 700, vy = -260) => this.knock(vx, vy),
      }
    }
  }

  dispose(): void {
    this.wrap.remove()
    if (import.meta.env.DEV) delete (window as unknown as { __dashPip?: unknown }).__dashPip
  }

  /** New page: perch spots + landable lines; `announce` is the page's snark
   * line, spoken on arrival. Mid-tumble he finishes his crash on the new
   * geometry first — recovery flies him to a fresh perch anyway. */
  setPage(perches: Pt[], floors: FloorLine[], announce?: string): void {
    this.perches = perches.length > 0 ? perches : [{ x: 610, y: -36 }]
    this.floors = floors
    this.follow = null // a judged travel belongs to the OLD page (codex)
    if (this.mode === 'knocked' || this.mode === 'stunned' || this.mode === 'getup') return
    this.hideSay()
    this.pendingSay = announce ?? null
    this.flyToPt(pick('pip.perch.enter', this.perches))
  }

  /** Dash set off toward a panel — maybe drift over to judge the arrival. */
  onDashTravel(dest: Pt): void {
    if (this.mode !== 'perch' && this.mode !== 'fly') return
    if (!chance('pip.follow', 0.5)) return
    this.follow = { at: performance.now() + scalar('pip.follow.delayMs', () => 1500 + Math.random() * 1200), dest }
  }

  /** Dash started a recess act — the bird has opinions about "exercise". */
  onDashLoiter(): void {
    if (this.mode !== 'perch' || performance.now() < this.sayUntil) return
    if (chance('pip.loiterquip', 0.35)) this.say(pick('pip.loiterquip.line', QUIPS.loiter), 2200)
  }

  private poked(): void {
    if (this.mode === 'knocked' || this.mode === 'getup') return
    if (this.mode === 'stunned') {
      this.say('…birds…', 1000)
      return
    }
    this.sfx('chirp')
    this.say(pick('pip.poke.line', QUIPS.poke), 1600)
    this.tilt.classList.remove('pip-flut')
    void this.tilt.offsetWidth // restart the flutter animation
    this.tilt.classList.add('pip-flut')
  }

  private setMode(m: Mode): void {
    this.mode = m
    this.wrap.className = 'pip-live pip-' + m
  }

  private say(text: string, ms: number): void {
    this.bubble.textContent = text
    this.bubble.style.display = 'block'
    // bubble sits to the bird's left like the classic PipSnark; flip near the edge
    this.bubble.classList.toggle('pip-say-right', this.x < 300)
    this.sayUntil = performance.now() + ms
  }

  private hideSay(): void {
    this.bubble.style.display = 'none'
    this.sayUntil = 0
  }

  private flyToPt(to: Pt): void {
    this.flyFrom = { x: this.x, y: this.y }
    this.flyTo = to
    this.flyT0 = performance.now()
    this.flyDur = Math.min(2200, Math.max(650, Math.hypot(to.x - this.x, to.y - this.y) / 0.5))
    this.facing = to.x >= this.x ? 1 : -1
    this.rot = 0
    this.setMode('fly')
  }

  private floorAt(x: number, y: number): number {
    let best = PAGE_H - 20
    for (const f of this.floors) {
      if (x >= f.x0 && x <= f.x1 && f.y >= y - 4 && f.y < best) best = f.y
    }
    return best
  }

  /** The hit. Impulse comes from Dash's live velocity — a drag-throw slings
   * him hard, a hop just clips him. Always pops upward so the tumble reads. */
  private knock(dvx: number, dvy: number, dashX?: number): void {
    const dir = Math.sign(this.x - (dashX ?? this.x - Math.sign(dvx || 1))) || 1
    this.vx = Math.max(-1000, Math.min(1000, dvx)) * 0.8 + dir * 140
    this.vy = Math.min(0, dvy) * 0.55 - 320
    this.spinV = dir * (6 + Math.random() * 5)
    this.grounded = false
    this.cooldownUntil = performance.now() + 1500
    this.follow = null
    this.pendingSay = null
    this.sfx('bonk')
    this.say(pick('pip.cut.line', QUIPS.cut), 900)
    this.setMode('knocked')
    this.onKnocked?.()
  }

  private maybeCollide(now: number, dash: PipDashInfo): void {
    if (this.mode === 'knocked' || this.mode === 'stunned' || this.mode === 'getup') return
    if (now < this.cooldownUntil || !dash.cap || !dash.moving) return
    const speed = Math.hypot(dash.vx, dash.vy)
    if (speed < 230) return
    // Sweep the capsule from last frame's root to this one — a fast drag can
    // carry Dash 100+px/frame, and testing only the endpoint tunnels (codex).
    const mx = dash.x - dash.prevX
    const my = dash.y - dash.prevY
    const moveLen = Math.hypot(mx, my)
    if (moveLen > 200) return // teleport, not motion
    const px = this.x
    const py = this.y - 20
    const { x0, y0, x1, y1, r } = dash.cap
    const steps = Math.min(8, Math.max(1, Math.ceil(moveLen / 18)))
    for (let i = 1; i <= steps; i++) {
      // capsule as it was at this sample, offset back along the frame's motion
      const ox = mx * (i / steps - 1)
      const oy = my * (i / steps - 1)
      const dx = x1 - x0
      const dy = y1 - y0
      const len2 = dx * dx + dy * dy
      const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - x0 - ox) * dx + (py - y0 - oy) * dy) / len2)) : 0
      const cx = x0 + ox + dx * t
      const cy = y0 + oy + dy * t
      if (Math.hypot(px - cx, py - cy) < r + BODY_R + 6) {
        this.knock(dash.vx, dash.vy, dash.x)
        return
      }
    }
  }

  tick(now: number, dash: PipDashInfo): void {
    const dt = Math.min(0.05, Math.max(0, now - this.lastTickAt) / 1000)
    this.lastTickAt = now
    this.maybeCollide(now, dash)

    if (this.sayUntil > 0 && now >= this.sayUntil) this.hideSay()

    if (this.mode === 'perch') {
      if (this.follow && now >= this.follow.at) {
        const dest = this.follow.dest
        this.follow = null
        const near = [...this.perches].sort((a, b) => Math.hypot(a.x - dest.x, a.y - dest.y) - Math.hypot(b.x - dest.x, b.y - dest.y))[0]
        if (near && Math.hypot(near.x - this.x, near.y - this.y) > 40) {
          if (chance('pip.judgequip', 0.65)) this.pendingSay = pick('pip.judgequip.line', QUIPS.judge)
          this.flyToPt(near)
        }
      } else if (now >= this.nextActAt) {
        this.nextActAt = now + scalar('pip.actDelayMs', () => 5200 + Math.random() * 4800)
        const act = pick('pip.act', ['quip', 'quip', 'move'] as const)
        if (act === 'quip' && now >= this.sayUntil) {
          this.say(pick('pip.quip.line', QUIPS.ambient), 2200)
        } else if (act === 'move' && this.perches.length > 1) {
          const others = this.perches.filter((p) => Math.hypot(p.x - this.x, p.y - this.y) > 40)
          if (others.length > 0) this.flyToPt(pick('pip.perch.move', others))
        }
      }
    } else if (this.mode === 'fly') {
      const kRaw = Math.min(1, (now - this.flyT0) / this.flyDur)
      const k = kRaw < 0.5 ? 2 * kRaw * kRaw : 1 - Math.pow(-2 * kRaw + 2, 2) / 2
      this.x = this.flyFrom.x + (this.flyTo.x - this.flyFrom.x) * k
      this.y = this.flyFrom.y + (this.flyTo.y - this.flyFrom.y) * k - Math.sin(kRaw * Math.PI) * 30
      if (kRaw >= 1) {
        this.setMode('perch')
        this.nextActAt = now + 4200 + Math.random() * 3600
        if (this.pendingSay) {
          this.say(this.pendingSay, 3000)
          this.pendingSay = null
        }
      }
    } else if (this.mode === 'knocked') {
      const yPrev = this.y
      this.vy += GRAV * dt
      this.x += this.vx * dt
      this.y += this.vy * dt
      this.rot += this.spinV * dt * (180 / Math.PI) * 0.06
      if (this.x < WALL_L) {
        this.x = WALL_L
        this.vx = Math.abs(this.vx) * 0.6
      } else if (this.x > WALL_R) {
        this.x = WALL_R
        this.vx = -Math.abs(this.vx) * 0.6
      }
      if (this.y < -140) {
        this.y = -140
        this.vy = Math.abs(this.vy) * 0.4
      }
      // floor from the PRE-step y: a fast fall must not step past a stand line
      // between frames (tunneling straight to the page floor)
      const fl = this.floorAt(this.x, yPrev)
      if (this.y >= fl) {
        this.y = fl
        if (Math.abs(this.vy) > 130) {
          this.vy = -this.vy * REST
          this.vx *= 0.72
          this.spinV *= 0.65
          this.sfx('knock')
        } else {
          this.vy = 0
          this.vx *= 0.8
          this.grounded = true
        }
      }
      if (this.grounded && Math.abs(this.vx) < 26 && Math.abs(this.vy) < 40) {
        this.stunAt = now
        this.setMode('stunned')
        this.setEyes(true)
      }
    } else if (this.mode === 'stunned') {
      // settle flat on his back, rocking (CSS pipdizzy), for a beat
      const k = Math.min(1, (now - this.stunAt) / 220)
      this.rot = this.rot + (168 - this.rot) * k
      if (now - this.stunAt > 1500) {
        this.rot = 0
        this.setMode('getup') // CSS pipgetup owns the roll to his feet
        this.getupAt = now
      }
    } else if (this.mode === 'getup') {
      if (now - this.getupAt > 740) {
        this.setEyes(false)
        this.setMode('recover')
        this.say(pick('pip.hit.line', QUIPS.hit), 2400)
        this.recoverAt = now
      }
    } else if (this.mode === 'recover') {
      if (now - this.recoverAt > 2700) {
        // fly somewhere Dash is not
        const far = [...this.perches].sort((a, b) => Math.hypot(b.x - dash.x, b.y - dash.y) - Math.hypot(a.x - dash.x, a.y - dash.y))[0]
        this.flyToPt(far ?? { x: 610, y: -36 })
        this.nextActAt = now + 6000
      }
    }

    if (this.sayUntil > 0) this.bubble.classList.toggle('pip-say-right', this.x < 300)
    this.wrap.style.transform = `translate3d(${this.x.toFixed(1)}px, ${this.y.toFixed(1)}px, 0)`
    const tumbling = this.mode === 'knocked' || this.mode === 'stunned'
    this.fig.style.transform = this.facing === 1 ? '' : 'scaleX(-1)'
    this.tilt.style.transform = tumbling ? `rotate(${this.rot.toFixed(1)}deg)` : ''
  }

  private setEyes(dizzy: boolean): void {
    const eye = this.tilt.querySelector<SVGPathElement>('.pip-eye')
    const dz = this.tilt.querySelector<SVGPathElement>('.pip-eye-dizzy')
    if (eye) eye.style.display = dizzy ? 'none' : ''
    if (dz) dz.style.display = dizzy ? '' : 'none'
  }
}
