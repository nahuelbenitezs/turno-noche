import { describe, expect, it } from 'vitest';
import { HostSession, Link, decodeSnapshot, encodeSnapshot, makeRoomCode, normalizeCode } from '../src/net/net';
import { createGame, loadLevel, step } from '../src/sim/sim';
import { BTN } from '../src/sim/data';

const fake = () => { const sent: any[] = []; const l: Link = { send: d => sent.push(d), close() {} }; return { l, sent }; };
describe('red', () => {
  it('la foto del estado ida y vuelta conserva el juego y sigue simulando', () => {
    const s = createGame(); step(s, [0, null, null, null]); s.phase = 'play'; loadLevel(s, 0); s.players[0].char = 1;
    for (let i = 0; i < 100; i++) step(s, [BTN.R | BTN.S, null, null, null]);
    const c = decodeSnapshot(encodeSnapshot(s));
    expect(c.players[0].char).toBe(1); expect(Math.abs(c.players[0].x - s.players[0].x)).toBeLessThan(.11);
    step(c, [BTN.R, null, null, null]); expect(c.tick).toBe(s.tick + 1);
  });
  it('la foto entra cómoda en un mensaje de red', () => {
    const s = createGame(); step(s, [0, 0, 0, 0]); s.phase = 'play'; loadLevel(s, 0);
    for (let i = 0; i < 400; i++) step(s, [BTN.R | BTN.S, BTN.R | BTN.S, BTN.R | BTN.S, BTN.R | BTN.S]);
    s.events = []; expect(encodeSnapshot(s).length).toBeLessThan(60000);
  });
  it('asigna lugares, recibe botones, libera al desconectar y rechaza si está llena', () => {
    const h = new HostSession(() => [1, 2]);
    const a = fake(), b = fake(), c = fake();
    expect(h.add(a.l)).toBe(1); expect(h.add(b.l)).toBe(2); expect(h.add(c.l)).toBe(-1);
    expect(a.sent[0]).toEqual({ t: 'hello', slot: 1 }); expect(c.sent[0]).toEqual({ t: 'full' });
    a.l.onData!({ t: 'input', i: 5 }); expect(h.inputs[1]).toBe(5);
    a.l.onData!({ t: 'input', i: 'x' }); expect(h.inputs[1]).toBe(5);
    a.l.onClose!(); expect(h.inputs[1]).toBe(null);
  });
  it('los códigos de sala son de 5 letras y se normalizan', () => {
    expect(makeRoomCode()).toMatch(/^[A-Z]{5}$/); expect(normalizeCode(' ab-cde9f')).toBe('ABCDE');
  });
});
