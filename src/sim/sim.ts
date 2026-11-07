// Simulación pura y determinista a 60 Hz. El estado es JSON serializable: sirve igual para jugar local,
// para mandarlo por red y para probarlo sin navegador.
import { BANTER, BTN, CHARS, ENDING, ENEMIES, EnemyType, H, PICKUP_WEAPONS, STORY, W, WEAPONS, WeaponId, isBoss, pickOf } from './data';
import { Arena, LEVELS, Level, Rect } from './levels';

export const GRAV = 0.62, MAXFALL = 13, DEPTH = 130;
/** Carril de profundidad del efecto o disparo que se está creando. */
let shotZ = 60;
export interface Body { id: number; z: number; x: number; y: number; w: number; h: number; vx: number; vy: number; ground: boolean }
export interface Player extends Body {
  slot: number; joined: boolean; ready: boolean; cursor: number; char: number; face: number;
  hp: number; maxHp: number; iframes: number; down: boolean; downT: number; out: boolean; revive: number;
  weapon: WeaponId; ammo: number; shootCd: number; ax: number; ay: number; shooting: number;
  meleeT: number; meleeStep: number; meleeWin: number; swing: number; dive: boolean;
  dashT: number; dashCd: number; jumpsLeft: number; coyote: number; jbuf: number; crouch: boolean; dropT: number;
  buf: number; meter: number; specialT: number; vehicle: number; prev: number; flash: number; kills: number; connected: boolean;
}
export interface Enemy extends Body { type: EnemyType; hp: number; maxHp: number; face: number; t: number; st: number; cd: number; stun: number; flash: number; arena: boolean; swings: number[]; n: number; dying?: number }
export interface Bullet { id: number; z: number; x: number; y: number; vx: number; vy: number; dmg: number; life: number; kind: string; side: 0 | 1; owner: number; pierce: boolean; grav: number; r: number; hits: number[] }
export interface Prop extends Body { kind: 'crate' | 'barrel' | 'prisoner' | 'vehicle'; hp: number; drop?: WeaponId | 'food'; freed: number }
export interface Pickup extends Body { drop: WeaponId | 'food'; life: number }
export interface Ev { k: string; x: number; y: number; a?: number; s?: string }
export type Phase = 'select' | 'story' | 'play' | 'clear' | 'gameover' | 'ending';
export interface GameState {
  tick: number; phase: Phase; phaseT: number; levelIdx: number; line: number; players: Player[]; enemies: Enemy[]; bullets: Bullet[]; props: Prop[]; pickups: Pickup[];
  camX: number; camLock: number; arenaIdx: number; wave: number; arenaOn: boolean; spawnIdx: number; bossId: number; clearT: number; lastHit: number; atBoss: boolean; bossKeep: number;
  lives: number; score: number; combo: number; comboT: number; hitstop: number; shake: number; slow: number; seed: number; nextId: number; events: Ev[];
  stats: { kills: number; deaths: number; rescued: number; bestCombo: number; ticks: number };
}
function newPlayer(slot: number): Player {
  return { id: slot + 1, z: 30 + slot * 25, slot, joined: false, ready: false, cursor: slot, char: slot, face: 1, x: 0, y: 0, w: 28, h: 56, vx: 0, vy: 0, ground: false, hp: 100, maxHp: 100, iframes: 0, down: false, downT: 0, out: false, revive: 0, weapon: 'pistola', ammo: 0, shootCd: 0, ax: 1, ay: 0, shooting: 0, meleeT: 0, meleeStep: 0, meleeWin: 0, swing: 0, dive: false, dashT: 0, dashCd: 0, jumpsLeft: 0, coyote: 0, jbuf: 0, crouch: false, dropT: 0, buf: 0, meter: 50, specialT: 0, vehicle: 0, prev: 0, flash: 0, kills: 0, connected: false };
}
export function createGame(seed = 12345): GameState {
  return { tick: 0, phase: 'select', phaseT: 0, levelIdx: 0, line: 0, players: [0, 1, 2, 3].map(newPlayer), enemies: [], bullets: [], props: [], pickups: [], camX: 0, camLock: 1e9, arenaIdx: 0, wave: 0, arenaOn: false, spawnIdx: 0, bossId: 0, clearT: 0, lastHit: 0, atBoss: false, bossKeep: 0, lives: 3, score: 0, combo: 0, comboT: 0, hitstop: 0, shake: 0, slow: 0, seed: seed >>> 0 || 1, nextId: 10, events: [], stats: { kills: 0, deaths: 0, rescued: 0, bestCombo: 0, ticks: 0 } };
}
export function rnd(s: GameState) { let x = s.seed; x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; s.seed = x; return x / 4294967296; }
const emit = (s: GameState, k: string, x: number, y: number, a?: number, str?: string) => { s.events.push({ k, x, y: k === 'text' ? y : y + shotZ - 80, a, s: str }); };
export const active = (s: GameState) => s.players.filter(p => p.joined);
const living = (s: GameState) => s.players.filter(p => p.joined && !p.down && !p.out);
export const teamScale = (s: GameState) => { const n = Math.max(1, active(s).length); return 1 + 0.45 * (n - 1); };
const level = (s: GameState): Level => LEVELS[s.levelIdx];
const overlap = (a: Body, b: Body) => Math.abs(a.z - b.z) < 24 + Math.max(a.w, b.w) / 5 && Math.abs(a.x - b.x) * 2 < a.w + b.w && a.y - a.h < b.y && b.y - b.h < a.y;

// ---------- Física ----------
export function moveBody(b: Body, lv: Level, dropping = false) {
  b.x += b.vx;
  const top0 = b.y - b.h;
  for (const r of lv.solids) if (b.x + b.w / 2 > r.x && b.x - b.w / 2 < r.x + r.w && b.y > r.y && top0 < r.y + r.h) {
    if (b.vx > 0) b.x = r.x - b.w / 2; else if (b.vx < 0) b.x = r.x + r.w + b.w / 2;
    b.vx = 0;
  }
  const prevY = b.y; b.y += b.vy; b.ground = false;
  for (const r of lv.solids) if (b.x + b.w / 2 > r.x && b.x - b.w / 2 < r.x + r.w && b.y > r.y && b.y - b.h < r.y + r.h) {
    if (b.vy >= 0) { b.y = r.y; b.ground = true; } else { b.y = r.y + r.h + b.h; }
    b.vy = 0;
  }
  if (b.vy >= 0 && !dropping) for (const r of lv.plats) if (b.x + b.w / 2 > r.x && b.x - b.w / 2 < r.x + r.w && prevY <= r.y + .01 && b.y >= r.y) { b.y = r.y; b.vy = 0; b.ground = true; }
}
export function surfaceAt(lv: Level, x: number, fromY = -1e6): number | null {
  let best: number | null = null;
  for (const r of [...lv.solids, ...lv.plats]) if (x >= r.x && x <= r.x + r.w && r.y >= fromY && (best === null || r.y < best)) best = r.y;
  return best;
}
const solidAt = (lv: Level, x: number, y: number) => lv.solids.some(r => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);

