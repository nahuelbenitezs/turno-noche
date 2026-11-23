// Música y efectos originales sintetizados con Web Audio.
import { W } from './sim/data';
import type { Ev } from './sim/sim';

const KEY = 'turno-noche-mute';
const hz = (note: number) => 440 * 2 ** ((note - 69) / 12);
const MUSIC_GAIN = .48;

const TRACKS = [
  { bpm: 126, roots: [36, 39, 34, 41], lead: [0, 7, 10, 12, 7, 3, 5, 10], kicks: [0, 6, 8, 11], voice: 'triangle', swing: .08, hat: 7100 },
  { bpm: 138, roots: [33, 36, 31, 40], lead: [7, 0, 3, 7, 14, 12, 10, 3], kicks: [0, 3, 8, 10], voice: 'square', swing: .04, hat: 4850 },
  { bpm: 156, roots: [38, 41, 36, 43], lead: [12, 7, 0, 7, 3, 10, 7, 3], kicks: [0, 4, 8, 12], voice: 'triangle', swing: .0, hat: 8200 },
  { bpm: 143, roots: [31, 34, 37, 41], lead: [0, 6, 10, 6, 12, 7, 10, 3], kicks: [0, 5, 8, 14], voice: 'sine', swing: .11, hat: 5500 },
  { bpm: 151, roots: [37, 40, 35, 44], lead: [12, 15, 7, 3, 14, 10, 7, 0], kicks: [0, 6, 8, 12], voice: 'triangle', swing: .035, hat: 9400 },
] as const;

const NON_POSITIONAL = new Set(['ui', 'confirm', 'pickblocked', 'checkpoint', 'bosswarn', 'levelstart', 'frenzy', 'victory']);
type Voice = 'sine' | 'triangle' | 'square' | 'sawtooth';
type Sound = {
  tone: (freq: number, duration: number, type: Voice, gain: number, slide?: number, delay?: number) => void;
  noise: (duration: number, gain: number, cutoff: number, delay?: number) => void;
};

export class Audio2 {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private music: GainNode | null = null;
  private effects: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private last: Record<string, number> = {};
  private voices = 0;
  private step = 0;
  private nextT = 0;
  private frenzyUntil = 0;
  private isPaused = false;
  private bossStage = 1;

  level = 0;
  boss = false;
  playing = false;
  muted: boolean;
  volume = .65;

  constructor() {
    let muted = false;
    try { muted = localStorage.getItem(KEY) === '1'; } catch { /* El almacenamiento es opcional. */ }
    this.muted = muted || new URLSearchParams(location.search).has('mute');
  }

  get paused() { return this.isPaused; }
  set paused(paused: boolean) {
    if (this.isPaused === paused) return;
    this.isPaused = paused;
    if (!this.ctx || !this.music) return;
    const t = this.ctx.currentTime;
    this.music.gain.cancelScheduledValues(t);
    this.music.gain.setTargetAtTime(paused ? .16 : MUSIC_GAIN, t, .08);
  }

  /** El primer gesto del jugador abre los canales del mezclador. */
  unlock() {
    if (this.muted) return;
    if (!this.ctx) {
      const Context = window.AudioContext;
      if (!Context) return;
      const ctx = new Context();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.music = ctx.createGain();
      this.effects = ctx.createGain();
      this.master.gain.value = this.volume;
      this.music.gain.value = this.isPaused ? .16 : MUSIC_GAIN;
      this.effects.gain.value = .92;

      const warm = ctx.createBiquadFilter();
      warm.type = 'lowpass';
      warm.frequency.value = 5250;
      this.music.connect(warm);
      warm.connect(this.master);
      this.effects.connect(this.master);

      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -13;
      compressor.knee.value = 15;
      compressor.ratio.value = 4;
      compressor.attack.value = .004;
      compressor.release.value = .19;
      this.master.connect(compressor);
      compressor.connect(ctx.destination);

      this.noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
      const samples = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
      window.setInterval(() => this.schedule(), 46);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => {});
  }

