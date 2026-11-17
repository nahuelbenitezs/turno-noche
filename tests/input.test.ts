import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Inputs, setupTouch } from '../src/input';
import { BTN, pickBits } from '../src/sim/data';

class FakeElement extends EventTarget {
  dataset: Record<string, string> = {};
  style = { transform: '' };
  captures = new Set<number>();
  classes = new Set<string>();
  classList = { add: (s: string) => this.classes.add(s), remove: (s: string) => this.classes.delete(s), contains: (s: string) => this.classes.has(s) };
  firstElementChild: FakeElement | null = null;
  setPointerCapture(id: number) { this.captures.add(id); }
  hasPointerCapture(id: number) { return this.captures.has(id); }
  releasePointerCapture(id: number) { this.captures.delete(id); fire(this, 'lostpointercapture', { pointerId: id }); }
  getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 100 }; }
}
const fire = (target: EventTarget, type: string, data: Record<string, unknown> = {}) => {
  const ev = new Event(type, { cancelable: true });
  for (const [k, v] of Object.entries(data)) Object.defineProperty(ev, k, { value: v });
  target.dispatchEvent(ev); return ev;
};
let events: EventTarget, doc: EventTarget & { hidden: boolean }, pads: (Gamepad | null)[];
beforeEach(() => {
  events = new EventTarget(); doc = Object.assign(new EventTarget(), { hidden: false }); pads = [];
  vi.stubGlobal('addEventListener', events.addEventListener.bind(events));
  vi.stubGlobal('document', doc);
  vi.stubGlobal('navigator', { getGamepads: () => pads });
});
afterEach(() => vi.unstubAllGlobals());
function touchRig() {
  const inp = new Inputs(), shoot = new FakeElement(), jump = new FakeElement(), pad = new FakeElement(), knob = new FakeElement();
  shoot.dataset.btn = 'S'; jump.dataset.btn = 'J'; pad.firstElementChild = knob;
  const root = { querySelectorAll: () => [shoot, jump], querySelector: () => pad } as unknown as HTMLElement;
  setupTouch(root, inp); return { inp, shoot, jump, pad, knob };
}
const gamepad = (index: number, pressed: number[]) => ({ index, connected: true, axes: [0, 0], buttons: Array.from({ length: 16 }, (_, i) => ({ pressed: pressed.includes(i) })) }) as unknown as Gamepad;

describe('controles de teclado y mandos', () => {
  it('un toque corto de teclado entre cuadros llega una sola vez', () => {
    const inp = new Inputs();
    fire(events, 'keydown', { code: 'KeyJ', repeat: false }); fire(events, 'keyup', { code: 'KeyJ' });
    expect(inp.read().get('kb1')).toBe(BTN.S); expect(inp.read().get('kb1')).toBe(0);
  });
  it('granada funciona en ambos teclados y también permite incorporarse', () => {
    const inp = new Inputs(); fire(events, 'keydown', { code: 'KeyO', repeat: false }); fire(events, 'keydown', { code: 'Numpad4', repeat: false });
    expect(inp.slots(() => [0, 1, 2, 3], true)).toEqual([BTN.G, BTN.G, null, null]);
  });
  it('escribir en el código de sala no activa controles', () => {
    const inp = new Inputs();
    fire(events, 'keydown', { code: 'KeyJ', repeat: false, target: { tagName: 'INPUT' } });
    expect(inp.read().get('kb1')).toBe(0);
  });
  it('Enter activa botones del menú y sus descendientes sin crear un segundo jugador', () => {
    const inp = new Inputs();
    for (const target of [{ tagName: 'BUTTON' }, { tagName: 'SPAN', closest: () => ({ tagName: 'BUTTON' }) }]) {
      const ev = fire(events, 'keydown', { code: 'Enter', repeat: false, target });
      expect(ev.defaultPrevented).toBe(false); expect(inp.slots(() => [0, 1, 2, 3], true)).toEqual([null, null, null, null]);
    }
    const space = fire(events, 'keydown', { code: 'Space', repeat: false, target: { tagName: 'BUTTON' } }); expect(space.defaultPrevented).toBe(false);
  });
  it('Enter conserva la granada del segundo teclado durante la partida', () => {
    const inp = new Inputs(); inp.assign.set('kb2', 1);
    const ev = fire(events, 'keydown', { code: 'Enter', repeat: false, target: { tagName: 'CANVAS' } });
    expect(ev.defaultPrevented).toBe(true); expect(inp.slots(() => [], false)).toEqual([null, BTN.G, null, null]);
  });
  it('LB esquiva y RB lanza granadas sin combinar ambas acciones', () => {
    const inp = new Inputs(); pads = [gamepad(0, [5]), gamepad(1, [4])];
    expect(inp.read().get('pad0')).toBe(BTN.G); expect(inp.read().get('pad1')).toBe(BTN.DASH);
  });
  it('desconectar un mando devuelve null para su lugar y libera la asignación', () => {
    const inp = new Inputs(); pads = [gamepad(0, [2])]; expect(inp.slots(() => [1], true)[1]).toBe(BTN.S);
    pads = []; expect(inp.slots(() => [1], true)[1]).toBeNull(); expect(inp.assign.has('pad0')).toBe(false);
    pads = [gamepad(1, [2])]; expect(inp.slots(() => [1], true)[1]).toBe(BTN.S); expect(inp.assign.get('pad1')).toBe(1);
  });
  it('el primer mando del anfitrión toma J1 y reemplaza la reserva del teclado', () => {
    const inp = new Inputs(); inp.assign.set('kb1', 0); inp.claimPrimary = true; pads = [gamepad(0, [0])];
    expect(inp.slots(() => [1, 2, 3], true)).toEqual([BTN.J, null, null, null]);
    expect(inp.assign.has('kb1')).toBe(false); expect(inp.assign.get('pad0')).toBe(0); expect(inp.claimPrimary).toBe(false);
    pads = [gamepad(0, []), gamepad(1, [0])];
    expect(inp.slots(() => [1, 2, 3], true)).toEqual([0, BTN.J, null, null]);
  });
  it('reset preserva asignaciones y descarta teclas repetidas hasta volver a presionarlas', () => {
    const inp = new Inputs(); inp.assign.set('kb1', 0); inp.pick = pickBits(2); inp.pulse = BTN.J;
    fire(events, 'keydown', { code: 'KeyJ', repeat: false }); inp.reset();
    fire(events, 'keydown', { code: 'KeyJ', repeat: true });
    expect(inp.merged()).toBe(0); expect(inp.assign.get('kb1')).toBe(0);
    fire(events, 'keyup', { code: 'KeyJ' }); fire(events, 'keydown', { code: 'KeyJ', repeat: false });
    expect(inp.read().get('kb1')).toBe(BTN.S);
  });
});

