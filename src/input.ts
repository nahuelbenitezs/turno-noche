// Dispositivos independientes: dos teclados, mandos y multitoque. La simulación recibe bits.
import { BTN } from './sim/data';

const K1: Record<string, number> = { KeyA: BTN.L, KeyD: BTN.R, KeyW: BTN.U, KeyS: BTN.D, KeyK: BTN.J, KeyJ: BTN.S, KeyL: BTN.M, KeyI: BTN.X, KeyU: BTN.DASH, KeyO: BTN.G };
const K2: Record<string, number> = { ArrowLeft: BTN.L, ArrowRight: BTN.R, ArrowUp: BTN.U, ArrowDown: BTN.D, Period: BTN.J, Comma: BTN.S, Slash: BTN.M, Semicolon: BTN.X, ShiftRight: BTN.DASH, Enter: BTN.G, Numpad2: BTN.J, Numpad1: BTN.S, Numpad3: BTN.M, Numpad5: BTN.X, Numpad0: BTN.DASH, Numpad4: BTN.G };
const ACTIONS = BTN.J | BTN.S | BTN.M | BTN.X | BTN.G;

export class Inputs {
  claimPrimary = false;
  held = new Set<string>(); tapped = new Set<string>(); touch = 0; touchTapped = 0; pick = 0; pulse = 0; assign = new Map<string, number>(); usedTouch = false; onGamepad?: (n: number) => void; padCount = 0;
  private touchReset?: () => void;
  constructor() {
    addEventListener('keydown', e => {
      const el = e.target as HTMLElement | null;
      if (el && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable)) return;
      if ((e.code === 'Enter' || e.code === 'Space') && el && (el.tagName === 'BUTTON' || el.closest?.('button'))) return;
      if (e.code in K1 || e.code in K2) {
        if (!e.repeat) { this.held.add(e.code); this.tapped.add(e.code); }
        e.preventDefault();
      }
    });
    addEventListener('keyup', e => this.held.delete(e.code));
    addEventListener('blur', () => this.reset());
    addEventListener('gamepaddisconnected', e => this.assign.delete('pad' + e.gamepad.index));
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.reset(); });
  }
  /** Limpiar controles al pausar o cambiar de pantalla conserva los lugares de los jugadores. */
  reset() { this.held.clear(); this.tapped.clear(); this.touch = this.touchTapped = this.pick = this.pulse = 0; this.touchReset?.(); }
  setTouchReset(fn: () => void) { this.touchReset = fn; }
  private kb(map: Record<string, number>) { let v = 0; for (const c in map) if (this.held.has(c) || this.tapped.has(c)) v |= map[c]; return v; }
  private pad(g: Gamepad) {
    const b = (i: number) => !!g.buttons[i]?.pressed; let v = 0; const ax = g.axes[0] ?? 0, ay = g.axes[1] ?? 0;
    if (b(14) || ax < -.4) v |= BTN.L; if (b(15) || ax > .4) v |= BTN.R; if (b(12) || ay < -.55) v |= BTN.U; if (b(13) || ay > .55) v |= BTN.D;
    if (b(0)) v |= BTN.J; if (b(2) || b(7)) v |= BTN.S; if (b(1)) v |= BTN.M; if (b(3)) v |= BTN.X; if (b(4) || b(6)) v |= BTN.DASH; if (b(5)) v |= BTN.G;
    return v;
  }
  /** Lee cada dispositivo una vez; conserva los toques que comenzaron y terminaron entre cuadros. */
  read(): Map<string, number> {
    const m = new Map<string, number>();
    m.set('kb1', this.kb(K1)); m.set('kb2', this.kb(K2)); this.tapped.clear();
    const pads = new Set<string>();
    if (navigator.getGamepads) for (const g of navigator.getGamepads()) if (g && g.connected) { const name = 'pad' + g.index; pads.add(name); m.set(name, this.pad(g)); }
    for (const name of this.assign.keys()) if (name.startsWith('pad') && !pads.has(name)) this.assign.delete(name);
    if (pads.size !== this.padCount) { this.padCount = pads.size; this.onGamepad?.(pads.size); }
    let t = this.touch | this.touchTapped; this.touchTapped = 0;
    if (this.pick) { t |= this.pick; this.pick = 0; } if (this.pulse) { t |= this.pulse; this.pulse = 0; }
    m.set('touch', t);
    return m;
  }
  slots(freeSlots: () => number[], canJoin: boolean): (number | null)[] {
    const out: (number | null)[] = [null, null, null, null], devs = this.read();
    for (const [name, v] of devs) {
      if (this.claimPrimary && canJoin && (v & (ACTIONS | 0xffff0000))) {
        for (const [reserved, slot] of this.assign) if (slot === 0) this.assign.delete(reserved);
        this.assign.set(name, 0); this.claimPrimary = false;
      }
      if (!this.assign.has(name) && canJoin && (v & (ACTIONS | 0xffff0000))) { const f = freeSlots().filter(x => ![...this.assign.values()].includes(x)); if (f.length) this.assign.set(name, f[0]); }
      const slot = this.assign.get(name); if (slot !== undefined) out[slot] = (out[slot] ?? 0) | v;
    }
    return out;
  }
  merged() { let v = 0; for (const x of this.read().values()) v |= x; return v; }
  anyAction() { let v = 0; for (const x of this.read().values()) v |= x; return (v & ACTIONS) !== 0; }
  clickTarget() { if (!this.assign.has('touch') && this.assign.size) return [...this.assign.keys()][0]; return 'touch'; }
}

