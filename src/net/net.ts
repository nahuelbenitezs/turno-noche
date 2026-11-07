// Online con host autoritativo: quien crea la sala corre la simulación; los demás mandan botones y reciben fotos del estado.
import type { GameState } from '../sim/sim';

export interface Link { send(data: unknown): void; close(): void; onData?: (d: any) => void; onClose?: () => void }
export type Msg = { t: 'hello'; slot: number } | { t: 'full' } | { t: 'input'; i: number } | { t: 'snap'; s: Snapshot };
export type Snapshot = Omit<GameState, never>;

const round = (k: string, v: unknown) => (typeof v === 'number' && !Number.isInteger(v) ? Math.round(v * 10) / 10 : v);
/** Foto compacta: redondea números y deja afuera lo que el invitado no necesita. */
export function encodeSnapshot(s: GameState): string { return JSON.stringify(s, round); }
export function decodeSnapshot(json: string): GameState { return JSON.parse(json); }

/** Lado del host: reparte lugares y guarda el último botón de cada invitado. */
export class HostSession {
  links = new Map<number, Link>(); inputs: (number | null)[] = [null, null, null, null];
  constructor(public freeSlots: () => number[]) {}
  add(link: Link) {
    const slot = this.freeSlots().find(x => !this.links.has(x));
    if (slot === undefined) { link.send({ t: 'full' } satisfies Msg); setTimeout(() => link.close(), 200); return -1; }
    this.links.set(slot, link); this.inputs[slot] = 0;
    link.onData = (m: Msg) => { if (m?.t === 'input' && Number.isInteger(m.i)) this.inputs[slot] = m.i; };
    link.onClose = () => { this.links.delete(slot); this.inputs[slot] = null; };
    link.send({ t: 'hello', slot } satisfies Msg);
    return slot;
  }
  broadcast(s: GameState) { if (!this.links.size) return; const json = encodeSnapshot(s); for (const l of this.links.values()) l.send(json); }
}

export const roomPrefix = 'turno-noche-v1-';
export function makeRoomCode(rand = Math.random) { const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; let c = ''; for (let i = 0; i < 5; i++) c += a[Math.floor(rand() * a.length)]; return c; }
export const normalizeCode = (c: string) => c.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5);

// Conexión real con WebRTC. PeerJS se carga recién al usar el online para no pesar en la partida local.
async function peerLib() { return (await import('peerjs')).default; }
function wrap(conn: any): Link {
  const l: Link = { send: d => { if (conn.open) conn.send(d); }, close: () => conn.close() };
  conn.on('data', (d: any) => l.onData?.(d)); conn.on('close', () => l.onClose?.()); conn.on('error', () => l.onClose?.());
  return l;
}
export async function hostRoom(onLink: (l: Link) => void): Promise<{ code: string; close: () => void }> {
  const Peer = await peerLib();
  for (let attempt = 0; ; attempt++) {
    const code = makeRoomCode();
    try {
      const peer = await new Promise<any>((ok, bad) => { const p = new Peer(roomPrefix + code); p.on('open', () => ok(p)); p.on('error', bad); setTimeout(() => bad(new Error('Tiempo agotado')), 12000); });
      peer.on('connection', (c: any) => c.on('open', () => onLink(wrap(c))));
      return { code, close: () => peer.destroy() };
    } catch (e) { if (attempt >= 2) throw e; }
  }
}
export async function joinRoom(code: string): Promise<{ link: Link; close: () => void }> {
  const Peer = await peerLib();
  return new Promise((ok, bad) => {
    const peer = new Peer();
    const t = setTimeout(() => { peer.destroy(); bad(new Error('No se pudo conectar con esa sala.')); }, 15000);
    peer.on('error', () => { clearTimeout(t); peer.destroy(); bad(new Error('No se encontró la sala o la red bloquea la conexión.')); });
    peer.on('open', () => {
      const c = peer.connect(roomPrefix + normalizeCode(code), { reliable: false, serialization: 'json' });
      c.on('open', () => { clearTimeout(t); ok({ link: wrap(c), close: () => peer.destroy() }); });
    });
  });
}
