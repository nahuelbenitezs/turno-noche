// Dispositivos: dos jugadores en teclado, mandos con Gamepad API y controles táctiles. Cada uno ocupa un lugar al sumarse.
import { BTN } from './sim/data';

const K1: Record<string, number> = { KeyA: BTN.L, KeyD: BTN.R, KeyW: BTN.U, KeyS: BTN.D, KeyK: BTN.J, KeyJ: BTN.S, KeyL: BTN.M, KeyI: BTN.X, KeyU: BTN.DASH };
const K2: Record<string, number> = { ArrowLeft: BTN.L, ArrowRight: BTN.R, ArrowUp: BTN.U, ArrowDown: BTN.D, Period: BTN.J, Comma: BTN.S, Slash: BTN.M, Semicolon: BTN.X, ShiftRight: BTN.DASH, Numpad2: BTN.J, Numpad1: BTN.S, Numpad3: BTN.M, Numpad5: BTN.X, Numpad0: BTN.DASH };
const ACTIONS = BTN.J | BTN.S | BTN.M | BTN.X;

export class Inputs {
  held = new Set<string>(); tapped = new Set<string>(); touch = 0; pick = 0; pulse = 0; assign = new Map<string, number>(); usedTouch = false; onGamepad?: (n: number) => void; padCount = 0;
  constructor() {
    addEventListener('keydown', e => { if (e.code in K1 || e.code in K2) { if (!(e.target instanceof HTMLInputElement)) { this.held.add(e.code); this.tapped.add(e.code); e.preventDefault(); } } });
    addEventListener('keyup', e => this.held.delete(e.code));
    addEventListener('blur', () => this.held.clear());
  }
  private kb(map: Record<string, number>) { let v = 0; for (const c in map) if (this.held.has(c) || this.tapped.has(c)) v |= map[c]; return v; }
  private pad(g: Gamepad) {
    const b = (i: number) => !!g.buttons[i]?.pressed; let v = 0; const ax = g.axes[0] ?? 0, ay = g.axes[1] ?? 0;
    if (b(14) || ax < -.4) v |= BTN.L; if (b(15) || ax > .4) v |= BTN.R; if (b(12) || ay < -.55) v |= BTN.U; if (b(13) || ay > .55) v |= BTN.D;
    if (b(0)) v |= BTN.J; if (b(2) || b(7)) v |= BTN.S; if (b(1)) v |= BTN.M; if (b(3)) v |= BTN.X; if (b(4) || b(5) || b(6)) v |= BTN.DASH;
    return v;
  }
  /** Lee cada dispositivo. Devuelve nombre → botones. */
  read(): Map<string, number> {
    const m = new Map<string, number>();
    m.set('kb1', this.kb(K1)); m.set('kb2', this.kb(K2)); this.tapped.clear(); // Un toque corto cuenta aunque caiga entre dos cuadros.
    if (navigator.getGamepads) { let n = 0; for (const g of navigator.getGamepads()) if (g && g.connected) { n++; m.set('pad' + g.index, this.pad(g)); } if (n !== this.padCount) { this.padCount = n; this.onGamepad?.(n); } }
    let t = this.touch; if (this.pick) { t |= this.pick; this.pick = 0; } if (this.pulse) { t |= this.pulse; this.pulse = 0; }
    m.set('touch', t);
    return m;
  }
  /** Modo local u host: un dispositivo que aprieta acción ocupa el siguiente lugar libre. */
  slots(freeSlots: () => number[], canJoin: boolean): (number | null)[] {
    const out: (number | null)[] = [null, null, null, null]; const devs = this.read();
    for (const [name, v] of devs) {
      if (!this.assign.has(name) && canJoin && (v & (ACTIONS | 0xffff0000))) { const f = freeSlots().filter(x => ![...this.assign.values()].includes(x)); if (f.length) this.assign.set(name, f[0]); }
      const s = this.assign.get(name); if (s !== undefined) out[s] = (out[s] ?? 0) | v;
    }
    return out;
  }
  /** Invitado online: todos sus dispositivos manejan a su único personaje. */
  merged() { let v = 0; for (const x of this.read().values()) v |= x; return v; }
  anyAction() { let v = 0; for (const x of this.read().values()) v |= x; return (v & ACTIONS) !== 0; }
  /** Toques en la interfaz: si ya hay un jugador en este equipo los toma ese, si no se suma "touch". */
  clickTarget() { if (!this.assign.has('touch') && this.assign.size) { const first = [...this.assign.keys()][0]; return first; } return 'touch'; }
}

/** Dibuja y maneja los botones táctiles en pantalla. */
export function setupTouch(root: HTMLElement, inp: Inputs) {
  const set = (el: HTMLElement, bit: number) => {
    el.addEventListener('pointerdown', e => { e.preventDefault(); el.setPointerCapture(e.pointerId); inp.touch |= bit; el.classList.add('on'); inp.usedTouch = true; });
    const off = () => { inp.touch &= ~bit; el.classList.remove('on'); }; el.addEventListener('pointerup', off); el.addEventListener('pointercancel', off); el.addEventListener('lostpointercapture', off);
  };
  root.querySelectorAll<HTMLElement>('[data-btn]').forEach(el => set(el, BTN[el.dataset.btn as keyof typeof BTN]));
  const pad = root.querySelector<HTMLElement>('.dpad')!; const dirs = BTN.L | BTN.R | BTN.U | BTN.D;
  const mv = (e: PointerEvent) => { const r = pad.getBoundingClientRect(); const dx = (e.clientX - r.left - r.width / 2) / (r.width / 2), dy = (e.clientY - r.top - r.height / 2) / (r.height / 2); let v = 0; if (dx < -.28) v |= BTN.L; if (dx > .28) v |= BTN.R; if (dy < -.45) v |= BTN.U; if (dy > .55) v |= BTN.D; inp.touch = (inp.touch & ~dirs) | v; const knob = pad.firstElementChild as HTMLElement; knob.style.transform = `translate(${Math.max(-1, Math.min(1, dx)) * 28}px,${Math.max(-1, Math.min(1, dy)) * 28}px)`; };
  pad.addEventListener('pointerdown', e => { e.preventDefault(); pad.setPointerCapture(e.pointerId); mv(e); inp.usedTouch = true; });
  pad.addEventListener('pointermove', e => { if (pad.hasPointerCapture(e.pointerId)) mv(e); });
  const end = () => { inp.touch &= ~dirs; (pad.firstElementChild as HTMLElement).style.transform = ''; }; pad.addEventListener('pointerup', end); pad.addEventListener('pointercancel', end);
}
