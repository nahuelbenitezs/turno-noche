import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HostSession, Link, decodeSnapshot, encodeSnapshot, hostRoom, joinRoom, makeRoomCode, normalizeCode, validInput, wrapLink } from '../src/net/net';
import { createGame, loadLevel, step } from '../src/sim/sim';
import { BTN, pickBits } from '../src/sim/data';

const fake = () => { const sent: any[] = []; const l: Link = { send: d => sent.push(d), close() {} }; return { l, sent }; };
const peerMocks = vi.hoisted(() => ({ peers: [] as any[], nextChannel: null as any }));
vi.mock('peerjs', () => ({ default: class {
  handlers = new Map<string, ((...args: any[]) => void)[]>();
  args: any[]; destroyed = false;
  constructor(...args: any[]) { this.args = args; peerMocks.peers.push(this); }
  on(event: string, callback: (...args: any[]) => void) { this.handlers.set(event, [...(this.handlers.get(event) ?? []), callback]); }
  emit(event: string, data?: unknown) { for (const fn of this.handlers.get(event) ?? []) fn(data); }
  destroy = vi.fn(() => { this.destroyed = true; });
  reconnect = vi.fn();
  connect = vi.fn(() => peerMocks.nextChannel);
} }));
beforeEach(() => { peerMocks.peers = []; peerMocks.nextChannel = null; });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
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
  it('rechaza fotos JSON incompletas antes de que reemplacen el estado del invitado', () => {
    for (const json of ['null', '{}', '[]', '{"phase":"play"}']) expect(() => decodeSnapshot(json)).toThrow();
    const malformed = [
      (s: any) => { s.players[0].char = 4; },
      (s: any) => { s.players[1].weapon = 'arma-inexistente'; },
      (s: any) => { s.players.pop(); },
      (s: any) => { s.levelIdx = 99; },
      (s: any) => { s.events = null; },
      (s: any) => { s.events.push({ k: 'text', x: 20, y: 20, s: {} }); },
      (s: any) => { s.camX = null; },
    ];
    for (const corrupt of malformed) { const s = createGame(); corrupt(s); expect(() => decodeSnapshot(JSON.stringify(s))).toThrow(); }
    expect(() => decodeSnapshot(' '.repeat(1000001))).toThrow();
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
  it('un toque corto se conserva hasta que el host lo lee, y solo una vez', () => {
    const h = new HostSession(() => [1]); const a = fake(); h.add(a.l, 0);
    a.l.onData!({ t: 'input', i: BTN.J }); a.l.onData!({ t: 'input', i: 0 });
    expect(h.take(1)).toBe(BTN.J); expect(h.take(1)).toBe(0);
  });
  it('libera el lugar de quien dejó de mandar datos', () => {
    const h = new HostSession(() => [1]); const a = fake(); h.add(a.l, 0);
    h.reap(5000); expect(h.links.has(1)).toBe(true);
    h.reap(9000); expect(h.links.has(1)).toBe(false); expect(h.take(1)).toBe(null);
  });
  it('los códigos de sala son de 5 letras y se normalizan', () => {
    expect(makeRoomCode()).toMatch(/^[A-Z]{5}$/); expect(normalizeCode(' ab-cde9f')).toBe('ABCDE');
  });
  it('reserva anfitrión 0 y admite solamente tres invitados en plazas válidas', () => {
    const h = new HostSession(() => [-1, 0, 1.5, 1, 2, 3, 4]);
    const links = [fake(), fake(), fake(), fake()];
    expect(links.map(({ l }) => h.add(l))).toEqual([1, 2, 3, -1]);
    expect(h.links.size).toBe(3); expect(h.inputs[0]).toBe(null);
    h.close(); expect(h.links.size).toBe(0);
  });
  it('solo acepta botones conocidos y las cuatro cartas posibles', () => {
    const h = new HostSession(() => [1]); const { l } = fake(); h.add(l);
    const invalid = [NaN, Infinity, -1, .5, '32', null, undefined, 1024, 32768, pickBits(4), 2 ** 40];
    for (const i of invalid) { expect(validInput(i)).toBe(false); l.onData!({ t: 'input', i }); expect(h.inputs[1]).toBe(0); }
    l.onData!({ t: 'input', i: 512 | BTN.S | pickBits(3) });
    expect(h.take(1)).toBe(512 | BTN.S | pickBits(3));
    expect(h.take(1)).toBe(512 | BTN.S);
  });
  it('conserva la última carta sin combinar dos selecciones entre ticks', () => {
    const h = new HostSession(() => [1]); const { l } = fake(); h.add(l);
    l.onData!({ t: 'input', i: pickBits(0) });
    l.onData!({ t: 'input', i: pickBits(1) });
    l.onData!({ t: 'input', i: 0 });
    expect(h.take(1)).toBe(pickBits(1)); expect(h.take(1)).toBe(0);
  });
  it('un canal viejo no modifica ni desconecta al invitado que reutiliza su plaza', () => {
    const h = new HostSession(() => [1]); const a = fake(), b = fake(); h.add(a.l, 0);
    const dropped: number[] = []; h.onDrop = slot => dropped.push(slot);
    h.reap(9000); expect(dropped).toEqual([1]); h.add(b.l, 9001);
    a.l.onData!({ t: 'input', i: BTN.S }); a.l.onClose!();
    expect(h.links.get(1)).toBe(b.l); expect(h.take(1)).toBe(0);
    expect(h.add(b.l)).toBe(1); expect(h.links.size).toBe(1);
  });
  it('el timeout parte de la hora de conexión real', () => {
    vi.spyOn(HostSession, 'clock').mockReturnValue(20000);
    const h = new HostSession(() => [1]); h.add(fake().l);
    h.reap(20001); expect(h.links.size).toBe(1);
    h.reap(28001); expect(h.links.size).toBe(0);
  });
});