describe('multitoque móvil', () => {
  it('un toque corto dispara aunque termine antes del siguiente tick y no altera una carta elegida', () => {
    const { inp, shoot } = touchRig(); inp.pick = pickBits(2);
    fire(shoot, 'pointerdown', { pointerId: 1 }); fire(shoot, 'pointerup', { pointerId: 1 });
    expect(inp.read().get('touch')).toBe(BTN.S | pickBits(2)); expect(inp.read().get('touch')).toBe(0);
  });
  it('dos dedos sobre el mismo botón no se cancelan al soltar uno', () => {
    const { inp, shoot } = touchRig();
    fire(shoot, 'pointerdown', { pointerId: 1 }); fire(shoot, 'pointerdown', { pointerId: 2 }); inp.read();
    fire(shoot, 'pointerup', { pointerId: 1 }); expect(inp.read().get('touch')).toBe(BTN.S); expect(shoot.classList.contains('on')).toBe(true);
    fire(shoot, 'pointerup', { pointerId: 2 }); expect(inp.read().get('touch')).toBe(0); expect(shoot.classList.contains('on')).toBe(false);
  });
  it('mover, disparar y saltar pueden mantenerse a la vez con dedos independientes', () => {
    const { inp, shoot, jump, pad } = touchRig();
    fire(pad, 'pointerdown', { pointerId: 1, clientX: 95, clientY: 50 });
    fire(shoot, 'pointerdown', { pointerId: 2 }); fire(jump, 'pointerdown', { pointerId: 3 });
    expect(inp.read().get('touch')).toBe(BTN.R | BTN.S | BTN.J);
    fire(jump, 'pointercancel', { pointerId: 3 }); expect(inp.read().get('touch')).toBe(BTN.R | BTN.S);
    fire(pad, 'lostpointercapture', { pointerId: 1 }); expect(inp.read().get('touch')).toBe(BTN.S);
  });
  it('un segundo dedo en el joystick no le roba el control al primero', () => {
    const { inp, pad } = touchRig();
    fire(pad, 'pointerdown', { pointerId: 1, clientX: 95, clientY: 50 });
    fire(pad, 'pointerdown', { pointerId: 2, clientX: 5, clientY: 50 });
    fire(pad, 'pointerup', { pointerId: 2 }); expect(inp.read().get('touch')).toBe(BTN.R);
    fire(pad, 'pointerup', { pointerId: 1 }); expect(inp.read().get('touch')).toBe(0);
  });
  it('perder foco limpia el joystick, todos los botones, latches y clases visuales', () => {
    const { inp, shoot, pad, knob } = touchRig(); inp.assign.set('touch', 0);
    fire(pad, 'pointerdown', { pointerId: 1, clientX: 95, clientY: 50 }); fire(shoot, 'pointerdown', { pointerId: 2 });
    fire(events, 'blur'); expect(inp.merged()).toBe(0); expect(knob.style.transform).toBe(''); expect(shoot.classList.contains('on')).toBe(false);
    expect(inp.assign.get('touch')).toBe(0); expect(pad.captures.size).toBe(0); expect(shoot.captures.size).toBe(0);
    fire(pad, 'pointermove', { pointerId: 1, clientX: 95, clientY: 50 }); expect(inp.merged()).toBe(0);
  });
  it('ocultar la pestaña también descarta controles pendientes', () => {
    const { inp, jump } = touchRig(); fire(jump, 'pointerdown', { pointerId: 3 }); doc.hidden = true; fire(doc, 'visibilitychange');
    expect(inp.merged()).toBe(0);
  });
});