  toggle() {
    this.muted = !this.muted;
    try { localStorage.setItem(KEY, this.muted ? '1' : '0'); } catch { /* El almacenamiento es opcional. */ }
    if (!this.muted) this.unlock();
    this.setVolume(this.volume);
    return this.muted;
  }

  setVolume(value: number) {
    this.volume = Math.max(0, Math.min(1, value));
    if (!this.ctx || !this.master) return;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, .025);
  }

  private route(source: AudioNode, target: AudioNode, pan: number) {
    if (pan === 0 || !this.ctx?.createStereoPanner) {
      source.connect(target);
      return;
    }
    const stereo = this.ctx.createStereoPanner();
    stereo.pan.value = pan;
    source.connect(stereo);
    stereo.connect(target);
    return stereo;
  }

  private tone(target: AudioNode, time: number, pan: number, freq: number, duration: number, wave: Voice, volume: number, slide: number) {
    if (this.voices >= 80) return;
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    const end = time + duration;
    osc.type = wave;
    osc.frequency.setValueAtTime(freq, time);
    osc.frequency.exponentialRampToValueAtTime(Math.max(22, freq * slide), end);
    env.gain.setValueAtTime(.0001, time);
    env.gain.linearRampToValueAtTime(volume, time + Math.min(.015, duration / 4));
    env.gain.exponentialRampToValueAtTime(.0001, end);
    osc.connect(env);
    const stereo = this.route(env, target, pan);
    this.voices++;
    osc.onended = () => {
      osc.disconnect();
      env.disconnect();
      stereo?.disconnect();
      this.voices--;
    };
    osc.start(time);
    osc.stop(end + .012);
  }

  private noise(target: AudioNode, time: number, pan: number, duration: number, volume: number, cutoff: number) {
    if (this.voices >= 80) return;
    const ctx = this.ctx!;
    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const env = ctx.createGain();
    const end = time + duration;
    source.buffer = this.noiseBuffer;
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff, time);
    filter.frequency.exponentialRampToValueAtTime(Math.max(75, cutoff * .19), end);
    env.gain.setValueAtTime(.0001, time);
    env.gain.linearRampToValueAtTime(volume, time + .006);
    env.gain.exponentialRampToValueAtTime(.0001, end);
    source.connect(filter);
    filter.connect(env);
    const stereo = this.route(env, target, pan);
    this.voices++;
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      env.disconnect();
      stereo?.disconnect();
      this.voices--;
    };
    source.start(time, Math.random() * .6, duration + .013);
  }

  private sound(target: AudioNode, time: number, pan = 0): Sound {
    return {
      tone: (freq, duration, wave, volume, slide = 1, delay = 0) => this.tone(target, time + delay, pan, freq, duration, wave, volume, slide),
      noise: (duration, volume, cutoff, delay = 0) => this.noise(target, time + delay, pan, duration, volume, cutoff),
    };
  }

  private duck(now: number, depth = .62) {
    if (!this.music || this.isPaused) return;
    const gain = this.music.gain;
    gain.cancelScheduledValues(now);
    gain.setTargetAtTime(MUSIC_GAIN * depth, now, .025);
    gain.setTargetAtTime(MUSIC_GAIN, now + .16, .27);
  }

  private schedule() {
    const ctx = this.ctx, music = this.music;
    if (!ctx || !music || !this.playing || this.muted || this.isPaused || ctx.state !== 'running') return;
    const track = TRACKS[this.level] ?? TRACKS[0];
    const frenzy = ctx.currentTime < this.frenzyUntil;
    const bpm = track.bpm + (frenzy ? 24 : this.boss ? 10 : 0);
    const beat = 60 / bpm / 4;
    if (this.nextT < ctx.currentTime) this.nextT = ctx.currentTime + .025;
    while (this.nextT < ctx.currentTime + .12) {
      const i = this.step;
      const beatInBar = i % 16;
      const root = track.roots[Math.floor(i / 16) % track.roots.length];
      const time = this.nextT + (i % 2 ? track.swing * beat : 0);
      const { tone, noise } = this.sound(music, time);

      if (track.kicks.some(kick => kick === beatInBar) || (this.boss && beatInBar === 10)) {
        tone(105, .16, 'sine', .25, .38);
      }
      if (beatInBar === 4 || beatInBar === 12) {
        tone(184, .105, 'triangle', .075, .76);
        noise(.1, .15, 4400);
      }
      if (i % 2 === 0 || ((frenzy || this.bossStage === 3) && i % 4 === 3)) {
        noise(beat * .72, i % 4 === 2 ? .068 : .035, track.hat);
      }
      if (i % 4 !== 3) {
        const bass = root + (beatInBar === 10 ? (this.boss ? 6 : 7) : beatInBar === 14 ? 12 : 0);
        tone(hz(bass), beat * (i % 2 ? .72 : 1.45), 'triangle', .13, i % 4 === 2 ? .97 : 1);
      }
      if (this.voices < 50 && beatInBar % 4 === 0) {
        const melody = root + 24 + track.lead[Math.floor(i / 4) % track.lead.length];
        this.sound(music, time, beatInBar < 8 ? -.23 : .23).tone(hz(melody), beat * 2.4, track.voice, .058);
      }
      if (this.voices < 50 && beatInBar === 0) {
        const chord = this.boss ? [0, 6, 12] : [0, 3, 7];
        for (const interval of chord) {
          tone(hz(root + 12 + interval), beat * 14, 'sine', .033);
        }
      }
      if (this.voices < 50 && (this.boss || frenzy) && i % 4 === 3) {
        tone(hz(root + 36 + track.lead[i % 7]), beat * .8, frenzy ? 'square' : 'triangle', .042);
      }
      this.nextT += beat;
      this.step++;
    }
  }

  play(e: Ev, cameraCenter = e.x) {
    if (e.k === 'levelstart') {
      this.step = 0;
      this.nextT = (this.ctx?.currentTime ?? 0) + .15;
      this.frenzyUntil = 0;
      this.bossStage = 1;
    }
    if (e.k === 'bossphase') this.bossStage = e.a ?? 1;
    if (!this.ctx || !this.effects || this.muted || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const pan = NON_POSITIONAL.has(e.k) ? 0 : Math.max(-.72, Math.min(.72, (e.x - cameraCenter) / (W / 2)));
    const bucket = e.k + (pan < -.22 ? 'L' : pan > .22 ? 'R' : 'C');
    if (now - (this.last[bucket] ?? -1) < .033) return;
    this.last[bucket] = now;

    const { tone, noise } = this.sound(this.effects, now, pan);
    const riff = (notes: number[], interval: number, wave: Voice = 'triangle', gain = .12) => {
      notes.forEach((n, i) => tone(hz(n), interval * 2.5, wave, gain, 1, i * interval));
    };
    switch (e.k) {
      case 'shot':
        switch (e.s) {
          case 'cohete': tone(152, .22, 'sawtooth', .13, .47); noise(.24, .17, 2050); break;
          case 'fuego': noise(.11, .098, 2250); break;
          case 'laser': tone(1410, .095, 'triangle', .125, .39); tone(334, .116, 'sine', .05, .69); break;
          case 'jeringa': tone(960, .09, 'triangle', .11, 1.64); break;
          case 'harina': tone(138, .13, 'triangle', .11, .48); noise(.15, .17, 2350); break;
          default: tone(506, .067, 'square', .062, .35); noise(.06, .13, 4800);
        }
        break;
      case 'eshot': tone(746, .105, 'sawtooth', .034, .53); break;
      case 'empty': tone(172, .08, 'triangle', .14, .52); noise(.052, .07, 2700); break;
      case 'hit': tone(239, .04, 'triangle', .045, .6); break;
      case 'mhit': noise(.093, .28, 4620); tone(141, .124, 'triangle', .24, .43); break;
      case 'melee': noise(.12, .12, 3920 + (e.a ?? 0) * 1400); break;
      case 'counter': this.duck(now, .52); noise(.19, .22, 5190); riff([53, 65, 72], .042, 'triangle', .19); break;
      case 'teamhit': riff([64, 68, 75], .043, 'triangle', .155); tone(99, .18, 'sine', .18, .61); break;
      case 'record': this.duck(now); riff((e.a ?? 0) >= 3 ? [67, 72, 76, 79, 84] : [67, 76, 81], .073); break;
      case 'die': tone(314, .19, 'sawtooth', .11, .22); noise(.11, .13, 2210); break;
      case 'boom': this.duck(now, .83); noise(.47, .39, 1800); tone(98, .44, 'sine', .38, .31); break;
      case 'bossdie': this.duck(now, .35); noise(1.25, .55, 1870); tone(78, 1.12, 'sine', .61, .29); break;
      case 'jump': tone(270, .105, 'triangle', .11, 2.04); break;
      case 'jump2': tone(405, .122, 'triangle', .105, 2.16); break;
      case 'land': noise(.082, .12, 870); break;
      case 'dash': noise(.14, .142, 6500); tone(115, .135, 'sine', .092, 1.9); break;
      case 'grenade': tone(240, .108, 'triangle', .14, .58); noise(.06, .088, 1760); break;
      case 'dodge': riff([72, 79, 86], .045, 'triangle', .126); break;
      case 'frenzy': this.frenzyUntil = now + 8; this.duck(now); riff([60, 64, 67, 72, 79], .076, 'square', .07); noise(.31, .13, 4820); break;
      case 'chain': riff([55, 62, 70], .051, 'sawtooth', .078); break;
      case 'checkpoint': this.duck(now); riff([67, 71, 74, 79], .096); break;
      case 'pickblocked': riff([49, 43], .085, 'triangle', .1); break;
      case 'respawn': riff([60, 65, 69], .074); break;
      case 'levelstart': riff([57 + this.level, 64 + this.level, 69 + this.level], .09, 'triangle', .1); break;
      case 'hurt': tone(179, .2, 'sawtooth', .195, .43); noise(.073, .092, 1850); break;
      case 'down': this.duck(now, .46); tone(452, .58, 'sawtooth', .15, .157); break;
      case 'pickup': riff(e.s === 'food' ? [73, 77, 81] : [62, 69, 74], .058, 'triangle', .116); break;
      case 'rescue': riff([72, 76, 79, 84], .066, 'triangle', .13); break;
      case 'revive': riff([60, 67, 72, 76], .078, 'triangle', .145); break;
      case 'special':
        this.duck(now, .42);
        if (e.a === 0) {
          tone(105, .57, 'sawtooth', .235, 3.85);
          noise(.37, .21, 4980);
        } else if (e.a === 1) {
          tone(75, .55, 'sine', .49, .30);
          noise(.37, .24, 1920);
        } else if (e.a === 2) {
          riff([60, 64, 67, 72, 76], .09, 'triangle', .155);
        } else {
          riff([70, 63, 53, 36], .085, 'square', .095);
          noise(.37, .14, 5800);
        }
        break;
      case 'parry': tone(1570, .163, 'triangle', .215, 1.86); tone(450, .14, 'sine', .12, 2.14); break;
      case 'clang': tone(1830, .078, 'square', .065, .64); noise(.038, .065, 5590); break;
      case 'warn': riff([75, 75], .092, 'square', .095); break;
      case 'bosswarn': this.duck(now, .38); riff([48, 48, 54], .16, 'sawtooth', .127); break;
      case 'bossphase': this.duck(now, .43); riff(e.a === 3 ? [57, 63, 69] : [48, 54, 60], .108, 'sawtooth', .13); break;
      case 'boss': tone(75, .72, 'sine', .47, .52); noise(.44, .24, 2930); break;
      case 'vehicle': tone(111, .24, 'sawtooth', .11, 2.06); break;
      case 'ui': tone(622, .052, 'triangle', .09, 1.09); break;
      case 'confirm': riff([66, 73], .068); break;
      case 'victory': this.duck(now, .41); riff([60, 64, 67, 72, 76, 79], .137, 'triangle', .15); break;
    }
  }
}
