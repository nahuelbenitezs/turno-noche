// Online con host autoritativo: quien crea la sala corre la simulación; los demás mandan botones y reciben fotos del estado.
import type { GameState } from '../sim/sim';
import { ENEMIES, WEAPONS } from '../sim/data';
import { LEVELS } from '../sim/levels';
import { MISSION_RECORDS } from '../sim/records';

export interface Link { send(data: unknown): void; close(): void; onData?: (d: any) => void; onClose?: () => void; readonly connected?: boolean; readonly latencyMs?: number | null }
export type Msg = { t: 'hello'; slot: number } | { t: 'full' } | { t: 'input'; i: number } | { t: 'snap'; s: Snapshot };
export type Snapshot = Omit<GameState, never>;
export interface RoomOptions { iceServers?: RTCIceServer[] }

const BUTTON_MASK = 0x3ff; // Incluye granada (512), sin permitir bits ajenos al juego.
export function validInput(value: unknown): value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > 0x403ff) return false;
  return (value >>> 16) <= 4 && (value & 0xffff) <= BUTTON_MASK;
}

const round = (k: string, v: unknown) => (typeof v === 'number' && !Number.isInteger(v) ? Math.round(v * 10) / 10 : v);
/** Foto compacta: redondea números y deja afuera lo que el invitado no necesita. */
export function encodeSnapshot(s: GameState): string { return JSON.stringify(s, round); }
const record = (value: unknown): value is Record<string, any> => value !== null && typeof value === 'object' && !Array.isArray(value);
const numbers = (value: Record<string, any>, keys: string[]) => keys.every(key => typeof value[key] === 'number' && Number.isFinite(value[key]));
const body = (value: unknown): value is Record<string, any> => record(value) && numbers(value, ['id', 'z', 'x', 'y', 'w', 'h', 'vx', 'vy']);
const character = (value: unknown) => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < 4;
const natural = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const bossAttack = (value: unknown) => record(value)
  && ['charge', 'slam', 'sweep', 'salvo', 'signal', 'reinforcements'].includes(value.kind)
  && ['charge', 'slam', 'sweep', 'mortar', 'fan', 'pulse', 'ring', 'swarm'].includes(value.pattern)
  && typeof value.label === 'string' && numbers(value, ['x', 'w', 'z', 'depth', 'tell', 'duration', 'elapsed', 'dir', 'power', 'originX'])
  && value.w > 0 && value.depth > 0 && value.tell > 0 && value.duration > 0 && value.elapsed >= 0;
/** Nunca entrega un estado a medio validar: una foto dañada no reemplaza la partida. */
export function decodeSnapshot(json: string): GameState {
  if (json.length > 1000000) throw new Error('Estado de sala demasiado grande.');
  const value: unknown = JSON.parse(json);
  if (!record(value) || !['select', 'story', 'play', 'clear', 'gameover', 'ending'].includes(value.phase)
    || !Number.isInteger(value.levelIdx) || value.levelIdx < 0 || value.levelIdx >= LEVELS.length
    || typeof value.replay !== 'boolean' || !record(value.mission) || !natural(value.mission.records)
    || value.mission.records >= 2 ** MISSION_RECORDS[value.levelIdx].positions.length || !natural(value.mission.ticks) || !natural(value.mission.falls)
    || !numbers(value, ['tick', 'phaseT', 'line', 'camX', 'score', 'lives', 'shake', 'slow', 'combo', 'comboT', 'frenzy', 'frenzyCharge'])
    || !record(value.stats) || !numbers(value.stats, ['kills', 'deaths', 'rescued', 'bestCombo', 'ticks'])
    || !Array.isArray(value.players) || value.players.length !== 4
    || !value.players.every((p: unknown, slot: number) => body(p) && p.slot === slot && character(p.char) && character(p.cursor)
      && typeof p.joined === 'boolean' && typeof p.ready === 'boolean' && typeof p.connected === 'boolean'
      && typeof p.weapon === 'string' && Object.hasOwn(WEAPONS, p.weapon)
      && numbers(p, ['hp', 'maxHp', 'meter', 'grenades', 'ammo', 'face', 'iframes', 'flash', 'downT', 'dashT', 'meleeT', 'specialT', 'dashX', 'dashZ', 'counterT', 'meleeBuffer']) && p.maxHp > 0)
    || !Array.isArray(value.enemies) || !value.enemies.every((e: unknown) => body(e) && typeof e.type === 'string' && Object.hasOwn(ENEMIES, e.type) && numbers(e, ['hp', 'maxHp', 'face', 't', 'st', 'cd', 'stun', 'flash']) && (e.attack === undefined || bossAttack(e.attack)))
    || !Array.isArray(value.bullets) || !value.bullets.every((b: unknown) => record(b) && numbers(b, ['id', 'z', 'x', 'y', 'vx', 'vy', 'life', 'dmg', 'r']) && typeof b.kind === 'string' && Array.isArray(b.hits))
    || !Array.isArray(value.props) || !value.props.every((p: unknown) => body(p) && ['crate', 'barrel', 'prisoner', 'vehicle'].includes(p.kind) && numbers(p, ['hp', 'freed']))
    || !Array.isArray(value.pickups) || !value.pickups.every((p: unknown) => body(p) && numbers(p, ['life'])
      && (p.drop === 'record' ? natural(p.record) && p.record < MISSION_RECORDS[value.levelIdx].positions.length : p.drop === 'food' || Object.hasOwn(WEAPONS, p.drop)))
    || !Array.isArray(value.events) || !value.events.every((e: unknown) => record(e) && typeof e.k === 'string' && numbers(e, ['x', 'y']) && (e.a === undefined || Number.isFinite(e.a)) && (e.s === undefined || typeof e.s === 'string'))) {
    throw new Error('Estado de sala inválido.');
  }
  return value as GameState;
}