// ---------- Fases ----------
function spawnPlayerAt(s: GameState, p: Player, x: number) {
  const lv = level(s);
  let sx = x;
  for (let d = 0; d < W; d += 20) { if (surfaceAt(lv, x + d) !== null) { sx = x + d; break; } if (surfaceAt(lv, x - d) !== null) { sx = x - d; break; } }
  p.x = sx + 10; p.y = Math.max(40, (surfaceAt(lv, sx + 10) ?? 460) - 160); p.vx = 0; p.vy = 0; p.down = false; p.out = false; p.hp = p.maxHp; p.iframes = 120; p.revive = 0; p.vehicle = 0; p.h = 56; p.w = 28; p.specialT = 0; p.dashT = 0;
}
function setupPlayerChar(p: Player) {
  const c = CHARS[p.char]; p.maxHp = c.hp; p.hp = c.hp; p.weapon = c.weapon; p.ammo = 0;
}
/** Al continuar se vuelve directo al jefe: nadie repite un nivel entero por perder con él. */
function jumpToBoss(s: GameState) {
  const lv = level(s); s.arenaIdx = lv.arenas.length - 1; const a = lv.arenas[s.arenaIdx]; s.camX = a.x - 1; s.atBoss = true; s.spawnIdx = lv.spawns.findIndex(d => d.x > a.x + W + 80); if (s.spawnIdx < 0) s.spawnIdx = lv.spawns.length;
  active(s).forEach((p, i) => { spawnPlayerAt(s, p, a.x + 120 + i * 55); p.iframes = 120; });
}
export function loadLevel(s: GameState, idx: number) {
  s.atBoss = false;
  s.levelIdx = idx; s.enemies = []; s.bullets = []; s.props = []; s.pickups = []; s.camX = 0; s.camLock = 1e9; s.arenaIdx = 0; s.wave = 0; s.arenaOn = false; s.spawnIdx = 0; s.bossId = 0; s.clearT = 0; s.hitstop = 0; s.slow = 0; s.comboT = 0; s.combo = 0;
  active(s).forEach((p, i) => { spawnPlayerAt(s, p, 120 + i * 55); p.face = 1; p.iframes = 90; });
}
function setPhase(s: GameState, ph: Phase) { s.phase = ph; s.phaseT = 0; s.line = 0; emit(s, 'phase', 0, 0, 0, ph); }
function confirmPressed(s: GameState, inputs: (number | null)[]) {
  let any = false;
  for (const p of s.players) { const i = inputs[p.slot]; if (i != null && (i & (BTN.J | BTN.S)) && !(p.prev & (BTN.J | BTN.S))) any = true; }
  return any;
}
function latch(s: GameState, inputs: (number | null)[]) { for (const p of s.players) p.prev = inputs[p.slot] ?? 0; }

export function step(s: GameState, inputs: (number | null)[]) {
  s.tick++; s.phaseT++;
  for (const p of s.players) p.connected = inputs[p.slot] != null;
  switch (s.phase) {
    case 'select': stepSelect(s, inputs); break;
    case 'story': {
      const lines = STORY[s.levelIdx];
      if (s.phaseT > 12 && confirmPressed(s, inputs)) { s.line++; s.phaseT = 0; emit(s, 'ui', 0, 0); }
      if (s.line >= lines.length) { loadLevel(s, s.levelIdx); setPhase(s, 'play'); emit(s, 'levelstart', 0, 0); }
      break;
    }
    case 'play': stepPlay(s, inputs); break;
    case 'clear':
      if (s.phaseT > 45 && confirmPressed(s, inputs)) {
        if (s.levelIdx + 1 >= LEVELS.length) { setPhase(s, 'ending'); emit(s, 'victory', 0, 0); }
        else { s.levelIdx++; s.lives++; s.bossKeep = 0; setPhase(s, 'story'); }
      }
      break;
    case 'gameover':
      if (s.phaseT > 45 && confirmPressed(s, inputs)) { s.lives = 3; s.score = Math.floor(s.score / 2); const boss = s.enemies.find(e => e.id === s.bossId); if (boss) s.bossKeep = boss.hp; const again = s.atBoss; loadLevel(s, s.levelIdx); if (again) jumpToBoss(s); setPhase(s, 'play'); emit(s, 'levelstart', 0, 0); }
      break;
    case 'ending':
      if (s.phaseT > 12 && confirmPressed(s, inputs)) {
        s.line++; s.phaseT = 0;
        if (s.line > ENDING.length) { const seed = s.seed; const fresh = createGame(seed); fresh.events = s.events; Object.assign(s, fresh); }
      }
      break;
  }
  latch(s, inputs);
}
function stepSelect(s: GameState, inputs: (number | null)[]) {
  for (const p of s.players) {
    const i = inputs[p.slot];
    if (i == null) { p.joined = false; p.ready = false; continue; }
    const press = (b: number) => (i & b) && !(p.prev & b);
    if (!p.joined) { p.joined = true; p.ready = false; const used = s.players.filter(o => o.joined && o !== p).map(o => o.cursor); let c = p.slot; while (used.includes(c) && used.length < 4) c = (c + 1) % 4; p.cursor = c; emit(s, 'ui', 0, 0); }
    const pick = pickOf(i);
    if (pick >= 0 && !p.ready) { p.cursor = pick; p.ready = true; emit(s, 'confirm', 0, 0); continue; }
    if (!p.ready) {
      if (press(BTN.L)) { p.cursor = (p.cursor + 3) % 4; emit(s, 'ui', 0, 0); }
      if (press(BTN.R)) { p.cursor = (p.cursor + 1) % 4; emit(s, 'ui', 0, 0); }
      if (press(BTN.J) || press(BTN.S)) { p.ready = true; emit(s, 'confirm', 0, 0); }
    } else if (press(BTN.M)) { p.ready = false; emit(s, 'ui', 0, 0); }
  }
  const js = active(s);
  if (js.length && js.every(p => p.ready)) {
    if (s.clearT++ > 50) {
      s.clearT = 0;
      for (const p of js) { p.char = p.cursor; setupPlayerChar(p); p.meter = 50; p.kills = 0; }
      s.lives = 2 + js.length; s.score = 0; s.levelIdx = 0; setPhase(s, 'story');
    }
  } else s.clearT = 0;
}

