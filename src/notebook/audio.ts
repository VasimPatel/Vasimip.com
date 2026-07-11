// ─────────────────────────────────────────────────────────────────────────────
// WebAudio SFX, ported verbatim from dc_script.js (ensureAC / noiseSrc / sfx).
// The controller owns an AudioEngine instance. `ensureAC()` must only run from a
// user gesture (exactly like the source) and `sfx()` is gated on the sound toggle
// — the controller passes its current `soundOn` in.
// ─────────────────────────────────────────────────────────────────────────────

export type SfxKind =
  | 'flip'
  | 'hop'
  | 'boom'
  | 'whoosh'
  | 'scrape'
  | 'crack'
  | 'knock'
  | 'scrib'

export class AudioEngine {
  private _ac: AudioContext | null = null

  ensureAC(): void {
    if (!this._ac) {
      try {
        const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        this._ac = new Ctor()
      } catch (e) { /* no audio */ }
    }
    if (this._ac && this._ac.state === 'suspended') this._ac.resume()
  }

  private noiseSrc(dur: number): AudioBufferSourceNode {
    const ac = this._ac as AudioContext
    const b = ac.createBuffer(1, Math.max(1, Math.floor(ac.sampleRate * dur)), ac.sampleRate)
    const d = b.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
    const s = ac.createBufferSource(); s.buffer = b; return s
  }

  sfx(kind: SfxKind, soundOn: boolean): void {
    if (!soundOn) return
    this.ensureAC()
    const ac = this._ac; if (!ac) return
    const t = ac.currentTime
    try {
      if (kind === 'flip') {
        const s = this.noiseSrc(.24), f = ac.createBiquadFilter(), g = ac.createGain()
        f.type = 'bandpass'; f.Q.value = 1.1
        f.frequency.setValueAtTime(450, t); f.frequency.exponentialRampToValueAtTime(2100, t + .18)
        g.gain.setValueAtTime(.3, t); g.gain.exponentialRampToValueAtTime(.001, t + .24)
        s.connect(f); f.connect(g); g.connect(ac.destination); s.start()
      } else if (kind === 'hop') {
        const o = ac.createOscillator(), g = ac.createGain()
        o.type = 'triangle'
        o.frequency.setValueAtTime(260, t); o.frequency.exponentialRampToValueAtTime(660, t + .13)
        g.gain.setValueAtTime(.12, t); g.gain.exponentialRampToValueAtTime(.001, t + .16)
        o.connect(g); g.connect(ac.destination); o.start(); o.stop(t + .18)
      } else if (kind === 'boom') {
        const o = ac.createOscillator(), g = ac.createGain()
        o.type = 'sine'
        o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(42, t + .38)
        g.gain.setValueAtTime(.5, t); g.gain.exponentialRampToValueAtTime(.001, t + .42)
        o.connect(g); g.connect(ac.destination); o.start(); o.stop(t + .45)
        const s = this.noiseSrc(.3), f = ac.createBiquadFilter(), g2 = ac.createGain()
        f.type = 'lowpass'; f.frequency.value = 380
        g2.gain.setValueAtTime(.35, t); g2.gain.exponentialRampToValueAtTime(.001, t + .3)
        s.connect(f); f.connect(g2); g2.connect(ac.destination); s.start()
      } else if (kind === 'whoosh') {
        const s = this.noiseSrc(.3), f = ac.createBiquadFilter(), g = ac.createGain()
        f.type = 'bandpass'; f.Q.value = 2.2
        f.frequency.setValueAtTime(2400, t); f.frequency.exponentialRampToValueAtTime(320, t + .28)
        g.gain.setValueAtTime(.001, t); g.gain.exponentialRampToValueAtTime(.3, t + .07); g.gain.exponentialRampToValueAtTime(.001, t + .3)
        s.connect(f); f.connect(g); g.connect(ac.destination); s.start()
      } else if (kind === 'scrape') {
        const s = this.noiseSrc(.5), f = ac.createBiquadFilter(), g = ac.createGain()
        f.type = 'lowpass'; f.frequency.value = 520; f.Q.value = 3
        g.gain.setValueAtTime(.22, t); g.gain.setValueAtTime(.15, t + .3); g.gain.exponentialRampToValueAtTime(.001, t + .5)
        s.connect(f); f.connect(g); g.connect(ac.destination); s.start()
      } else if (kind === 'crack') {
        const s = this.noiseSrc(.16), f = ac.createBiquadFilter(), g = ac.createGain()
        f.type = 'highpass'; f.frequency.value = 900
        g.gain.setValueAtTime(.45, t); g.gain.exponentialRampToValueAtTime(.001, t + .16)
        s.connect(f); f.connect(g); g.connect(ac.destination); s.start()
        const o = ac.createOscillator(), g2 = ac.createGain()
        o.type = 'square'; o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(60, t + .12)
        g2.gain.setValueAtTime(.22, t); g2.gain.exponentialRampToValueAtTime(.001, t + .14)
        o.connect(g2); g2.connect(ac.destination); o.start(); o.stop(t + .16)
      } else if (kind === 'knock') {
        const o = ac.createOscillator(), g = ac.createGain()
        o.type = 'triangle'; o.frequency.setValueAtTime(190, t); o.frequency.exponentialRampToValueAtTime(120, t + .09)
        g.gain.setValueAtTime(.35, t); g.gain.exponentialRampToValueAtTime(.001, t + .1)
        o.connect(g); g.connect(ac.destination); o.start(); o.stop(t + .12)
      } else if (kind === 'scrib') {
        const s = this.noiseSrc(.5), f = ac.createBiquadFilter(), g = ac.createGain()
        f.type = 'highpass'; f.frequency.value = 1900
        g.gain.setValueAtTime(.05, t); g.gain.setValueAtTime(.05, t + .4); g.gain.exponentialRampToValueAtTime(.001, t + .5)
        s.connect(f); f.connect(g); g.connect(ac.destination); s.start()
      }
    } catch (e) { /* audio nodes can throw on some browsers */ }
  }
}