/** Cada dedo tiene su propia captura. Soltar uno no suelta los botones de otro. */
export function setupTouch(root: HTMLElement, inp: Inputs) {
  const resets: (() => void)[] = [];
  root.querySelectorAll<HTMLElement>('[data-btn]').forEach(el => {
    const bit = BTN[el.dataset.btn as keyof typeof BTN], pointers = new Set<number>();
    if (!bit) return;
    el.addEventListener('pointerdown', e => {
      e.preventDefault(); pointers.add(e.pointerId); el.setPointerCapture(e.pointerId);
      inp.touch |= bit; inp.touchTapped |= bit; el.classList.add('on'); inp.usedTouch = true;
    });
    const off = (e: PointerEvent) => { pointers.delete(e.pointerId); if (!pointers.size) { inp.touch &= ~bit; el.classList.remove('on'); } };
    el.addEventListener('pointerup', off); el.addEventListener('pointercancel', off); el.addEventListener('lostpointercapture', off);
    resets.push(() => { const ids = [...pointers]; pointers.clear(); el.classList.remove('on'); for (const id of ids) if (el.hasPointerCapture(id)) el.releasePointerCapture(id); });
  });
  const pad = root.querySelector<HTMLElement>('.dpad')!, dirs = BTN.L | BTN.R | BTN.U | BTN.D;
  let activePointer: number | null = null;
  const knob = pad.firstElementChild as HTMLElement;
  const move = (e: PointerEvent) => {
    const r = pad.getBoundingClientRect(), dx = (e.clientX - r.left - r.width / 2) / (r.width / 2), dy = (e.clientY - r.top - r.height / 2) / (r.height / 2);
    let v = 0; if (dx < -.28) v |= BTN.L; if (dx > .28) v |= BTN.R; if (dy < -.45) v |= BTN.U; if (dy > .55) v |= BTN.D;
    inp.touch = (inp.touch & ~dirs) | v;
    knob.style.transform = `translate(${Math.max(-1, Math.min(1, dx)) * 28}px,${Math.max(-1, Math.min(1, dy)) * 28}px)`;
  };
  pad.addEventListener('pointerdown', e => { if (activePointer !== null) return; e.preventDefault(); activePointer = e.pointerId; pad.setPointerCapture(e.pointerId); move(e); inp.usedTouch = true; });
  pad.addEventListener('pointermove', e => { if (e.pointerId === activePointer && pad.hasPointerCapture(e.pointerId)) move(e); });
  const end = (e: PointerEvent) => { if (e.pointerId !== activePointer) return; activePointer = null; inp.touch &= ~dirs; knob.style.transform = ''; };
  pad.addEventListener('pointerup', end); pad.addEventListener('pointercancel', end); pad.addEventListener('lostpointercapture', end);
  resets.push(() => { const id = activePointer; activePointer = null; knob.style.transform = ''; if (id !== null && pad.hasPointerCapture(id)) pad.releasePointerCapture(id); });
  inp.setTouchReset(() => resets.forEach(reset => reset()));
}