// ---------- Juego ----------
function stepPlay(s: GameState, inputs: (number | null)[]) {
  s.stats.ticks++;
  if (s.shake > 0) s.shake *= .86;
  // Lo que se aprieta durante una pausa de impacto se guarda: ningún toque se pierde.
  const hold = () => { for (const p of s.players) { const i = inputs[p.slot] ?? 0; p.buf |= i & ~p.prev; } };
  if (s.hitstop > 0) { s.hitstop--; hold(); return; }
  if (s.slow > 0) { s.slow--; if (s.slow % 3) { hold(); return; } }
  const lv = level(s);
  for (const p of s.players) {
    if (!p.joined && inputs[p.slot] != null) { p.joined = true; const c = [0, 1, 2, 3].find(c => !s.players.some(o => o.joined && o !== p && o.char === c)) ?? 0; p.char = c; setupPlayerChar(p); p.meter = 50; spawnPlayerAt(s, p, s.camX + 200); }
    if (p.joined) stepPlayer(s, p, inputs[p.slot] ?? 0, lv);
  }
  updateCamera(s, lv);
  runSpawns(s, lv);
  runArena(s, lv);
  for (const e of s.enemies) stepEnemy(s, e, lv);
  stepBullets(s, lv);
  stepProps(s, lv);
  stepPickups(s, lv);
  s.enemies = s.enemies.filter(e => e.hp > 0 && e.x > s.camX - 500);
  if (s.comboT > 0 && --s.comboT === 0) s.combo = 0;
  // Fin de nivel y fin de partida
  if (s.clearT > 0 && --s.clearT === 0) { setPhase(s, 'clear'); return; }
  const a = active(s);
  if (a.length && a.every(p => p.out) && s.clearT === 0) setPhase(s, 'gameover');
}
function updateCamera(s: GameState, lv: Level) {
  const ps = living(s);
  if (lv.autoScroll && s.camX < s.camLock) s.camX += lv.autoScroll;
  else if (ps.length) {
    const avg = ps.reduce((a, p) => a + p.x, 0) / ps.length;
    const lead = Math.max(...ps.map(p => p.x));
    const target = Math.min(avg + 90, lead - 200) - W / 2 + 200 - 90 + 90;
    if (target > s.camX) s.camX += Math.min(9, (target - s.camX) * .12);
  }
  s.camX = Math.min(s.camX, lv.width - W, s.camLock);
}
function runSpawns(s: GameState, lv: Level) {
  while (s.spawnIdx < lv.spawns.length && lv.spawns[s.spawnIdx].x < s.camX + W + 80) {
    const d = lv.spawns[s.spawnIdx++];
    const y = d.y ?? surfaceAt(lv, d.x) ?? 460;
    if (d.k === 'e') spawnEnemy(s, d.type, d.x, y, false);
    else if (d.k === 'pickup') dropPickup(s, d.x, y - 10, d.drop);
    else {
      const sz = d.k === 'vehicle' ? [80, 60] : d.k === 'prisoner' ? [28, 50] : d.k === 'barrel' ? [30, 42] : [40, 40];
      s.props.push({ id: s.nextId++, z: 20 + rnd(s) * 90, x: d.x, y, w: sz[0], h: sz[1], vx: 0, vy: 0, ground: true, kind: d.k, hp: d.k === 'crate' ? 12 : d.k === 'barrel' ? 8 : d.k === 'vehicle' ? 120 : 1, drop: d.k === 'prisoner' ? d.drop : undefined, freed: 0 });
    }
  }
}
function spawnEnemy(s: GameState, type: EnemyType, x: number, y: number, arena: boolean) {
  const d = ENEMIES[type]; const hp = Math.round(d.hp * teamScale(s) * (isBoss(type) ? 1 : 1 + s.levelIdx * .08));
  const e: Enemy = { id: s.nextId++, z: isBoss(type) ? 60 : rnd(s) * DEPTH, type, x, y, w: d.w, h: d.h, vx: 0, vy: 0, ground: false, hp, maxHp: hp, face: -1, t: Math.floor(rnd(s) * 60), st: 0, cd: 60 + Math.floor(rnd(s) * 60), stun: 0, flash: 0, arena, swings: [0, 0, 0, 0], n: 0 };
  s.enemies.push(e); return e;
}
function runArena(s: GameState, lv: Level) {
  const a: Arena | undefined = lv.arenas[s.arenaIdx];
  if (!a) return;
  if (!s.arenaOn) { if (s.camX >= a.x - (lv.autoScroll ? 0 : 200)) { s.camLock = a.x; } if (s.camX >= a.x - 2) { s.arenaOn = true; s.wave = 0; s.camX = a.x; spawnWave(s, a); if (a.boss) { s.atBoss = true; emit(s, 'bosswarn', 0, 0); } else emit(s, 'text', W / 2, 200, 0, '¡No pasa nadie!'); } return; }
  if (s.clearT > 0 || s.enemies.some(e => e.arena && e.hp > 0)) return;
  s.wave++;
  if (s.wave < a.waves.length) spawnWave(s, a);
  else if (a.boss && !s.bossId) {
    const d = ENEMIES[a.boss]; const b = spawnEnemy(s, a.boss, s.camX + W - 150, d.fly ? 260 : 460, true); s.bossId = b.id; if (s.bossKeep > 0) b.hp = Math.min(b.hp, s.bossKeep); if (a.boss === 'colmena') b.y = (surfaceAt(lv, b.x) ?? 460); emit(s, 'boss', b.x, b.y, 0, d.name);
    s.hitstop = 0; s.shake = 12;
  } else if (!a.boss) { s.arenaOn = false; s.arenaIdx++; s.camLock = 1e9; emit(s, 'text', W / 2, 180, 0, '¡Sigan, sigan!'); }
}
function spawnWave(s: GameState, a: Arena) {
  a.waves[s.wave]?.forEach((w, i) => {
    const x = w.side > 0 ? s.camX + W + 30 + i * 36 : s.camX - 30 - i * 36;
    spawnEnemy(s, w.type, x, w.y ?? 300, true);
  });
  if (a.waves.length === 0 && !a.boss) s.wave = 0;
}