function channel() {
  const handlers = new Map<string, ((...args: any[]) => void)[]>();
  const sent: unknown[] = [];
  const conn = {
    open: true, bufferSize: 0,
    send: vi.fn((d: unknown) => { sent.push(d); }),
    close: vi.fn(() => { conn.open = false; emit('close'); }),
    on(event: string, fn: (...args: any[]) => void) { handlers.set(event, [...(handlers.get(event) ?? []), fn]); },
  };
  const emit = (event: string, data?: unknown) => { for (const fn of handlers.get(event) ?? []) fn(data); };
  return { conn, sent, emit };
}

describe('canal WebRTC', () => {
  it('entrega hello y el estado más reciente aunque lleguen antes del callback de la UI', () => {
    vi.useFakeTimers(); const c = channel(); const link = wrapLink(c.conn);
    c.emit('data', { t: 'hello', slot: 2 }); c.emit('data', 'estado viejo'); c.emit('data', 'estado nuevo');
    const received: unknown[] = []; link.onData = d => received.push(d);
    expect(received).toEqual([{ t: 'hello', slot: 2 }, 'estado nuevo']);
    c.emit('data', 'siguiente'); expect(received.at(-1)).toBe('siguiente'); link.close();
  });
  it('notifica un cierre temprano una vez y elimina el latido', () => {
    vi.useFakeTimers(); const c = channel(); const link = wrapLink(c.conn);
    c.emit('close'); const closed = vi.fn(); link.onClose = closed;
    c.emit('close'); c.emit('error'); link.close();
    vi.advanceTimersByTime(10000);
    expect(closed).toHaveBeenCalledTimes(1); expect(c.sent).toEqual([]); expect(link.connected).toBe(false);
  });
  it('mide RTT sin mezclar ping/pong con inputs o estados', () => {
    vi.useFakeTimers(); let now = 100; const c = channel(); const link = wrapLink(c.conn, () => now);
    const data = vi.fn(); link.onData = data;
    vi.advanceTimersByTime(2000); expect(c.sent[0]).toEqual({ t: 'ping', ts: 100 });
    now = 162; c.emit('data', { t: 'pong', ts: 100 }); expect(link.latencyMs).toBe(62);
    c.emit('data', { t: 'ping', ts: 7 }); expect(c.sent.at(-1)).toEqual({ t: 'pong', ts: 7 });
    expect(data).not.toHaveBeenCalled(); link.close();
  });
  it('descarta estados nuevos con cola saturada y conserva controles', () => {
    vi.useFakeTimers(); const c = channel(); const link = wrapLink(c.conn); c.conn.bufferSize = 3;
    link.send('snapshot'); link.send({ t: 'input', i: BTN.S });
    expect(c.sent).toEqual([{ t: 'input', i: BTN.S }]); link.close();
  });
  it('un error al enviar cierra el canal sin romper el bucle del juego', () => {
    vi.useFakeTimers(); const c = channel(); const link = wrapLink(c.conn); const closed = vi.fn(); link.onClose = closed;
    c.conn.send.mockImplementation(() => { throw new Error('red caída'); });
    expect(() => link.send('snapshot')).not.toThrow(); expect(closed).toHaveBeenCalledTimes(1); expect(link.connected).toBe(false);
  });
});

