// Jugador automático: recorre la historia para los tests y sirve para demostrar el juego con ?bot=1.
import { BTN, CHARS, W, isBoss } from './data';
import { DEPTH, GameState, Player, bossAttackBounds, surfaceAt } from './sim';
import { LEVELS, hazardZone } from './levels';

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
    const dx = t.x - p.x;
    if (dir === 0) i |= dx > 0 ? BTN.R : BTN.L;
    const dzz = t.z - p.z; if (dzz > 8) i |= BTN.D; else if (dzz < -8) i |= BTN.U;
    if (Math.abs(dx) < CHARS[p.char].meleeRange && s.tick % 16 < 2) i |= BTN.M;
    if (push && Math.abs(dx) < 120 && s.tick % 16 < 2) i |= BTN.M;
    if (push && p.ground && s.tick % 40 < 2) i |= BTN.J;
    i |= BTN.S;
  } else {
    const supply = s.pickups.find(k => Math.abs(k.x - p.x) < 220 && Math.abs(k.y - p.y) < 60);
    const prop = s.props.find(o => o.kind !== 'vehicle' && !o.freed && o.x - p.x < 300 && o.x > p.x);
    const target = downed ?? supply ?? prop;
    if (target) { const dz = target.z - p.z; if (dz > 7) i |= BTN.D; else if (dz < -7) i |= BTN.U; }
    if (prop) i |= BTN.S;
  }
  if (p.meter >= 100 && (foes.length > 2 || (t && isBoss(t.type) && CHARS[p.char].id !== 'yoli'))) i |= BTN.X;
  if (t && p.grenades > 0 && p.grenadeCd === 0 && Math.abs(t.x - p.x) > 140 && Math.abs(t.x - p.x) < 420 && s.tick % 90 < 2) i |= BTN.G;
  if (s.bullets.some(b => b.side === 1 && Math.abs(b.z - p.z) < 25 && Math.abs(b.x - p.x) < 75) && p.dashCd === 0 && s.tick % 5 === 0) i |= BTN.DASH;
  for (const h of lv.hazards) {
    const phase = (s.tick + h.offset) % h.period;
    if (p.x < h.x - 55 || p.x > h.x + h.w + 55 || (phase >= h.on && phase < h.period - h.warn)) continue;
    const zone = hazardZone(h, s.tick);
    i = leaveLane(i, p.z, zone.z, zone.depth / 2);
  }
  const attack = s.enemies.find(e => e.id === s.bossId)?.attack;
  if (attack && attack.elapsed >= attack.tell * .35 && (attack.kind === 'charge' || attack.kind === 'sweep' || attack.kind === 'slam' || attack.pattern === 'pulse' || attack.pattern === 'mortar')) {
    const bounds = bossAttackBounds(attack);
    if (p.x > bounds.x - 20 && p.x < bounds.x + bounds.w + 20) i = leaveLane(i, p.z, bounds.z, bounds.depth);
  }
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

function leaveLane(input: number, z: number, center: number, radius: number) {
  if (Math.abs(z - center) >= radius + 8) return input;
  const upperExit = center - radius > 8;
  const lowerExit = center + radius < DEPTH - 8;
  const goUp = upperExit && (!lowerExit || z < center);
  return (input & ~(BTN.U | BTN.D)) | (goUp ? BTN.U : BTN.D);
}