function stepPlayer(s: GameState, p: Player, inp: number, lv: Level) {
  const c = CHARS[p.char]; shotZ = p.z;
  const buf = p.buf; p.buf = 0;
  const has = (b: number) => !!(inp & b); const press = (b: number) => (!!(inp & b) && !(p.prev & b)) || !!(buf & b);
  if (p.flash > 0) p.flash--; if (p.iframes > 0) p.iframes--; if (p.shootCd > 0) p.shootCd--; if (p.dashCd > 0) p.dashCd--; if (p.meleeWin > 0) p.meleeWin--; if (p.dropT > 0) p.dropT--; if (p.shooting > 0) p.shooting--;
  if (p.out) return;
  if (p.down) {
    p.vx = 0; p.vy = Math.min(p.vy + GRAV, MAXFALL); moveBody(p, lv);
    if (p.y > H + 100) { p.y = 300; p.x = s.camX + 200; const x = s.camX + 200; const y = surfaceAt(lv, x); if (y !== null) p.y = y; }
    const helper = living(s).find(o => Math.abs(o.x - p.x) < 60 && Math.abs(o.y - p.y) < 80 && Math.abs(o.z - p.z) < 50);
    if (helper) { if (++p.revive > 70) { p.down = false; p.hp = Math.round(p.maxHp * .5); p.iframes = 120; p.revive = 0; emit(s, 'revive', p.x, p.y - 30); emit(s, 'text', p.x - s.camX, p.y - 80, 0, '¡Arriba!'); } }
    else p.revive = 0;
    if (p.down && --p.downT <= 0) {
      if (s.lives > 0) { s.lives--; spawnPlayerAt(s, p, s.camX + W * .3); p.meter = Math.max(p.meter, 50); emit(s, 'respawn', p.x, p.y); }
      else { p.out = true; p.down = false; }
    }
    return;
  }
  // Puntería en 8 direcciones
  const dirx = (has(BTN.R) ? 1 : 0) - (has(BTN.L) ? 1 : 0);
  if (dirx) p.face = dirx;
  p.crouch = false;
  // Arriba y abajo mueven por la profundidad del escenario.
  const dirz = (has(BTN.D) ? 1 : 0) - (has(BTN.U) ? 1 : 0);
  if (p.specialT === 0 && !(p.meleeT > 0 && p.ground)) p.z = Math.max(0, Math.min(DEPTH, p.z + dirz * (p.vehicle ? 3 : c.speed * .68)));
  p.ax = p.face; p.ay = 0;
  p.h = p.vehicle ? 66 : p.crouch ? 38 : 56; p.w = p.vehicle ? 70 : 28;

  // Especial en curso (la moto de Yoli)
  if (p.specialT > 0) {
    p.specialT--; p.vx = p.face * 13; p.vy = 0; p.iframes = Math.max(p.iframes, 2); moveBody(p, lv);
    for (const e of s.enemies) if (overlap(p, e) && e.swings[p.slot] !== p.specialT + 1000 * p.swing && e.flash === 0) { damageEnemy(s, e, 30, p.face * 6, -5, p, true); }
    if (s.tick % 2 === 0) emit(s, 'dust', p.x, p.y);
    clampPlayer(s, p, lv); return;
  }
  // Movimiento con aceleración: reacciona enseguida y derrapa un poco al frenar.
  const sp = p.vehicle ? 4.2 : c.speed; const accel = p.ground ? .9 : .55; const friction = p.ground ? .72 : .92;
  if (p.dashT > 0) { p.dashT--; p.vx = p.face * 11; p.vy = Math.min(p.vy, 1); p.iframes = Math.max(p.iframes, 1); if (s.tick % 3 === 0) emit(s, 'dust', p.x, p.y); }
  else if (p.crouch) p.vx *= friction;
  else if (dirx && !(p.meleeT > 0 && p.ground)) { p.vx += dirx * accel; if (Math.abs(p.vx) > sp) p.vx = Math.sign(p.vx) * sp; }
  else p.vx *= friction;
  if (press(BTN.DASH) && p.dashCd === 0 && !p.vehicle) { p.dashT = 10; p.dashCd = c.id === 'yoli' ? 20 : 42; p.meleeT = 0; emit(s, 'dash', p.x, p.y); }

  // Salto con margen: "coyote time", buffer y altura variable.
  if (p.ground) { p.coyote = 7; p.jumpsLeft = c.jumps - 1; } else if (p.coyote > 0) p.coyote--;
  if (press(BTN.J)) p.jbuf = 7; else if (p.jbuf > 0) p.jbuf--;
  if (p.jbuf > 0) {
    if (has(BTN.D) && p.ground && !p.vehicle && lv.plats.some(r => p.x > r.x && p.x < r.x + r.w && Math.abs(r.y - p.y) < 1)) { p.dropT = 14; p.jbuf = 0; p.y += 1; }
    else if (has(BTN.D) && p.vehicle) { ejectVehicle(s, p, false); p.jbuf = 0; }
    else if (p.coyote > 0) { p.vy = -c.jump * (p.vehicle ? .9 : 1); p.coyote = 0; p.jbuf = 0; p.ground = false; emit(s, 'jump', p.x, p.y); }
    else if (p.jumpsLeft > 0 && !p.vehicle) { p.jumpsLeft--; p.vy = -c.jump * .92; p.jbuf = 0; emit(s, 'jump2', p.x, p.y); }
  }
  if (!has(BTN.J) && p.vy < -4) p.vy += GRAV * 1.1;
  const g = p.vy > 0 ? GRAV * 1.15 : GRAV;
  if (p.dashT === 0) p.vy = Math.min(p.vy + g, MAXFALL);
  const wasGround = p.ground, vyBefore = p.vy;
  moveBody(p, lv, p.dropT > 0 || has(BTN.D) && p.dive);
  if (p.ground && !wasGround && vyBefore > 6) { emit(s, 'land', p.x, p.y, vyBefore); }
  if (p.dive && p.ground) { p.dive = false; p.meleeT = 0; explode(s, p.x, p.y - 10, 70, c.meleeDmg, 0, p.slot, true); s.shake = Math.max(s.shake, 5); }

  // Disparo
  if (has(BTN.S) && p.shootCd === 0 && p.meleeT === 0) fire(s, p);
  // Cuerpo a cuerpo: combo de tres golpes y picada en el aire.
  if (p.meleeT > 0) {
    p.meleeT--;
    const active_ = p.dive || (p.meleeT <= 11 && p.meleeT >= 5);
    if (active_) meleeHit(s, p, c.meleeDmg * (p.meleeStep === 2 ? 1.6 : 1), c.meleeRange);
  }
  if (press(BTN.M) && p.meleeT <= 3 && !p.vehicle) {
    if (!p.ground) { p.dive = true; p.vy = 12; p.vx *= .3; p.meleeT = 99; p.meleeStep = 1; p.swing++; emit(s, 'melee', p.x, p.y, 2); }
    else { p.meleeStep = p.meleeWin > 0 ? (p.meleeStep + 1) % 3 : 0; p.meleeT = p.meleeStep === 2 ? 18 : 14; p.meleeWin = 30; p.swing++; if (p.ground) p.vx = p.face * (p.meleeStep === 2 ? 7 : 4); emit(s, 'melee', p.x, p.y, p.meleeStep); }
  }
  // Especial
  if (press(BTN.X) && p.meter >= 100 && !p.vehicle) doSpecial(s, p);
  // Subirse a un vehículo
  if (press(BTN.M) && !p.vehicle) { const v = s.props.find(o => o.kind === 'vehicle' && overlap(o, p)); if (v) { p.vehicle = v.hp; v.hp = 0; emit(s, 'vehicle', p.x, p.y); emit(s, 'text', p.x - s.camX, p.y - 90, 0, '¡A la zorra blindada!'); } }
  clampPlayer(s, p, lv);
}
function clampPlayer(s: GameState, p: Player, lv: Level) {
  const minX = s.camX + p.w / 2 + 4, maxX = s.camX + W - p.w / 2 - 4;
  if (p.x < minX) { p.x = minX; if (p.vx < 0) p.vx = 0; }
  if (p.x > maxX) { p.x = maxX; if (p.vx > 0) p.vx = 0; }
  if (p.y > H + 80) { // Cayó al vacío
    hurtPlayer(s, p, 25, true);
    if (!p.down) { const hp = p.hp, weapon = p.weapon, ammo = p.ammo, veh = p.vehicle; spawnPlayerAt(s, p, s.camX + W * .35); p.hp = hp; p.weapon = weapon; p.ammo = ammo; p.vehicle = veh; p.h = veh ? 66 : 56; p.w = veh ? 70 : 28; }
    else { spawnPlayerAt(s, p, s.camX + W * .35); p.hp = 0; p.down = true; p.iframes = 0; }
  }
}
function fire(s: GameState, p: Player) {
  const id: WeaponId = p.vehicle ? 'canon' : p.weapon; const w = WEAPONS[id];
  p.shootCd = w.cd; p.shooting = 10;
  const a0 = Math.atan2(p.ay, p.ax); const mx = p.x + p.ax * (p.vehicle ? 44 : 26), my = p.y - p.h * .62 + p.ay * 22;
  for (let i = 0; i < w.count; i++) {
    const a = a0 + (w.count > 1 ? (i - (w.count - 1) / 2) * w.spread : (rnd(s) - .5) * w.spread * 2);
    const v = w.speed * (w.count > 1 ? .9 + rnd(s) * .2 : 1);
    s.bullets.push({ z: shotZ, id: s.nextId++, x: mx, y: my, vx: Math.cos(a) * v, vy: Math.sin(a) * v, dmg: w.dmg, life: w.life, kind: w.kind, side: 0, owner: p.slot, pierce: !!w.pierce, grav: 0, r: w.kind === 'cohete' ? 9 : w.kind === 'fuego' ? 14 : 6, hits: [] });
  }
  if (w.recoil && p.ground) p.vx -= p.ax * w.recoil;
  s.shake = Math.max(s.shake, w.shake);
  emit(s, 'shot', mx, my, Math.atan2(p.ay, p.ax), w.kind);
  if (w.ammo && !p.vehicle) { p.ammo--; if (p.ammo <= 0) { p.weapon = CHARS[p.char].weapon; p.ammo = 0; emit(s, 'empty', p.x, p.y); } }
}
function meleeHit(s: GameState, p: Player, dmg: number, range: number) {
  const box: Body = p.dive ? { id: 0, z: p.z, x: p.x, y: p.y + 14, w: 56, h: 60, vx: 0, vy: 0, ground: false } : { id: 0, z: p.z, x: p.x + p.face * range / 2, y: p.y + 4, w: range + 12, h: 70, vx: 0, vy: 0, ground: false };
  for (const e of s.enemies) if (e.hp > 0 && overlap(box, e) && e.swings[p.slot] !== p.swing) {
    e.swings[p.slot] = p.swing;
    const launch = p.meleeStep === 2;
    damageEnemy(s, e, dmg, p.face * (launch ? 9 : 4), launch ? -8 : -2.5, p, true);
    s.hitstop = Math.max(s.hitstop, launch ? 6 : 3); s.shake = Math.max(s.shake, launch ? 7 : 3);
    p.meter = Math.min(100, p.meter + 4);
    if (p.dive) { p.dive = false; p.meleeT = 0; p.vy = -10; p.jumpsLeft = CHARS[p.char].jumps - 1; }
  }
  // Devolver balas enemigas a golpes: da especial y se siente bárbaro.
  for (const b of s.bullets) if (b.side === 1 && b.kind !== 'wave' && Math.abs(b.z - box.z) < 34 && Math.abs(b.x - box.x) < box.w / 2 + b.r && b.y > box.y - box.h && b.y < box.y) {
    b.side = 0; b.owner = p.slot; b.vx = p.face * Math.max(9, Math.abs(b.vx) * 1.6); b.vy = -Math.abs(b.vy) * .1; b.dmg = 20; b.life = 60; b.grav = 0;
    p.meter = Math.min(100, p.meter + 6); s.hitstop = Math.max(s.hitstop, 2); emit(s, 'parry', b.x, b.y);
  }
  for (const o of s.props) if (o.hp > 0 && o.kind !== 'vehicle' && overlap(box, o)) damageProp(s, o, 99, p.slot);
}
function doSpecial(s: GameState, p: Player) {
  const c = CHARS[p.char]; p.meter = 0; p.iframes = Math.max(p.iframes, 60); s.hitstop = 8; s.shake = 14; emit(s, 'special', p.x, p.y, p.char, c.special);
  if (c.id === 'yoli') { p.specialT = 48; p.swing++; for (const e of s.enemies) e.flash = 0; }
  if (c.id === 'tito') {
    explode(s, p.x, p.y - 20, 200, 70, 0, p.slot, true);
    for (const d of [-1, 1]) s.bullets.push({ z: shotZ, id: s.nextId++, x: p.x, y: p.y - 18, vx: d * 9, vy: 0, dmg: 35, life: 60, kind: 'wave', side: 0, owner: p.slot, pierce: true, grav: 0, r: 24, hits: [] });
  }
  if (c.id === 'mirta') {
    for (const o of active(s)) if (!o.out) { if (o.down) { o.down = false; o.iframes = 120; o.revive = 0; o.hp = 0; } o.hp = Math.min(o.maxHp, o.hp + o.maxHp * .6); emit(s, 'revive', o.x, o.y - 30); }
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; s.bullets.push({ z: shotZ, id: s.nextId++, x: p.x, y: p.y - 30, vx: Math.cos(a) * 8, vy: Math.sin(a) * 8, dmg: 18, life: 90, kind: 'jeringa', side: 0, owner: p.slot, pierce: false, grav: 0, r: 6, hits: [] }); }
  }
  if (c.id === 'beto') {
    s.bullets = s.bullets.filter(b => b.side === 0);
    for (const e of s.enemies) if (e.x > s.camX - 40 && e.x < s.camX + W + 40) { e.stun = isBoss(e.type) ? 50 : 200; damageEnemy(s, e, 18, 0, 0, p, true); }
  }
}
export function hurtPlayer(s: GameState, p: Player, dmg: number, force = false) {
  if (p.down || p.out || (!force && p.iframes > 0)) return;
  if (p.vehicle) { p.vehicle -= dmg; p.iframes = 12; p.flash = 8; emit(s, 'clang', p.x, p.y - 30); if (p.vehicle <= 0) ejectVehicle(s, p, true); return; }
  p.hp -= dmg; p.iframes = 60; p.flash = 12; s.shake = Math.max(s.shake, 8); s.hitstop = Math.max(s.hitstop, 3); s.combo = 0; s.comboT = 0;
  emit(s, 'hurt', p.x, p.y - 30);
  if (p.hp <= 0) {
    p.hp = 0; p.down = true; p.dive = false; p.meleeT = 0; p.weapon = CHARS[p.char].weapon; p.ammo = 0; s.stats.deaths++; p.revive = 0;
    p.downT = living(s).length > 0 ? 420 : 70; emit(s, 'down', p.x, p.y - 30);
    p.vy = -7;
  }
}
function ejectVehicle(s: GameState, p: Player, destroyed: boolean) {
  if (destroyed) { explode(s, p.x, p.y - 30, 150, 80, 0, p.slot, true); p.iframes = 90; }
  else s.props.push({ id: s.nextId++, z: p.z, x: p.x, y: p.y, w: 80, h: 60, vx: 0, vy: 0, ground: true, kind: 'vehicle', hp: p.vehicle, freed: 0 });
  p.vehicle = 0; p.vy = -10; p.h = 56; p.w = 28;
}
export function damageEnemy(s: GameState, e: Enemy, dmg: number, kx: number, ky: number, p: Player | null, melee = false) {
  if (e.hp <= 0) return;
  shotZ = e.z; s.lastHit = e.id;
  const boss = isBoss(e.type);
  if (e.stun > 0) dmg *= p && CHARS[p.char].id === 'beto' ? 2 : 1.4;
  dmg = Math.round(dmg); e.hp -= dmg; e.flash = 6;
  if (!boss && e.type !== 'turret') { e.vx += kx; if (ky) { e.vy = ky; } }
  if (p) p.meter = Math.min(100, p.meter + dmg * (boss ? .06 : .18));
  emit(s, melee ? 'mhit' : 'hit', e.x, e.y - e.h / 2, dmg);
  if (e.hp <= 0) killEnemy(s, e, p);
}
function killEnemy(s: GameState, e: Enemy, p: Player | null) {
  e.hp = 0; const d = ENEMIES[e.type]; s.stats.kills++; if (p) p.kills++;
  s.combo++; s.comboT = 170; s.stats.bestCombo = Math.max(s.stats.bestCombo, s.combo);
  s.score += d.score * Math.min(10, 1 + Math.floor(s.combo / 5));
  emit(s, 'die', e.x, e.y - e.h / 2, e.face, e.type);
  if (s.combo % 10 === 0) emit(s, 'text', W / 2, 150, 0, BANTER[Math.floor(rnd(s) * BANTER.length)] + ` x${s.combo}`);
  if (e.type === 'exploder') explode(s, e.x, e.y - 16, 90, 25, 1, -1, false);
  if (isBoss(e.type)) {
    s.slow = 90; s.clearT = 170; s.shake = 24; emit(s, 'bossdie', e.x, e.y - e.h / 2);
    for (const o of s.enemies) if (o !== e && o.hp > 0) { o.hp = 0; emit(s, 'die', o.x, o.y - o.h / 2, 0, o.type); }
    s.bullets = [];
    for (const q of active(s)) if (!q.out) { q.iframes = 400; if (q.down) { q.down = false; q.hp = q.maxHp / 2; } }
  } else if (rnd(s) < .06) dropPickup(s, e.x, e.y - 20, 'food');
}
function dropPickup(s: GameState, x: number, y: number, drop: WeaponId | 'food') { s.pickups.push({ id: s.nextId++, z: shotZ, x, y, w: 30, h: 30, vx: 0, vy: -6, ground: false, drop, life: 900 }); }
function explode(s: GameState, x: number, y: number, r: number, dmg: number, side: 0 | 1, owner: number, big: boolean) {
  emit(s, 'boom', x, y, r); s.shake = Math.max(s.shake, big ? 12 : 8); s.hitstop = Math.max(s.hitstop, big ? 3 : 1);
  const P = owner >= 0 ? s.players[owner] : null; const ez = shotZ;
  if (side === 0) for (const e of s.enemies) { const d = Math.hypot(e.x - x, e.y - e.h / 2 - y, (e.z - ez) * .6); if (d < r + e.w / 2) damageEnemy(s, e, dmg, Math.sign(e.x - x) * 7, -6, P); }
  else for (const p of living(s)) if (Math.hypot(p.x - x, p.y - 28 - y, (p.z - ez) * .6) < r) hurtPlayer(s, p, dmg);
  for (const o of s.props) if (o.hp > 0 && o.kind !== 'vehicle' && Math.hypot(o.x - x, o.y - o.h / 2 - y) < r + 20) damageProp(s, o, 99, owner);
}
function damageProp(s: GameState, o: Prop, dmg: number, owner: number) {
  shotZ = o.z;
  if (o.kind === 'prisoner') { if (o.freed) return; o.freed = 1; s.stats.rescued++; s.score += 500; emit(s, 'rescue', o.x, o.y - 30); emit(s, 'text', o.x - s.camX, o.y - 80, 0, '¡Gracias, compañero!'); if (o.drop) dropPickup(s, o.x, o.y - 30, o.drop); return; }
  o.hp -= dmg; emit(s, 'hit', o.x, o.y - 20, 1);
  if (o.hp <= 0) {
    o.hp = 0;
    if (o.kind === 'barrel') explode(s, o.x, o.y - 20, 130, 60, 0, owner, true);
    else { emit(s, 'crate', o.x, o.y - 20); const r = rnd(s); dropPickup(s, o.x, o.y - 24, r < .45 ? 'food' : PICKUP_WEAPONS[Math.floor(rnd(s) * PICKUP_WEAPONS.length)]); }
  }
}
function stepProps(s: GameState, lv: Level) {
  for (const o of s.props) {
    if (o.kind === 'prisoner' && o.freed) { o.freed++; o.x += 4; }
    else if (o.kind === 'vehicle') { o.vy = Math.min(o.vy + GRAV, MAXFALL); moveBody(o, lv); }
  }
  s.props = s.props.filter(o => o.hp > 0 && o.freed < 120 && o.x > s.camX - 200);
}
function stepPickups(s: GameState, lv: Level) {
  for (const k of s.pickups) {
    k.life--; k.vy = Math.min(k.vy + GRAV, 8); moveBody(k, lv); if (k.y > H + 60) k.life = 0;
    const p = living(s).find(p => overlap(p, k));
    if (p && k.life > 0) {
      k.life = 0; emit(s, 'pickup', k.x, k.y - 20, 0, k.drop); p.meter = Math.min(100, p.meter + 10); s.score += 100;
      if (k.drop === 'food') { p.hp = Math.min(p.maxHp, p.hp + p.maxHp * .35); emit(s, 'text', p.x - s.camX, p.y - 80, 0, '¡Tortafrita!'); }
      else { p.weapon = k.drop; p.ammo = WEAPONS[k.drop].ammo; emit(s, 'text', p.x - s.camX, p.y - 80, 0, WEAPONS[k.drop].name + '!'); }
    }
  }
  s.pickups = s.pickups.filter(k => k.life > 0 && k.x > s.camX - 100);
}
function stepBullets(s: GameState, lv: Level) {
  for (const b of s.bullets) {
    shotZ = b.z;
    if (b.kind === 'jeringa' && b.side === 0) { // Busca al enemigo más cercano
      let best: Enemy | null = null, bd = 260; for (const e of s.enemies) { const d = Math.hypot(e.x - b.x, e.y - e.h / 2 - b.y); if (d < bd) { bd = d; best = e; } }
      if (best) { const a = Math.atan2(best.y - best.h / 2 - b.y, best.x - b.x); const sp = Math.hypot(b.vx, b.vy) || 9; b.vx += (Math.cos(a) * sp - b.vx) * .14; b.vy += (Math.sin(a) * sp - b.vy) * .14; }
    }
    b.vy += b.grav; b.x += b.vx; b.y += b.vy; b.life--;
    if (b.kind === 'fuego') { b.vx *= .96; b.vy -= .06; }
    if (b.kind !== 'wave' && solidAt(lv, b.x, b.y)) { b.life = 0; if (b.kind === 'cohete' || b.kind === 'granada') explode(s, b.x, b.y - 6, b.kind === 'cohete' ? 100 : 70, b.dmg, b.side, b.owner, false); else emit(s, 'spark', b.x, b.y); continue; }
    if (b.kind === 'wave' && b.side === 1 && s.tick % 3 === 0) emit(s, 'dust', b.x, b.y + 14);
    if (b.x < s.camX - 80 || b.x > s.camX + W + 80 || b.y > H + 60 || b.y < -140) b.life = 0;
    if (b.life <= 0) continue;
    if (b.side === 0) {
      for (const e of s.enemies) {
        if (e.hp <= 0 || b.hits.includes(e.id)) continue;
        if (Math.abs(e.x - b.x) < e.w / 2 + b.r && Math.abs(e.z - b.z) < 26 + e.w / 5) {
          b.hits.push(e.id);
          if (e.type === 'shield' && e.stun === 0 && Math.sign(b.vx) === -e.face && b.kind !== 'cohete' && b.kind !== 'wave') { emit(s, 'clang', b.x, b.y); b.life = 0; break; }
          if (b.kind === 'cohete') { b.life = 0; explode(s, b.x, b.y, 100, b.dmg, 0, b.owner, false); break; }
          damageEnemy(s, e, b.dmg, Math.sign(b.vx) * (b.kind === 'wave' ? 6 : .7), b.kind === 'wave' ? -6 : 0, s.players[b.owner] ?? null);
          if (!b.pierce) { b.life = 0; break; }
        }
      }
      if (b.life > 0) for (const o of s.props) if (o.hp > 0 && o.kind !== 'vehicle' && !o.freed && Math.abs(o.x - b.x) < o.w / 2 + b.r && Math.abs(o.z - b.z) < 34) { damageProp(s, o, b.dmg, b.owner); if (!b.pierce) b.life = 0; break; }
    } else {
      for (const p of living(s)) if (Math.abs(p.z - b.z) < 22 && Math.abs(p.x - b.x) < p.w / 2 + b.r - 2 && b.y > p.y - p.h - b.r + 4 && b.y < p.y + b.r) {
        if (p.iframes > 0) continue;
        if (b.kind === 'granada') { explode(s, b.x, b.y, 70, b.dmg, 1, -1, false); b.life = 0; break; }
        hurtPlayer(s, p, b.dmg); if (!b.pierce) { b.life = 0; emit(s, 'spark', b.x, b.y); } break;
      }
    }
  }
  s.bullets = s.bullets.filter(b => b.life > 0);
}