/** Lado del host: reparte lugares y guarda el último botón de cada invitado. */
export class HostSession {
  links = new Map<number, Link>(); inputs: (number | null)[] = [null, null, null, null]; private tapped = [0, 0, 0, 0]; private picked = [0, 0, 0, 0]; private seen = [0, 0, 0, 0];
  onDrop?: (slot: number) => void;
  static clock = () => performance.now();
  constructor(public freeSlots: () => number[]) {}
  /** Botones de cada lugar desde la última lectura: un toque corto no se pierde aunque lleguen varios mensajes juntos. */
  take(slot: number) {
    if (!Number.isInteger(slot) || slot < 0 || slot > 3) return null;
    const i = this.inputs[slot]; if (i === null) return null;
    const v = (i & BUTTON_MASK) | this.tapped[slot] | this.picked[slot];
    this.tapped[slot] = 0; this.picked[slot] = 0; return v;
  }
  /** Libera a quien dejó de mandar datos, porque cerrar una pestaña no siempre avisa. */
  reap(now: number, timeout = 8000) { for (const [slot, l] of this.links) if (now - this.seen[slot] > timeout) { this.drop(slot); l.close(); } }
  private drop(slot: number) { if (!this.links.delete(slot)) return; this.inputs[slot] = null; this.tapped[slot] = 0; this.picked[slot] = 0; this.onDrop?.(slot); }
  add(link: Link, now = HostSession.clock()) {
    for (const [slot, existing] of this.links) if (existing === link) return slot;
    const slot = this.freeSlots().find(x => Number.isInteger(x) && x >= 1 && x <= 3 && !this.links.has(x));
    if (slot === undefined) { link.send({ t: 'full' } satisfies Msg); setTimeout(() => link.close(), 200); return -1; }
    this.links.set(slot, link); this.inputs[slot] = 0; this.seen[slot] = now;
    link.onData = (m: Msg) => {
      if (this.links.get(slot) !== link || m?.t !== 'input' || !validInput(m.i)) return;
      this.inputs[slot] = m.i & BUTTON_MASK; this.tapped[slot] |= m.i & BUTTON_MASK;
      // Dos selecciones no deben combinarse: pick(0) | pick(1) sería otra carta.
      if (m.i >>> 16) this.picked[slot] = m.i & 0x70000;
      this.seen[slot] = HostSession.clock();
    };
    link.onClose = () => { if (this.links.get(slot) === link) this.drop(slot); };
    if (this.links.get(slot) !== link) return -1;
    link.send({ t: 'hello', slot } satisfies Msg);
    return slot;
  }
  broadcast(s: GameState) { if (!this.links.size) return; const json = encodeSnapshot(s); for (const l of this.links.values()) l.send(json); }
  close() { for (const [slot, link] of [...this.links]) { this.drop(slot); link.close(); } }
}

export const roomPrefix = 'turno-noche-v3-';
export function makeRoomCode(rand = Math.random) { const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; let c = ''; for (let i = 0; i < 5; i++) c += a[Math.floor(rand() * a.length)]; return c; }
export const normalizeCode = (c: string) => c.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5);

