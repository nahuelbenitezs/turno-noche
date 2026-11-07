// Jugador automático: recorre la historia para los tests y sirve para demostrar el juego con ?bot=1.
import { BTN, CHARS, W } from './data';
import { GameState, Player, surfaceAt } from './sim';
import { LEVELS } from './levels';

export function botInput(s: GameState, slot: number): number {
  const p = s.players[slot];
  if (s.phase !== 'play') return (s.tick + slot * 3) % 16 < 4 ? BTN.J : 0;
  if (!p.joined || p.down || p.out) return 0;
  return playInput(s, p);
}
function playInput(s: GameState, p: Player): number {
  const lv = LEVELS[s.levelIdx]; let i = 0;
  const foes = s.enemies.filter(e => e.hp > 0 && e.x > s.camX - 20 && e.x < s.camX + W + 20);
  let t = foes[0]; for (const e of foes) if (Math.abs(e.x - p.x) < Math.abs(t.x - p.x)) t = e;
  const downed = s.players.find(o => o.joined && o.down && !o.out && Math.abs(o.x - p.x) < 300);
  let dir = 1;
  if (downed) dir = Math.sign(downed.x - p.x) || 0;
  else if (t) { const dx = t.x - p.x; dir = Math.abs(dx) > 340 ? Math.sign(dx) : Math.abs(dx) < 170 && s.tick % 90 < 25 ? -Math.sign(dx) : 0; }
  else { const k = s.pickups.find(k => Math.abs(k.x - p.x) > 10 && Math.abs(k.x - p.x) < 220 && Math.abs(k.y - p.y) < 60); if (k) dir = Math.sign(k.x - p.x); }
  // Cada tanto se pone agresivo: se acerca y salta, así nunca queda trabado frente a un escudo o una cornisa.
  const push = s.tick % 1500 > 1050;
  if (push && t) dir = Math.sign(t.x - p.x);
  if (p.x < s.camX + 70) dir = 1;
  if (dir > 0) i |= BTN.R; if (dir < 0) i |= BTN.L;
  if (t) {
    const dy = t.y - t.h / 2 - (p.y - 30), dx = t.x - p.x;
    if (dir === 0) i |= dx > 0 ? BTN.R : BTN.L;
    void dy; const dzz = t.z - p.z; if (dzz > 8) i |= BTN.D; else if (dzz < -8) i |= BTN.U;
    if (Math.abs(dx) < CHARS[p.char].meleeRange && s.tick % 16 < 2) i |= BTN.M;
    if (push && Math.abs(dx) < 120 && s.tick % 16 < 2) i |= BTN.M;
    if (push && p.ground && s.tick % 40 < 2) i |= BTN.J;
    i |= BTN.S;
  } else if (s.props.some(o => o.kind !== 'vehicle' && o.x - p.x < 300 && o.x > p.x)) i |= BTN.S;
  if (p.meter >= 100 && foes.length > 2 && CHARS[p.char].id !== 'yoli') i |= BTN.X;
  // Saltar huecos, paredes y balas bajas
  const look = p.x + dir * 44;
  if (dir && p.ground) {
    const here = surfaceAt(lv, look, p.y - 130);
    if (here === null || here < p.y - 8) { if (s.tick % 2) i |= BTN.J; }
  }
  if (!p.ground && p.vy < 0) i |= BTN.J;
  if (s.bullets.some(b => b.side === 1 && b.kind === 'wave' && Math.abs(b.x - p.x) < 130 && Math.abs(b.y - p.y) < 50) && p.ground && s.tick % 2) i |= BTN.J;
  return i;
}