// ---------- Enemigos ----------
const eshot = (s: GameState, x: number, y: number, a: number, v: number, dmg = 10, kind = 'orbe', grav = 0) => { s.bullets.push({ z: shotZ, id: s.nextId++, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, dmg, life: 300, kind, side: 1, owner: -1, pierce: kind === 'wave', grav, r: kind === 'wave' ? 18 : 7, hits: [] }); };
function nearest(s: GameState, e: Enemy) { let b: Player | null = null, d = 1e9; for (const p of living(s)) { const q = Math.abs(p.x - e.x) + Math.abs(p.y - e.y) * .5; if (q < d) { d = q; b = p; } } return b; }
function stepEnemy(s: GameState, e: Enemy, lv: Level) {
  if (e.hp <= 0) return;
  const d = ENEMIES[e.type]; e.t++; if (e.flash > 0) e.flash--;
  const tgt = nearest(s, e);
  shotZ = e.z;
  const boss = isBoss(e.type);
  if (e.stun > 0) { e.stun--; if (!boss) { e.vx *= .8; if (!d.fly) e.vy = Math.min(e.vy + GRAV, MAXFALL); moveBody(e, lv); if (e.y > H + 100) e.hp = 0; } return; }
  const offscreen = e.x > s.camX + W - 12 || e.x < s.camX + 12;
  if (tgt) {
    const dx = tgt.x - e.x, dist = Math.abs(dx); const aim = Math.atan2(tgt.y - 30 - (e.y - e.h * .6), dx);
    if (!(e.type === 'camion' && e.st === 1) && (e.type !== 'exploder' || e.st === 0)) e.face = dx >= 0 ? 1 : -1;
    if (e.cd > 0) e.cd--;
    if (!boss && e.type !== 'turret') { e.z += Math.max(-1.3, Math.min(1.3, tgt.z - e.z)); shotZ = e.z; }
    if (boss) shotZ = tgt.z; // Los jefes apuntan al carril de su objetivo.
    const walk = (v: number) => { const want = e.face * v; e.vx += (want - e.vx) * .2; const ax = e.x + e.face * (e.w / 2 + 6); if (e.ground && surfaceAt(lv, ax, e.y - 2) === null && !offscreen) e.vx = 0; };
    // Nadie se queda esperando fuera de cámara: entra sí o sí.
    if (offscreen && !d.fly && !boss) { e.face = e.x > s.camX + W / 2 ? -1 : 1; e.vx += (e.face * 2.6 - e.vx) * .2; }
    else switch (e.type) {
      case 'grunt': if (dist > 260 || offscreen) walk(1.6); else e.vx *= .8; if (e.cd === 0 && dist < 620 && !offscreen) { e.n++; e.cd = e.n % 3 ? 16 : 90; eshot(s, e.x + e.face * 18, e.y - 32, aim, 4.6); emit(s, 'eshot', e.x, e.y - 32); } break;
      case 'rusher': if (e.ground && e.cd === 0 && dist < 170 && Math.abs(tgt.y - e.y) < 100) { e.vy = -8; e.vx = e.face * 8; e.cd = 70; emit(s, 'bark', e.x, e.y); } else if (e.ground) walk(3.6); break;
      case 'flyer': { const ty = tgt.y - 110 + Math.sin(e.t * .05) * 30; e.vx += (Math.sign(dx + Math.sin(e.t * .025) * 150) * 2.6 - e.vx) * .05; e.vy = (ty - e.y) * .04; if (e.cd === 0 && dist < 80 && !offscreen) { e.cd = 90; eshot(s, e.x, e.y + 4, Math.PI / 2, 2, 14, 'granada', .22); emit(s, 'eshot', e.x, e.y); } break; }
      case 'shield': if (dist > 90) walk(1.1); else e.vx *= .8; if (e.cd === 0 && dist < 520 && !offscreen) { e.cd = 120; eshot(s, e.x + e.face * 18, e.y - 30, aim, 4); emit(s, 'eshot', e.x, e.y - 30); } break;
      case 'lobber': if (dist > 420) walk(1.3); else e.vx *= .8; if (e.cd === 0 && dist < 640 && !offscreen) { e.cd = 120; const air = 60; eshot(s, e.x, e.y - 40, Math.atan2(-.22 * air / 2 - 0, dx / air) , Math.hypot(dx / air, .22 * air / 2), 14, 'granada', .22); emit(s, 'eshot', e.x, e.y - 40); } break;
      case 'turret': if (e.cd === 0 && dist < 560 && !offscreen) { e.cd = 80; eshot(s, e.x, e.y - 20, aim, 4.4); emit(s, 'eshot', e.x, e.y - 20); } break;
      case 'exploder': walk(4.1); if (dist < 46 && Math.abs(tgt.y - e.y) < 70) { if (++e.st > 18) { e.hp = 1; damageEnemy(s, e, 99, 0, 0, null); } } else if (e.st > 0) e.st++; if (e.st > 40) damageEnemy(s, e, 99, 0, 0, null); break;
      case 'heavy': if (dist > 200) walk(1); else e.vx *= .8; if (e.cd === 0 && !offscreen) { e.n++; e.cd = 110; if (e.n % 2) { for (const o of [-.15, 0, .15]) eshot(s, e.x + e.face * 30, e.y - 54, aim + o, 4.2, 12); } else { eshot(s, e.x + e.face * 30, e.y - 8, e.face > 0 ? 0 : Math.PI, 5.5, 14, 'wave'); } emit(s, 'eshot', e.x, e.y - 40); } break;
      default: stepBoss(s, e, tgt, aim, lv);
    }
    if (d.contact && !offscreen && e.st >= 0) for (const p of living(s)) if (overlap(e, p)) { hurtPlayer(s, p, d.contact); if (p.iframes === 60 && !boss) p.vx += e.face * 5; }
  }
  if (d.fly) { if (e.type === 'turret') { e.vx = 0; e.vy = 0; } else if (!boss) { e.x += e.vx; e.y += e.vy; } }
  else { e.vy = Math.min(e.vy + GRAV, MAXFALL); moveBody(e, lv); if (e.y > H + 100) { e.hp = 0; emit(s, 'die', e.x, H, 0, e.type); } }
}
function bossWave(s: GameState, e: Enemy, lv: Level, dir: number) { const y = (surfaceAt(lv, e.x) ?? 460) - 18; s.bullets.push({ z: shotZ, id: s.nextId++, x: e.x, y, vx: dir * 6, vy: 0, dmg: 14, life: 200, kind: 'wave', side: 1, owner: -1, pierce: true, grav: 0, r: 18, hits: [] }); }
function ring(s: GameState, x: number, y: number, n: number, v: number, off = 0) { for (let i = 0; i < n; i++) eshot(s, x, y, off + i / n * Math.PI * 2, v, 12); }
function stepBoss(s: GameState, e: Enemy, tgt: Player, aim: number, lv: Level) {
  const L = s.camX + e.w / 2 + 20, Rr = s.camX + W - e.w / 2 - 20, cy = e.y - e.h / 2;
  const rage = e.hp < e.maxHp * .5; const fury = e.hp < e.maxHp * .2;
  const next = (st: number) => { e.st = st; e.t = 0; };
  const add = (type: EnemyType, y?: number) => { if (s.enemies.filter(o => o.hp > 0).length < 5 + active(s).length) { const side = rnd(s) < .5; spawnEnemy(s, type, side ? s.camX - 30 : s.camX + W + 30, y ?? 300, false); } };
  switch (e.type) {
    case 'camion':
      if (e.st === 0) { e.vx *= .9; if (e.t === 1) emit(s, 'warn', e.x, cy); if (e.t > (rage ? 40 : 65)) { e.face = e.x > s.camX + W / 2 ? -1 : 1; next(1); } }
      else if (e.st === 1) { e.vx = e.face * (rage ? 11 : 8.5); if (s.tick % 5 === 0) emit(s, 'dust', e.x - e.face * 80, e.y); if ((e.face > 0 && e.x >= Rr) || (e.face < 0 && e.x <= L)) { e.x = Math.max(L, Math.min(Rr, e.x)); e.vx = 0; s.shake = 14; emit(s, 'boom', e.x + e.face * 80, e.y - 30, 60); bossWave(s, e, lv, -e.face); next(2); } }
      else { if (e.t % (rage ? 16 : 24) === 0) { const dx = tgt.x - e.x + (rnd(s) - .5) * 120, air = 55; eshot(s, e.x, e.y - 100, Math.atan2(-.25 * air / 2, dx / air), Math.hypot(dx / air, .25 * air / 2), 14, 'granada', .25); emit(s, 'eshot', e.x, e.y - 100); } if (e.t > 90) { if (rage) add('grunt'); next(0); } }
      break;
    case 'grua':
      if (e.st === 0) { const tx = Math.max(L, Math.min(Rr, tgt.x)); e.x += (tx - e.x) * .035; e.y += (190 - e.y) * .08; if (e.t > (rage ? 60 : 90)) { emit(s, 'warn', e.x, cy); next(1); } }
      else if (e.st === 1) { if (e.t > 22) { e.y += 15; const g = surfaceAt(lv, e.x) ?? 460; if (e.y >= g) { e.y = g; s.shake = 16; emit(s, 'boom', e.x, g - 10, 70); bossWave(s, e, lv, -1); bossWave(s, e, lv, 1); next(2); } } }
      else if (e.st === 2) { if (e.t > 40) { e.y += (190 - e.y) * .09; if (Math.abs(e.y - 190) < 6) next(3); } }
      else { if (e.t % (rage ? 14 : 22) === 0) { const x = s.camX + 80 + rnd(s) * (W - 160); eshot(s, x, -20, Math.PI / 2, 3, 16, 'granada', .2); emit(s, 'eshot', x, 20); } if (e.t === 60 && fury) ring(s, e.x, cy, 12, 3.6); if (e.t > 110) { if (rage) add('flyer', 160); next(0); } }
      break;
    case 'loco': {
      e.y += ((230 + Math.sin(e.t * .03) * 50) - e.y) * .05; const hx = s.camX + W / 2 + Math.sin(s.tick * .012) * 280; e.x += (hx - e.x) * .02;
      e.n++; const per = rage ? 70 : 100;
      if (e.n % per === 0) { for (const o of [-.3, -.15, 0, .15, .3]) eshot(s, e.x, cy, aim + o, 4.2, 12); emit(s, 'eshot', e.x, cy); }
      if (e.n % 260 === 0) { const f = surfaceAt(lv, s.camX + 2) ?? 430; for (const dir of [-1, 1]) s.bullets.push({ z: shotZ, id: s.nextId++, x: dir > 0 ? s.camX : s.camX + W, y: f - 18, vx: dir * 5.5, vy: 0, dmg: 14, life: 200, kind: 'wave', side: 1, owner: -1, pierce: true, grav: 0, r: 18, hits: [] }); emit(s, 'warn', e.x, cy); }
      if (e.n % 420 === 0) { add('flyer', 180); add('rusher'); if (fury) add('exploder'); }
      if (fury && e.n % 90 === 0) ring(s, e.x, cy, 10, 3.5, e.n * .1);
      break; }
    case 'colmena': {
      e.face = -1; e.n++; const top = e.y - e.h + 50; const per = rage ? 80 : 120;
      if (e.n % per === 0) { ring(s, e.x, top, rage ? 14 : 10, 3.2, e.n * .07); emit(s, 'eshot', e.x, top); }
      if (e.n % 200 === 40) { bossWave(s, e, lv, -1); emit(s, 'warn', e.x, e.y - 20); }
      if (e.n % 300 === 150) { add('flyer', 180); add('flyer', 240); if (rage) add('exploder'); }
      if (fury && e.n % 40 === 0) eshot(s, e.x - 40, top + 60, aim, 5);
      break; }
    case 'gerenta': {
      const f = fury ? .55 : rage ? .75 : 1;
      if (e.st === 0) { const tx = s.camX + W * (e.n % 2 ? .25 : .75); e.x += (tx - e.x) * .05; e.y += (220 + Math.sin(e.t * .08) * 30 - e.y) * .06; if (e.t > 70 * f) { e.n++; next(1 + e.n % 4); emit(s, 'warn', e.x, cy); } }
      else if (e.st === 1) { if (e.t % Math.round(14 * f) === 0) { for (const o of [-.35, -.18, 0, .18, .35]) eshot(s, e.x, cy, aim + o, 4.8, 12, 'orbe'); emit(s, 'eshot', e.x, cy); } if (e.t > 55) next(0); }
      else if (e.st === 2) { if (e.t === 25) { ring(s, e.x, cy, 16, 3.4); emit(s, 'eshot', e.x, cy); } if (fury && e.t === 50) ring(s, e.x, cy, 16, 3.4, .2); if (e.t > 70) next(0); }
      else if (e.st === 3) { const g = surfaceAt(lv, e.x) ?? 460; if (e.t < 28) { e.y += (120 - e.y) * .1; e.x += (tgt.x - e.x) * .05; } else { e.y += 17; if (e.y >= g) { e.y = g; s.shake = 15; emit(s, 'boom', e.x, g - 8, 80); bossWave(s, e, lv, -1); bossWave(s, e, lv, 1); next(0); } } }
      else { if (e.t === 20) { add('grunt'); add('flyer', 180); if (rage) add('shield'); if (fury) add('exploder'); s.score += 0; emit(s, 'text', W / 2, 190, 0, '¡Sumen personal!'); } if (e.t > 50) next(0); }
      break; }
  }
  if (e.x < L) e.x = L; if (e.x > Rr) e.x = Rr;
}
