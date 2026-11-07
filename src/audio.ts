// Sonido y música generados en vivo con Web Audio: no hay archivos de audio de terceros.
import { Ev } from './sim/sim';

const KEY = 'turno-noche-mute';
const NOTES = [
  [36, 36, 48, 36, 39, 36, 46, 41], [33, 33, 45, 33, 36, 40, 43, 40], [38, 38, 50, 38, 41, 45, 48, 45], [31, 43, 31, 41, 34, 46, 34, 43], [37, 37, 49, 37, 40, 44, 47, 44],
];
const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);
export class Audio2 {
  ctx: AudioContext | null = null; master: GainNode | null = null; noise: AudioBuffer | null = null; muted: boolean; level = 0; boss = false; playing = false; step = 0; nextT = 0; timer = 0; last: Record<string, number> = {};
  constructor() { let m = false; try { m = localStorage.getItem(KEY) === '1'; } catch { /* sin almacenamiento */ } if (new URLSearchParams(location.search).has('mute')) m = true; this.muted = m; }
  /** El navegador exige un gesto del usuario antes de sonar. */
  unlock() {
    if (this.muted) return;
    if (!this.ctx) {
      const C = window.AudioContext; this.ctx = new C(); this.master = this.ctx.createGain(); this.master.gain.value = .55;
      const comp = this.ctx.createDynamicsCompressor(); this.master.connect(comp); comp.connect(this.ctx.destination);
      this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate); const d = this.noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.timer = window.setInterval(() => this.sched(), 60);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }
  toggle() { this.muted = !this.muted; try { localStorage.setItem(KEY, this.muted ? '1' : '0'); } catch { /* sin almacenamiento */ } if (this.master) this.master.gain.value = this.muted ? 0 : .55; else this.unlock(); return this.muted; }
  private tone(f: number, dur: number, type: OscillatorType, vol: number, slide = 1, when = 0) {
    const c = this.ctx!; const t = (when || c.currentTime); const o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f * slide), t + dur); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur); o.connect(g); g.connect(this.master!); o.start(t); o.stop(t + dur + .02);
  }
  private hiss(dur: number, vol: number, freq = 3000, when = 0) {
    const c = this.ctx!; const t = when || c.currentTime; const s = c.createBufferSource(); s.buffer = this.noise; const fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.setValueAtTime(freq, t); fl.frequency.exponentialRampToValueAtTime(Math.max(60, freq * .15), t + dur); const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur); s.connect(fl); fl.connect(g); g.connect(this.master!); s.start(t, Math.random() * .5, dur + .02);
  }
  private sched() {
    if (!this.ctx || !this.playing || this.muted) return;
    const bpm = this.boss ? 172 : 148, st = 60 / bpm / 2;
    if (this.nextT < this.ctx.currentTime) this.nextT = this.ctx.currentTime + .05;
    while (this.nextT < this.ctx.currentTime + .2) {
      const n = NOTES[this.level % NOTES.length], i = this.step, t = this.nextT, m = n[i % 8] + (Math.floor(i / 32) % 2 ? 3 : 0);
      this.tone(hz(m), st * .9, 'sawtooth', .085, 1, t);
      if (i % 2 === 0) this.tone(hz(m + 24 + [0, 7, 12, 3][(i / 2) % 4]), st * .7, 'square', .028, 1, t);
      if (i % 4 === 0) this.tone(130, .14, 'sine', .3, .3, t);
      if (i % 8 === 4) this.hiss(.13, .16, 3500, t);
      if (i % 2 === 1) this.hiss(.03, .05, 9000, t);
      this.nextT += st; this.step++;
    }
  }
  play(e: Ev) {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime; if ((this.last[e.k] ?? 0) > now - .03) return; this.last[e.k] = now;
    switch (e.k) {
      case 'shot': if (e.s === 'cohete') { this.hiss(.3, .22, 2000); this.tone(200, .25, 'sawtooth', .1, .4); } else if (e.s === 'fuego') this.hiss(.09, .08, 2200); else if (e.s === 'laser') this.tone(1500, .1, 'square', .05, .3); else if (e.s === 'jeringa') this.tone(1200, .06, 'triangle', .1, 1.6); else if (e.s === 'harina') this.hiss(.16, .22, 3000); else { this.tone(520, .07, 'square', .07, .4); this.hiss(.05, .13, 6000); } break;
      case 'eshot': this.tone(760, .1, 'sawtooth', .025, .5); break;
      case 'hit': this.tone(240, .04, 'square', .05, .6); break;
      case 'mhit': this.hiss(.09, .4, 4500); this.tone(150, .12, 'square', .22, .4); break;
      case 'melee': this.hiss(.1, .1, 5000 + (e.a ?? 0) * 1500); break;
      case 'die': this.tone(300, .22, 'square', .1, .2); this.hiss(.14, .14, 2500); break;
      case 'boom': this.hiss(.5, .5, 1400); this.tone(90, .4, 'sine', .5, .3); break;
      case 'bossdie': this.hiss(1.4, .7, 2000); this.tone(70, 1.2, 'sine', .7, .3); break;
      case 'jump': this.tone(280, .12, 'square', .05, 2.1); break;
      case 'jump2': this.tone(420, .12, 'square', .05, 2.1); break;
      case 'land': this.hiss(.06, .1, 900); break;
      case 'dash': this.hiss(.14, .14, 6000); break;
      case 'hurt': this.tone(180, .2, 'sawtooth', .22, .4); break;
      case 'down': this.tone(440, .6, 'sawtooth', .16, .15); break;
      case 'pickup': case 'rescue': [0, .07, .14].forEach((d, i) => this.tone(660 * 1.26 ** i, .1, 'square', .07, 1, now + d)); break;
      case 'revive': [0, .08, .16, .24].forEach((d, i) => this.tone(440 * 1.26 ** i, .14, 'triangle', .16, 1, now + d)); break;
      case 'special': this.tone(220, .5, 'sawtooth', .22, 4); this.hiss(.4, .24, 7000); break;
      case 'parry': this.tone(1500, .14, 'triangle', .2, 2); break;
      case 'clang': this.tone(1900, .07, 'square', .05, .7); break;
      case 'warn': case 'bosswarn': [0, .2, .4].forEach(d => this.tone(620, .15, 'square', .1, .8, now + d)); break;
      case 'ui': this.tone(660, .05, 'square', .05); break;
      case 'confirm': this.tone(660, .08, 'square', .07, 1.5); break;
      case 'victory': [0, .15, .3, .45, .75].forEach((d, i) => this.tone([523, 659, 784, 1046, 1318][i], .3, 'square', .1, 1, now + d)); break;
    }
  }
}