// Conexión real con WebRTC. PeerJS se carga recién al usar el online para no pesar en la partida local.
async function peerLib() { return (await import('peerjs')).default; }
interface DataChannel {
  open: boolean; bufferSize?: number;
  send(data: unknown): void; close(): void;
  on(event: string, callback: (...args: any[]) => void): unknown;
}
/** Cola inicial para hello/estado y medición de ida y vuelta, también en móviles. */
export function wrapLink(conn: DataChannel, clock = () => performance.now()): Link {
  let onData: Link['onData'], onClose: Link['onClose'], closed = false, deliveredClose = false;
  let pingAt: number | null = null, latencyMs: number | null = null;
  const queued: unknown[] = [];
  let heartbeat: ReturnType<typeof setInterval>;
  const notifyClose = () => { if (closed && onClose && !deliveredClose) { deliveredClose = true; onClose(); } };
  const end = () => { if (!closed) { closed = true; queued.length = 0; clearInterval(heartbeat); } notifyClose(); };
  const send = (data: unknown) => {
    if (closed || !conn.open) return;
    // Evita acumular estados atrasados; controles y ping siguen pasando.
    if (typeof data === 'string' && (conn.bufferSize ?? 0) > 2) return;
    try { conn.send(data); } catch { end(); conn.close(); }
  };
  const link: Link = {
    send, close() { end(); conn.close(); },
    get connected() { return !closed && conn.open; },
    get latencyMs() { return latencyMs; },
    get onData() { return onData; },
    set onData(callback) { onData = callback; while (onData && queued.length && !closed) onData(queued.shift()); },
    get onClose() { return onClose; },
    set onClose(callback) { onClose = callback; notifyClose(); },
  };
  conn.on('data', (data: any) => {
    if (closed) return;
    if (data?.t === 'ping' && Number.isFinite(data.ts)) { send({ t: 'pong', ts: data.ts }); return; }
    if (data?.t === 'pong') {
      if (pingAt !== null && data.ts === pingAt) {
        const sample = Math.max(0, clock() - pingAt);
        latencyMs = Math.round(latencyMs === null ? sample : latencyMs * .7 + sample * .3); pingAt = null;
      }
      return;
    }
    if (onData) onData(data);
    else {
      if (typeof data === 'string') { const old = queued.findIndex(x => typeof x === 'string'); if (old >= 0) queued.splice(old, 1); }
      if (queued.length >= 32) { end(); conn.close(); return; }
      queued.push(data);
    }
  });
  conn.on('close', end); conn.on('error', () => { end(); conn.close(); });
  heartbeat = setInterval(() => { pingAt = clock(); send({ t: 'ping', ts: pingAt }); }, 2000);
  return link;
}
// Se pueden proporcionar servidores propios. Sin configuración usa STUN/TURN públicos de PeerJS.
const peerOptions = (options: RoomOptions) => options.iceServers ? { config: { iceServers: options.iceServers } } : {};
export async function hostRoom(onLink: (l: Link) => void, options: RoomOptions = {}): Promise<{ code: string; close: () => void }> {
  const Peer = await peerLib();
  for (let attempt = 0; ; attempt++) {
    const code = makeRoomCode();
    const peer = new Peer(roomPrefix + code, peerOptions(options));
    try {
      await new Promise<void>((ok, bad) => {
        let opened = false;
        const timeout = setTimeout(() => { peer.destroy(); bad(new Error('Tiempo agotado')); }, 12000);
        peer.on('open', () => { opened = true; clearTimeout(timeout); ok(); });
        peer.on('error', e => { if (!opened) { clearTimeout(timeout); bad(e); } });
        peer.on('connection', c => c.on('open', () => onLink(wrapLink(c))));
      });
      peer.on('disconnected', () => { if (!peer.destroyed) peer.reconnect(); });
      return { code, close: () => peer.destroy() };
    } catch (e) { peer.destroy(); if (attempt >= 2 || (e as { type?: string }).type !== 'unavailable-id') throw e; }
  }
}
export async function joinRoom(code: string, options: RoomOptions = {}): Promise<{ link: Link; close: () => void }> {
  const normalized = normalizeCode(code); if (normalized.length !== 5) throw new Error('El código tiene 5 letras.');
  const Peer = await peerLib();
  return new Promise((ok, bad) => {
    const peer = new Peer(peerOptions(options)); let connected = false, failed = false, link: Link | null = null;
    const fail = (message: string) => { if (failed) return; failed = true; clearTimeout(t); link?.close(); peer.destroy(); if (!connected) bad(new Error(message)); };
    const t = setTimeout(() => fail('No se pudo conectar. Revisá el código o probá otra red.'), 15000);
    peer.on('error', () => fail('No se encontró la sala o la red bloquea la conexión.'));
    peer.on('open', () => {
      const c = peer.connect(roomPrefix + normalized, { reliable: true, serialization: 'json' });
      link = wrapLink(c);
      c.on('open', () => { connected = true; clearTimeout(t); ok({ link: link!, close: () => { link?.close(); peer.destroy(); } }); });
      c.on('close', () => { if (!connected) fail('La sala se cerró antes de entrar.'); });
      c.on('error', () => { if (!connected) fail('No se pudo establecer la conexión con la sala.'); });
    });
  });
}