describe('ciclo de conexión PeerJS', () => {
  it('crear sala limpia su timeout al abrir y destruye el peer al salir', async () => {
    vi.useFakeTimers(); const pending = hostRoom(() => {});
    await vi.dynamicImportSettled(); const peer = peerMocks.peers[0]; peer.emit('open');
    const room = await pending; expect(room.code).toHaveLength(5);
    await vi.advanceTimersByTimeAsync(20000); expect(peer.destroy).not.toHaveBeenCalled();
    peer.emit('disconnected'); expect(peer.reconnect).toHaveBeenCalledOnce();
    room.close(); expect(peer.destroy).toHaveBeenCalledOnce();
  });
  it('crear sala destruye el peer si no llega a abrir', async () => {
    vi.useFakeTimers(); const outcome = hostRoom(() => {}).catch(error => error);
    await vi.dynamicImportSettled(); const peer = peerMocks.peers[0];
    await vi.advanceTimersByTimeAsync(12000);
    expect(await outcome).toBeInstanceOf(Error); expect(peer.destroyed).toBe(true); expect(peerMocks.peers).toHaveLength(1);
  });
  it('un error de señalización no crea tres peers fallidos', async () => {
    vi.useFakeTimers(); const outcome = hostRoom(() => {}).catch(error => error);
    await vi.dynamicImportSettled(); const peer = peerMocks.peers[0];
    peer.emit('error', { type: 'network' }); await outcome;
    expect(peer.destroyed).toBe(true); expect(peerMocks.peers).toHaveLength(1); expect(vi.getTimerCount()).toBe(0);
  });
  it('el invitado usa canal fiable y recibe hello enviado antes de resolver joinRoom', async () => {
    vi.useFakeTimers(); const c = channel(); c.conn.open = false; peerMocks.nextChannel = c.conn;
    const pending = joinRoom('abcde', { iceServers: [{ urls: 'stun:example.test:3478' }] });
    await vi.dynamicImportSettled(); const peer = peerMocks.peers[0]; peer.emit('open');
    expect(peer.connect).toHaveBeenCalledWith(expect.stringContaining('ABCDE'), { reliable: true, serialization: 'json' });
    expect(peer.args[0]).toEqual({ config: { iceServers: [{ urls: 'stun:example.test:3478' }] } });
    c.emit('data', { t: 'hello', slot: 3 }); c.conn.open = true; c.emit('open');
    const joined = await pending; const got: unknown[] = []; joined.link.onData = data => got.push(data);
    expect(got).toEqual([{ t: 'hello', slot: 3 }]); joined.close(); expect(peer.destroyed).toBe(true); expect(vi.getTimerCount()).toBe(0);
  });
  it('el invitado cancela todo si vence el tiempo de conexión', async () => {
    vi.useFakeTimers(); const c = channel(); c.conn.open = false; peerMocks.nextChannel = c.conn;
    const outcome = joinRoom('ABCDE').catch(error => error);
    await vi.dynamicImportSettled(); const peer = peerMocks.peers[0]; peer.emit('open');
    await vi.advanceTimersByTimeAsync(15000); expect(await outcome).toBeInstanceOf(Error);
    expect(peer.destroyed).toBe(true); expect(c.conn.close).toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
});
