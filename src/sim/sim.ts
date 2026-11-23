// Simulación pura y determinista a 60 Hz. El estado es JSON serializable: sirve igual para jugar local,
// para mandarlo por red y para probarlo sin navegador.
import { BANTER, BTN, BossType, CHARS, ENDING, ENEMIES, EnemyType, H, PICKUP_WEAPONS, STORY, W, WEAPONS, WeaponId, isBoss, pickOf } from './data';
import { Arena, LEVELS, Level, hazardZone } from './levels';
import { MISSION_RECORDS } from './records';

export const GRAV = 0.62, MAXFALL = 13, DEPTH = 130;
/** Carril de profundidad del efecto o disparo que se está creando. */
let shotZ = 60;
export interface Body { id: number; z: number; x: number; y: number; w: number; h: number; vx: number; vy: number; ground: boolean }
export interface Player extends Body {
  slot: number; joined: boolean; ready: boolean; cursor: number; char: number; face: number;
  hp: number; maxHp: number; iframes: number; down: boolean; downT: number; out: boolean; revive: number;
  weapon: WeaponId; ammo: number; shootCd: number; ax: number; ay: number; shooting: number;
  meleeT: number; meleeStep: number; meleeWin: number; meleeBuffer: number; swing: number; dive: boolean;
  dashT: number; dashCd: number; jumpsLeft: number; coyote: number; jbuf: number; crouch: boolean; dropT: number;
  buf: number; meter: number; specialT: number; vehicle: number; prev: number; flash: number; kills: number; connected: boolean;
  grenades: number; grenadeCd: number; dashX: number; dashZ: number; counterT: number;
}
export type BossAttackKind = 'charge' | 'slam' | 'sweep' | 'salvo' | 'signal' | 'reinforcements';
type BossPattern = 'charge' | 'slam' | 'sweep' | 'mortar' | 'fan' | 'pulse' | 'ring' | 'swarm';
export interface BossAttack {
  kind: BossAttackKind; label: string; x: number; w: number; z: number; depth: number;
  tell: number; duration: number; elapsed: number; dir: number;
  pattern: BossPattern; power: number; originX: number;
}
export interface Enemy extends Body { type: EnemyType; hp: number; maxHp: number; face: number; t: number; st: number; cd: number; stun: number; flash: number; arena: boolean; swings: number[]; n: number; dying?: number; announced?: number; attack?: BossAttack; support?: { slot: number; until: number; readyAt: number } }

export function bossAttackBounds(attack: BossAttack) {
  const minZ = Math.max(0, attack.z - attack.depth / 2), maxZ = Math.min(DEPTH, attack.z + attack.depth / 2);
  return { x: attack.x - attack.w / 2, w: attack.w, z: (minZ + maxZ) / 2, depth: (maxZ - minZ) / 2 };
}

export const bossPhase = (enemy: Enemy) => enemy.hp <= enemy.maxHp * .3 ? 3 : enemy.hp <= enemy.maxHp * .65 ? 2 : 1;
export const bossVulnerable = (enemy: Enemy) => enemy.st === 0 && enemy.n > 0;
export interface Bullet { id: number; z: number; x: number; y: number; vx: number; vy: number; dmg: number; life: number; kind: string; side: 0 | 1; owner: number; pierce: boolean; grav: number; r: number; hits: number[] }
export interface Prop extends Body { kind: 'crate' | 'barrel' | 'prisoner' | 'vehicle'; hp: number; drop?: WeaponId | 'food'; freed: number }
export type Pickup = Body & ({ drop: WeaponId | 'food'; life: number } | { drop: 'record'; life: number; record: number });
export interface Ev { k: string; x: number; y: number; a?: number; s?: string }
export type Phase = 'select' | 'story' | 'play' | 'clear' | 'gameover' | 'ending';
export interface GameState {
  autoStart: boolean; startRequested: boolean; replay: boolean;
  mission: { records: number; ticks: number; falls: number };
  tick: number; phase: Phase; phaseT: number; levelIdx: number; line: number; players: Player[]; enemies: Enemy[]; bullets: Bullet[]; props: Prop[]; pickups: Pickup[];
  camX: number; camLock: number; arenaIdx: number; wave: number; arenaOn: boolean; spawnIdx: number; bossId: number; clearT: number; lastHit: number; atBoss: boolean; bossKeep: number;
  lives: number; score: number; combo: number; comboT: number; hitstop: number; shake: number; slow: number; seed: number; nextId: number; events: Ev[];
  frenzy: number; frenzyCharge: number; checkpoint: number; chain: number; chainT: number;
  stats: { kills: number; deaths: number; rescued: number; bestCombo: number; ticks: number; grenades: number; parries: number; dodges: number; chains: number };
}
function newPlayer(slot: number): Player {
  return { id: slot + 1, z: 30 + slot * 25, slot, joined: false, ready: false, cursor: slot, char: slot, face: 1, x: 0, y: 0, w: 28, h: 56, vx: 0, vy: 0, ground: false, hp: 100, maxHp: 100, iframes: 0, down: false, downT: 0, out: false, revive: 0, weapon: 'pistola', ammo: 0, shootCd: 0, ax: 1, ay: 0, shooting: 0, meleeT: 0, meleeStep: 0, meleeWin: 0, meleeBuffer: 0, swing: 0, dive: false, dashT: 0, dashCd: 0, jumpsLeft: 0, coyote: 0, jbuf: 0, crouch: false, dropT: 0, buf: 0, meter: 50, specialT: 0, vehicle: 0, prev: 0, flash: 0, kills: 0, connected: false, grenades: 3, grenadeCd: 0, dashX: 0, dashZ: 0, counterT: 0 };
}
export function createGame(seed = 12345): GameState {
  return { autoStart: true, startRequested: false, replay: false, mission: { records: 0, ticks: 0, falls: 0 }, tick: 0, phase: 'select', phaseT: 0, levelIdx: 0, line: 0, players: [0, 1, 2, 3].map(newPlayer), enemies: [], bullets: [], props: [], pickups: [], camX: 0, camLock: 1e9, arenaIdx: 0, wave: 0, arenaOn: false, spawnIdx: 0, bossId: 0, clearT: 0, lastHit: 0, atBoss: false, bossKeep: 0, lives: 3, score: 0, combo: 0, comboT: 0, hitstop: 0, shake: 0, slow: 0, seed: seed >>> 0 || 1, nextId: 10, events: [], frenzy: 0, frenzyCharge: 0, checkpoint: 0, chain: 0, chainT: 0, stats: { kills: 0, deaths: 0, rescued: 0, bestCombo: 0, ticks: 0, grenades: 0, parries: 0, dodges: 0, chains: 0 } };
}
export function countRecords(s: GameState) {
  return MISSION_RECORDS[s.levelIdx].positions.filter((_, i) => s.mission.records & (1 << i)).length;
}
export function missionResult(s: GameState) {
  const records = countRecords(s), { falls, ticks } = s.mission;
  const rank = records === 3 && falls === 0 ? 'S' : records >= 2 || falls === 0 ? 'A' : 'B';
  return { rank, records, falls, ticks } as const;
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
  p.dashCd = 0; p.counterT = 0; p.meleeT = 0; p.meleeWin = 0; p.meleeBuffer = 0; p.dive = false; p.jbuf = 0; p.coyote = 0; p.jumpsLeft = 0; p.buf = 0;
}
function setupPlayerChar(p: Player) {
  const c = CHARS[p.char]; p.maxHp = c.hp; p.hp = c.hp; p.weapon = c.weapon; p.ammo = 0;
}
/** Al continuar se vuelve directo al jefe: nadie repite un nivel entero por perder con él. */
function jumpToBoss(s: GameState) {
  const lv = level(s); s.arenaIdx = lv.arenas.length - 1; const a = lv.arenas[s.arenaIdx]; s.camX = a.x - 1; s.atBoss = true; s.spawnIdx = lv.spawns.findIndex(d => d.x > a.x + W + 80); if (s.spawnIdx < 0) s.spawnIdx = lv.spawns.length;
  active(s).forEach((p, i) => { spawnPlayerAt(s, p, a.x + 120 + i * 55); p.iframes = 120; });
}
function jumpToCheckpoint(s: GameState, checkpoint: number) {
  const lv = level(s), previous = lv.arenas[checkpoint - 1];
  if (!previous || previous.boss) return;
  s.checkpoint = checkpoint; s.arenaIdx = checkpoint; s.camX = previous.x; s.spawnIdx = lv.spawns.findIndex(d => d.x > s.camX + 100);
  if (s.spawnIdx < 0) s.spawnIdx = lv.spawns.length;
  active(s).forEach((p, i) => spawnPlayerAt(s, p, s.camX + 130 + i * 55));
}
export function loadLevel(s: GameState, idx: number, retry = false) {
  s.atBoss = false;
  if (!retry) s.mission = { records: 0, ticks: 0, falls: 0 };
  s.frenzy = 0; s.frenzyCharge = 0; s.checkpoint = 0; s.chain = 0; s.chainT = 0;
  s.levelIdx = idx; s.enemies = []; s.bullets = []; s.props = []; s.pickups = []; s.camX = 0; s.camLock = 1e9; s.arenaIdx = 0; s.wave = 0; s.arenaOn = false; s.spawnIdx = 0; s.bossId = 0; s.clearT = 0; s.hitstop = 0; s.slow = 0; s.comboT = 0; s.combo = 0;
  const lv = level(s);
  MISSION_RECORDS[idx].positions.forEach(({ x, z }, record) => {
    if (!(s.mission.records & (1 << record))) s.pickups.push({ id: s.nextId++, x, z, y: surfaceAt(lv, x) ?? 460, w: 36, h: 34, vx: 0, vy: 0, ground: true, drop: 'record', life: 1, record });
  });
  active(s).forEach((p, i) => { spawnPlayerAt(s, p, 120 + i * 55); p.face = 1; p.iframes = 90; p.grenades = 3; p.grenadeCd = 0; });
}
function setPhase(s: GameState, ph: Phase) { if (ph === 'story' || ph === 'select') s.startRequested = false; s.phase = ph; s.phaseT = 0; s.line = 0; emit(s, 'phase', 0, 0, 0, ph); }
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
      if (!s.replay && s.phaseT > 45 && confirmPressed(s, inputs)) {
        if (s.levelIdx + 1 >= LEVELS.length) { setPhase(s, 'ending'); emit(s, 'victory', 0, 0); }
        else { s.levelIdx++; s.lives++; s.bossKeep = 0; setPhase(s, 'story'); }
      }
      break;
    case 'gameover':
      if (s.phaseT > 45 && confirmPressed(s, inputs)) { s.lives = 3; s.score = Math.floor(s.score / 2); const boss = s.enemies.find(e => e.id === s.bossId); if (boss) s.bossKeep = boss.hp; const again = s.atBoss, checkpoint = s.checkpoint; loadLevel(s, s.levelIdx, true); if (again) jumpToBoss(s); else if (checkpoint) jumpToCheckpoint(s, checkpoint); s.pickups = s.pickups.filter(p => p.x >= s.camX); setPhase(s, 'play'); emit(s, 'levelstart', 0, 0); }
      break;
    case 'ending':
      if (s.phaseT > 12 && confirmPressed(s, inputs)) {
        s.line++; s.phaseT = 0;
        if (s.line > ENDING.length) { const seed = s.seed; const fresh = createGame(seed); fresh.events = s.events; fresh.autoStart = s.autoStart; Object.assign(s, fresh); }
      }
      break;
  }
  latch(s, inputs);
}
/** Las reservas se deciden en el host y en orden de slot: dos confirmaciones simultáneas nunca duplican personaje. */
function stepSelect(s: GameState, inputs: (number | null)[]) {
  for (const p of s.players) if (inputs[p.slot] == null) { p.joined = false; p.ready = false; }
  const occupied = (p: Player, card: number) => s.players.some(o => o !== p && o.joined && o.ready && o.cursor === card);
  const navigate = (p: Player, direction: number) => {
    for (let n = 1; n <= CHARS.length; n++) {
      const card = (p.cursor + direction * n + CHARS.length * 2) % CHARS.length;
      if (!occupied(p, card)) { p.cursor = card; return; }
    }
  };
  const confirm = (p: Player, card: number) => {
    if (card < 0 || card >= CHARS.length || occupied(p, card)) { emit(s, 'pickblocked', W / 2, 160, p.slot, 'Ese personaje ya fichó. Elegí otro.'); return; }
    p.cursor = card; p.ready = true; emit(s, 'confirm', 0, 0);
  };
  for (const p of s.players) {
    const i = inputs[p.slot];
    if (i == null) continue;
    const press = (b: number) => (i & b) && !(p.prev & b);
    if (!p.joined) {
      p.joined = true; p.ready = false; p.cursor = p.slot;
      if (occupied(p, p.cursor)) navigate(p, 1);
      emit(s, 'ui', 0, 0);
    }
    const pick = pickOf(i);
    if (pick >= 0 && !p.ready) { confirm(p, pick); continue; }
    if (!p.ready) {
      if (press(BTN.L)) { navigate(p, -1); emit(s, 'ui', 0, 0); }
      if (press(BTN.R)) { navigate(p, 1); emit(s, 'ui', 0, 0); }
      if (press(BTN.J) || press(BTN.S)) confirm(p, p.cursor);
    } else if (press(BTN.M)) { p.ready = false; s.startRequested = false; emit(s, 'ui', 0, 0); }
  }
  const js = active(s);
  if (js.length && js.every(p => p.ready) && (s.autoStart || s.startRequested)) {
    if (s.clearT++ > 50) {
      s.clearT = 0;
      for (const p of js) { p.char = p.cursor; setupPlayerChar(p); p.meter = 50; p.kills = 0; }
      s.lives = 2 + js.length; s.score = 0; setPhase(s, 'story');
    }
  } else { s.clearT = 0; if (!js.length || js.some(p => !p.ready)) s.startRequested = false; }
}

// ---------- Juego ----------
function stepPlay(s: GameState, inputs: (number | null)[]) {
  s.stats.ticks++;
  if (!s.clearT) s.mission.ticks++;
  if (s.shake > 0) s.shake *= .86;
  // Lo que se aprieta durante una pausa de impacto se guarda: ningún toque se pierde.
  const hold = () => { for (const p of s.players) { const i = inputs[p.slot] ?? 0; p.buf |= i & ~p.prev; } };
  if (s.hitstop > 0) { s.hitstop--; hold(); return; }
  if (s.slow > 0) { s.slow--; if (s.slow % 3) { hold(); return; } }
  const lv = level(s);
  if (s.frenzy > 0) s.frenzy--;
  if (s.chainT > 0 && --s.chainT === 0) s.chain = 0;
  for (const p of s.players) {
    if (!p.joined && inputs[p.slot] != null) { const c = [0, 1, 2, 3].find(c => !s.players.some(o => o.joined && o !== p && o.char === c)); if (c === undefined) continue; p.joined = true; p.char = c; p.cursor = c; setupPlayerChar(p); p.meter = 50; p.grenades = 3; spawnPlayerAt(s, p, s.camX + 200); }
    if (p.joined) stepPlayer(s, p, inputs[p.slot] ?? 0, lv);
  }
  updateCamera(s, lv);
  runSpawns(s, lv);
  runArena(s, lv);
  for (const e of s.enemies) stepEnemy(s, e, lv);
  stepBullets(s, lv);
  stepProps(s, lv);
  stepPickups(s, lv);
  stepHazards(s, lv);
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
    shotZ = d.z ?? 20 + rnd(s) * 90;
    if (d.k === 'e') { const e = spawnEnemy(s, d.type, d.x, y, false); if (d.z !== undefined) e.z = d.z; }
    else if (d.k === 'pickup') dropPickup(s, d.x, y - 10, d.drop);
    else {
      const sz = d.k === 'vehicle' ? [80, 60] : d.k === 'prisoner' ? [28, 50] : d.k === 'barrel' ? [30, 42] : [40, 40];
      s.props.push({ id: s.nextId++, z: shotZ, x: d.x, y, w: sz[0], h: sz[1], vx: 0, vy: 0, ground: true, kind: d.k, hp: d.k === 'crate' ? 12 : d.k === 'barrel' ? 8 : d.k === 'vehicle' ? 120 : 1, drop: d.k === 'prisoner' ? d.drop : undefined, freed: 0 });
    }
  }
}
function spawnEnemy(s: GameState, type: EnemyType, x: number, y: number, arena: boolean) {
  const d = ENEMIES[type]; const hp = Math.round(d.hp * teamScale(s) * (isBoss(type) ? 1 : 1 + s.levelIdx * .08));
  const e: Enemy = { id: s.nextId++, z: isBoss(type) ? 60 : rnd(s) * DEPTH, type, x, y, w: d.w, h: d.h, vx: 0, vy: 0, ground: false, hp, maxHp: hp, face: -1, t: Math.floor(rnd(s) * 60), st: 0, cd: 60 + Math.floor(rnd(s) * 60), stun: 0, flash: 0, arena, swings: [0, 0, 0, 0], n: 0 };
  s.enemies.push(e); return e;
}
function runArena(s: GameState, lv: Level) {
  const arena = lv.arenas[s.arenaIdx];
  if (!arena) return;
  if (!s.arenaOn) {
    if (s.camX >= arena.x - (lv.autoScroll ? 2 : 200)) s.camLock = arena.x;
    if (s.camX < arena.x - 2) return;
    s.arenaOn = true;
    s.wave = 0;
    s.camX = arena.x;
    if (arena.boss) {
      s.atBoss = true;
      emit(s, 'bosswarn', 0, 0);
    } else {
      spawnWave(s, arena);
      emit(s, 'text', W / 2, 200, 0, arena.label);
    }
    return;
  }
  if (s.clearT > 0 || s.enemies.some(e => e.arena && e.hp > 0)) return;
  s.wave++;
  if (s.wave < arena.waves.length) {
    spawnWave(s, arena);
    const label = arena.waveLabels?.[s.wave];
    if (label) emit(s, 'text', W / 2, 200, 0, `${s.wave + 1}/${arena.waves.length} · ${label}`);
  } else if (arena.boss && !s.bossId) {
    const def = ENEMIES[arena.boss];
    const x = s.camX + W - 150;
    const boss = spawnEnemy(s, arena.boss, x, def.fly && arena.boss !== 'colmena' ? 260 : surfaceAt(lv, x) ?? 460, true);
    s.bossId = boss.id;
    boss.t = 0;
    if (s.bossKeep > 0) boss.hp = Math.min(boss.hp, s.bossKeep);
    boss.announced = bossPhase(boss);
    shotZ = boss.z;
    emit(s, 'boss', boss.x, boss.y, 0, def.name);
    s.hitstop = 0;
    s.shake = 12;
  } else if (!arena.boss) {
    s.arenaOn = false;
    s.arenaIdx++;
    s.camLock = 1e9;
    s.checkpoint = s.arenaIdx;
    for (const p of living(s)) {
      p.hp = Math.min(p.maxHp, p.hp + p.maxHp * .2);
      p.grenades = Math.min(3, p.grenades + 1);
    }
    emit(s, 'checkpoint', W / 2, 180, 0, '¡Pausa del mate! Punto de control');
    emit(s, 'text', W / 2, 180, 0, '¡Pausa del mate! Salud + granada');
  }
}

function spawnWave(s: GameState, arena: Arena) {
  arena.waves[s.wave]?.forEach((enemy, index) => {
    const flying = ENEMIES[enemy.type].fly;
    const offset = flying ? -(70 + index * 24) : 24 + index * 32;
    const x = s.camX + (enemy.side > 0 ? W + offset : -offset);
    spawnEnemy(s, enemy.type, x, enemy.y ?? 460, true).z = enemy.z;
  });
}

function stepPlayer(s: GameState, p: Player, inp: number, lv: Level) {
  const c = CHARS[p.char]; shotZ = p.z;
  const buf = p.buf; p.buf = 0;
  const has = (b: number) => !!(inp & b); const press = (b: number) => (!!(inp & b) && !(p.prev & b)) || !!(buf & b);
  if (p.grenadeCd > 0) p.grenadeCd--;
  if (p.counterT > 0) p.counterT--;
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
  const dirx = (has(BTN.R) ? 1 : 0) - (has(BTN.L) ? 1 : 0);
  if (dirx && !p.dashT) p.face = dirx;
  p.crouch = false;
  // Arriba y abajo mueven por la profundidad del escenario.
  const dirz = (has(BTN.D) ? 1 : 0) - (has(BTN.U) ? 1 : 0);
  if (p.specialT === 0 && !p.dashT && !(p.meleeT > 0 && p.ground)) p.z = Math.max(0, Math.min(DEPTH, p.z + dirz * (p.vehicle ? 3 : c.speed * .68)));
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
  if (press(BTN.DASH) && p.dashCd === 0 && !p.vehicle) beginDash(s, p, dirx, dirz);
  const dashing = p.dashT > 0;
  if (dashing) {
    p.vx = p.dashX; p.z = Math.max(0, Math.min(DEPTH, p.z + p.dashZ)); p.vy = Math.min(p.vy, 1);
    for (const e of s.enemies) if (e.hp > 0 && overlap(p, e) && e.swings[p.slot] !== p.swing) {
      e.swings[p.slot] = p.swing;
      if (!isBoss(e.type)) e.stun = Math.max(e.stun, 24);
      damageEnemy(s, e, c.meleeDmg * .7, Math.sign(p.dashX) * 6, -3, p, true, false);
    }
    shotZ = p.z;
    if (s.tick % 3 === 0) emit(s, 'dust', p.x, p.y);
    p.dashT--;
  }
  else if (p.crouch) p.vx *= friction;
  else if (dirx && !(p.meleeT > 0 && p.ground)) { p.vx += dirx * accel; if (Math.abs(p.vx) > sp) p.vx = Math.sign(p.vx) * sp; }
  else p.vx *= friction;
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
  if (!dashing) p.vy = Math.min(p.vy + g, MAXFALL);
  const wasGround = p.ground, vyBefore = p.vy;
  moveBody(p, lv, p.dropT > 0 || has(BTN.D) && p.dive);
  if (p.ground && !wasGround && vyBefore > 6) { emit(s, 'land', p.x, p.y, vyBefore); }
  if (p.dive && p.ground) { p.dive = false; p.meleeT = 0; explode(s, p.x, p.y - 10, 70, c.meleeDmg, 0, p.slot, true); s.shake = Math.max(s.shake, 5); }

  // Disparo
  shotZ = p.z;
  if (has(BTN.S) && p.shootCd === 0 && p.meleeT === 0 && !dashing) fire(s, p);
  if (press(BTN.G) && p.grenades > 0 && p.grenadeCd === 0 && !p.vehicle) {
    p.grenades--; p.grenadeCd = 40; s.stats.grenades++;
    s.bullets.push({ id: s.nextId++, z: p.z, x: p.x + p.face * 22, y: p.y - 36, vx: p.face * 7.5, vy: -8.5, dmg: 75, life: 52, kind: 'granada', side: 0, owner: p.slot, pierce: false, grav: .34, r: 8, hits: [] });
    emit(s, 'grenade', p.x, p.y - 36);
  }
  // Cuerpo a cuerpo: combo de tres golpes y picada en el aire.
  if (press(BTN.M)) p.meleeBuffer = 8;
  else if (p.meleeBuffer > 0) p.meleeBuffer--;
  if (p.meleeT > 0) {
    p.meleeT--;
    const active_ = p.dive || (p.meleeT <= 11 && p.meleeT >= 5);
    if (active_) meleeHit(s, p, c.meleeDmg * (p.meleeStep === 2 ? 1.6 : 1), c.meleeRange);
  }
  shotZ = p.z;
  if (p.meleeBuffer > 0 && !dashing && p.meleeT <= 3 && !p.vehicle) {
    p.meleeBuffer = 0;
    if (!p.ground) { p.dive = true; p.vy = 12; p.vx *= .3; p.meleeT = 99; p.meleeStep = 1; p.swing++; emit(s, 'melee', p.x, p.y, 2); }
    else { p.meleeStep = p.meleeWin > 0 ? (p.meleeStep + 1) % 3 : 0; p.meleeT = p.meleeStep === 2 ? 18 : 14; p.meleeWin = 30; p.swing++; if (p.ground) p.vx = p.face * (p.meleeStep === 2 ? 7 : 4); emit(s, 'melee', p.x, p.y, p.meleeStep); }
  }
  // Especial
  if (press(BTN.X) && p.meter >= 100 && !p.vehicle) doSpecial(s, p);
  // Subirse a un vehículo
  if (press(BTN.M) && !p.vehicle) { const v = s.props.find(o => o.kind === 'vehicle' && overlap(o, p)); if (v) { p.vehicle = v.hp; v.hp = 0; emit(s, 'vehicle', p.x, p.y); emit(s, 'text', p.x - s.camX, p.y - 90, 0, '¡A la zorra blindada!'); } }
  clampPlayer(s, p, lv);
}
function beginDash(s: GameState, p: Player, x: number, z: number) {
  const dx = x || (z ? 0 : p.face), length = Math.hypot(dx, z);
  const perfect = p.iframes === 0 && s.bullets.some(b => {
    if (b.side !== 1 || b.life <= 0 || Math.abs(b.z - p.z) >= 22) return false;
    const speed2 = b.vx ** 2 + b.vy ** 2;
    if (speed2 < .01) return false;
    const y = p.y - p.h / 2;
    const time = ((p.x - b.x) * b.vx + (y - b.y) * b.vy) / speed2;
    if (time < 0 || time > 8) return false;
    return Math.abs(p.x - (b.x + b.vx * time)) < p.w / 2 + b.r
      && Math.abs(y - (b.y + b.vy * time)) < p.h / 2 + b.r;
  });
  p.dashX = 11 * dx / length; p.dashZ = 8 * z / length;
  p.dashT = 10; p.dashCd = p.char === 0 ? 22 : 36; p.meleeT = 0; p.dive = false;
  p.iframes = Math.max(p.iframes, 11); p.swing++;
  if (perfect) {
    p.counterT = 135; p.meter = Math.min(100, p.meter + 25);
    gainFrenzy(s, 18); s.stats.dodges++; emit(s, 'dodge', p.x, p.y - 40);
  }
  emit(s, 'dash', p.x, p.y);
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
  p.shootCd = Math.max(2, Math.round(w.cd * (s.frenzy > 0 ? .75 : 1))); p.shooting = 10;
  const mx = p.x + p.face * (p.vehicle ? 44 : 26), my = p.y - p.h * .62;
  let target: Enemy | undefined, closest = 460;
  for (const e of s.enemies) {
    const ahead = (e.x - mx) * p.face;
    if (e.hp > 0 && ahead > 4 && ahead < closest && Math.abs(e.z - p.z) < 22 + e.w / 5) {
      target = e; closest = ahead;
    }
  }
  const targetY = target ? Math.max(target.y - target.h + 10, Math.min(target.y - 10, my)) : my;
  const a0 = Math.atan2(targetY - my, p.face * closest);
  p.ax = Math.cos(a0); p.ay = Math.sin(a0);
  for (let i = 0; i < w.count; i++) {
    const a = a0 + (w.count > 1 ? (i - (w.count - 1) / 2) * w.spread : (rnd(s) - .5) * w.spread * 2);
    const v = w.speed * (w.count > 1 ? .9 + rnd(s) * .2 : 1);
    s.bullets.push({ z: shotZ, id: s.nextId++, x: mx, y: my, vx: Math.cos(a) * v, vy: Math.sin(a) * v, dmg: w.dmg, life: w.life, kind: w.kind, side: 0, owner: p.slot, pierce: !!w.pierce, grav: 0, r: w.kind === 'cohete' ? 9 : w.kind === 'fuego' ? 14 : 6, hits: [] });
  }
  if (w.recoil && p.ground) p.vx -= p.ax * w.recoil;
  s.shake = Math.max(s.shake, w.shake);
  emit(s, 'shot', mx, my, a0, w.kind);
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
    p.meter = Math.min(100, p.meter + 6); s.hitstop = Math.max(s.hitstop, 2); s.stats.parries++; gainFrenzy(s, 8); emit(s, 'parry', b.x, b.y);
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
    p.hp = 0; p.down = true; p.dive = false; p.meleeT = 0; p.counterT = 0; p.weapon = CHARS[p.char].weapon; p.ammo = 0; s.stats.deaths++; s.mission.falls++; p.revive = 0;
    p.downT = living(s).length > 0 ? 420 : 70; emit(s, 'down', p.x, p.y - 30);
    p.vy = -7;
  }
}
function ejectVehicle(s: GameState, p: Player, destroyed: boolean) {
  if (destroyed) { explode(s, p.x, p.y - 30, 150, 80, 0, p.slot, true); p.iframes = 90; }
  else s.props.push({ id: s.nextId++, z: p.z, x: p.x, y: p.y, w: 80, h: 60, vx: 0, vy: 0, ground: true, kind: 'vehicle', hp: p.vehicle, freed: 0 });
  p.vehicle = 0; p.vy = -10; p.h = 56; p.w = 28;
}
export function damageEnemy(s: GameState, e: Enemy, dmg: number, kx: number, ky: number, p: Player | null, melee = false, canCounter = true) {
  if (e.hp <= 0) return;
  shotZ = e.z; s.lastHit = e.id;
  const boss = isBoss(e.type);
  if (boss && bossVulnerable(e)) dmg *= 1.2;
  if (e.stun > 0) dmg *= p && CHARS[p.char].id === 'beto' ? 2 : 1.4;
  if (p && s.frenzy > 0) dmg *= 1.35;
  if (p && canCounter && p.counterT > 0) {
    p.counterT = 0; dmg *= 1.6;
    s.hitstop = Math.max(s.hitstop, 3);
    emit(s, 'counter', e.x, e.y - e.h / 2, p.slot, '¡Contragolpe!');
  }
  if (p && melee && canCounter && e.support && e.support.slot !== p.slot && s.tick <= e.support.until && s.tick >= e.support.readyAt) {
    dmg *= 1.25;
    if (!boss) e.stun = Math.max(e.stun, 24);
    e.support.readyAt = s.tick + 140;
    gainFrenzy(s, 12);
    emit(s, 'teamhit', e.x, e.y - e.h / 2, p.slot, '¡Golpe de equipo!');
  }
  if (p) e.support = { slot: p.slot, until: s.tick + 50, readyAt: e.support?.readyAt ?? 0 };
  dmg = Math.round(dmg); e.hp -= dmg; e.flash = 6;
  if (!boss && e.type !== 'turret') { e.vx += kx; if (ky) { e.vy = ky; } }
  if (p) p.meter = Math.min(100, p.meter + dmg * (boss ? .06 : .18));
  emit(s, melee ? 'mhit' : 'hit', e.x, e.y - e.h / 2, dmg);
  if (e.hp <= 0) killEnemy(s, e, p);
}
function gainFrenzy(s: GameState, amount: number) {
  if (s.frenzy > 0) return;
  s.frenzyCharge = Math.min(100, s.frenzyCharge + amount);
  if (s.frenzyCharge >= 100) { s.frenzyCharge = 0; s.frenzy = 480; emit(s, 'frenzy', W / 2, 160, 480, '¡HORAS EXTRA!'); }
}
function killEnemy(s: GameState, e: Enemy, p: Player | null) {
  e.hp = 0; const d = ENEMIES[e.type]; s.stats.kills++; if (p) p.kills++;
  s.combo++; s.comboT = 170; s.stats.bestCombo = Math.max(s.stats.bestCombo, s.combo);
  s.score += d.score * Math.min(10, 1 + Math.floor(s.combo / 5)) * (s.frenzy > 0 ? 2 : 1);
  gainFrenzy(s, 8 + Math.min(8, Math.floor(s.combo / 3)));
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
  if (o.kind === 'prisoner') { if (o.freed) return; o.freed = 1; s.stats.rescued++; s.score += 500; gainFrenzy(s, 18); for (const p of active(s)) { p.grenades = Math.min(3, p.grenades + 1); p.meter = Math.min(100, p.meter + 15); } emit(s, 'rescue', o.x, o.y - 30); emit(s, 'text', o.x - s.camX, o.y - 80, 0, '¡El sindicato invita! +1 granada'); if (o.drop) dropPickup(s, o.x, o.y - 30, o.drop); return; }
  o.hp -= dmg; emit(s, 'hit', o.x, o.y - 20, 1);
  if (o.hp <= 0) {
    o.hp = 0;
    if (o.kind === 'barrel') {
      s.chain++; s.chainT = 85;
      if (s.chain >= 2) { s.score += 250 * s.chain; s.stats.chains++; gainFrenzy(s, 12); emit(s, 'chain', o.x, o.y - 60, s.chain, '¡Cadena de reclamos!'); }
      explode(s, o.x, o.y - 20, 130, 60, 0, owner, true);
    }
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
    if (k.drop === 'record') {
      const mask = 1 << k.record;
      if (!(s.mission.records & mask) && living(s).some(p => overlap(p, k))) {
        shotZ = k.z;
        s.mission.records |= mask; k.life = 0; s.score += 750;
        gainFrenzy(s, 12);
        emit(s, 'record', k.x, k.y - 33, countRecords(s), MISSION_RECORDS[s.levelIdx].name);
      }
      continue;
    }
    k.life--; k.vy = Math.min(k.vy + GRAV, 8); moveBody(k, lv); if (k.y > H + 60) k.life = 0;
    const p = living(s).find(p => overlap(p, k));
    if (p && k.life > 0) {
      shotZ = k.z; k.life = 0; emit(s, 'pickup', k.x, k.y - 20, 0, k.drop); p.meter = Math.min(100, p.meter + 10); s.score += 100;
      if (k.drop === 'food') { p.hp = Math.min(p.maxHp, p.hp + p.maxHp * .35); emit(s, 'text', p.x - s.camX, p.y - 80, 0, '¡Tortafrita!'); }
      else { p.weapon = k.drop; p.ammo = WEAPONS[k.drop].ammo; emit(s, 'text', p.x - s.camX, p.y - 80, 0, WEAPONS[k.drop].name + '!'); }
    }
  }
  s.pickups = s.pickups.filter(k => k.life > 0 && k.x > s.camX - 100);
}
/** Saltar, cambiar de carril o esquivar permite cruzar los peligros anunciados. */
function stepHazards(s: GameState, lv: Level) {
  for (const h of lv.hazards) {
    if (h.x > s.camX + W + 30 || h.x + h.w < s.camX) continue;
    const phase = (s.tick + h.offset) % h.period;
    if (phase >= h.on) continue;
    const zone = hazardZone(h, s.tick);
    for (const p of living(s)) if (p.x + p.w / 2 > h.x && p.x - p.w / 2 < h.x + h.w && Math.abs(p.z - zone.z) < zone.depth / 2 && p.y > 460 - h.height) {
      shotZ = p.z; hurtPlayer(s, p, h.dmg);
    }
  }
}
function stepBullets(s: GameState, lv: Level) {
  for (const b of s.bullets) {
    shotZ = b.z;
    if (b.kind === 'jeringa' && b.side === 0) { // Busca al enemigo más cercano
      let best: Enemy | null = null, bd = 260; for (const e of s.enemies) { const d = Math.hypot(e.x - b.x, e.y - e.h / 2 - b.y); if (d < bd) { bd = d; best = e; } }
      if (best) { const a = Math.atan2(best.y - best.h / 2 - b.y, best.x - b.x); const sp = Math.hypot(b.vx, b.vy) || 9; b.vx += (Math.cos(a) * sp - b.vx) * .14; b.vy += (Math.sin(a) * sp - b.vy) * .14; }
    }
    b.vy += b.grav; b.x += b.vx; b.y += b.vy; b.life--;
    if (b.kind === 'granada' && b.side === 0) {
      const floor = surfaceAt(lv, b.x) ?? 460;
      if (b.y >= floor - 7 && b.vy > 0) { b.y = floor - 7; b.vy *= -.45; b.vx *= .62; }
      if (b.life <= 0) { explode(s, b.x, b.y - 8, 155, b.dmg, 0, b.owner, true); continue; }
      if (b.x < s.camX - 80 || b.x > s.camX + W + 80) b.life = 0;
      continue;
    }
    if (b.kind === 'fuego') { b.vx *= .96; b.vy -= .06; }
    if (b.kind !== 'wave' && solidAt(lv, b.x, b.y)) { b.life = 0; if (b.kind === 'cohete' || b.kind === 'granada') explode(s, b.x, b.y - 6, b.kind === 'cohete' ? 100 : 70, b.dmg, b.side, b.owner, false); else emit(s, 'spark', b.x, b.y); continue; }
    if (b.kind === 'wave' && b.side === 1 && s.tick % 3 === 0) emit(s, 'dust', b.x, b.y + 14);
    if (b.x < s.camX - 80 || b.x > s.camX + W + 80 || b.y > H + 60 || b.y < -140) b.life = 0;
    if (b.life <= 0) continue;
    if (b.side === 0) {
      for (const e of s.enemies) {
        if (e.hp <= 0 || b.hits.includes(e.id)) continue;
        if (Math.abs(e.x - b.x) < e.w / 2 + b.r && Math.abs(e.z - b.z) < 26 + e.w / 5 && b.y + b.r > e.y - e.h && b.y - b.r < e.y) {
          b.hits.push(e.id);
          if (e.type === 'shield' && e.stun === 0 && Math.sign(b.vx) === -e.face && b.kind !== 'cohete' && b.kind !== 'wave') { emit(s, 'clang', b.x, b.y); b.life = 0; break; }
          if (b.kind === 'cohete') { b.life = 0; explode(s, b.x, b.y, 100, b.dmg, 0, b.owner, false); break; }
          damageEnemy(s, e, b.dmg, Math.sign(b.vx) * (b.kind === 'wave' ? 6 : .7), b.kind === 'wave' ? -6 : 0, s.players[b.owner] ?? null);
          if (!b.pierce) { b.life = 0; break; }
        }
      }
      if (b.life > 0) for (const o of s.props) if (o.hp > 0 && o.kind !== 'vehicle' && !o.freed && Math.abs(o.x - b.x) < o.w / 2 + b.r && Math.abs(o.z - b.z) < 34 && b.y + b.r > o.y - o.h && b.y - b.r < o.y) { damageProp(s, o, b.dmg, b.owner); if (!b.pierce) b.life = 0; break; }
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
    if (!boss && (e.type !== 'exploder' || e.st === 0)) e.face = dx >= 0 ? 1 : -1;
    if (e.cd > 0) e.cd--;
    if (!boss && e.type !== 'turret') { e.z += Math.max(-1.3, Math.min(1.3, tgt.z - e.z)); shotZ = e.z; }
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
      default: stepBoss(s, e, tgt, lv);
    }
    if (!boss && d.contact && !offscreen && e.st >= 0) for (const p of living(s)) if (overlap(e, p)) { hurtPlayer(s, p, d.contact); if (p.iframes === 60) p.vx += e.face * 5; }
  }
  if (d.fly) { if (e.type === 'turret') { e.vx = 0; e.vy = 0; } else if (!boss) { e.x += e.vx; e.y += e.vy; } }
  else { e.vy = Math.min(e.vy + GRAV, MAXFALL); moveBody(e, lv); if (e.y > H + 100) { e.hp = 0; emit(s, 'die', e.x, H, 0, e.type); } }
}
// Cada jefe prepara un movimiento, lo ejecuta y deja una ventana de recuperación.
const BOSS_ROTATIONS: Record<BossType, BossPattern[][]> = {
  camion: [['charge', 'mortar'], ['charge', 'mortar', 'charge', 'fan'], ['swarm', 'charge', 'mortar', 'charge']],
  grua: [['slam', 'mortar'], ['mortar', 'slam', 'fan'], ['slam', 'mortar', 'swarm', 'slam']],
  loco: [['sweep', 'fan'], ['fan', 'sweep', 'mortar'], ['sweep', 'ring', 'sweep', 'fan']],
  colmena: [['ring', 'pulse'], ['swarm', 'pulse', 'ring'], ['pulse', 'ring', 'swarm', 'pulse']],
  gerenta: [['fan', 'slam', 'ring'], ['sweep', 'ring', 'slam', 'swarm'], ['slam', 'sweep', 'mortar', 'ring', 'swarm', 'sweep']],
};

const PHASE_LINES: Record<BossType, [string, string]> = {
  camion: ['¡Reciclaje sin clasificar!', '¡Prendió la compactadora!'],
  grua: ['¡Carga fuera de control!', '¡Se soltó el contrapeso!'],
  loco: ['¡A toda máquina!', '¡Se quedó sin frenos!'],
  colmena: ['¡El grupo se quedó sin admin!', '¡Sobrecarga de la colmena!'],
  gerenta: ['¡Se cancelan las vacaciones!', '¡Esto afecta mi bono anual!'],
};

const BOSS_MOVES: Record<BossPattern, Pick<BossAttack, 'kind' | 'label' | 'tell' | 'duration' | 'w' | 'depth'>> = {
  charge: { kind: 'charge', label: 'Embestida de la compactadora', tell: 61, duration: 68, w: W - 20, depth: 58 },
  slam: { kind: 'slam', label: 'Impacto en el piso', tell: 56, duration: 22, w: 230, depth: 96 },
  sweep: { kind: 'sweep', label: 'Barrido de vía', tell: 60, duration: 24, w: W - 36, depth: 75 },
  mortar: { kind: 'salvo', label: 'Caída de carga', tell: 47, duration: 43, w: 258, depth: 70 },
  fan: { kind: 'salvo', label: 'Salva dirigida', tell: 36, duration: 24, w: 96, depth: 47 },
  pulse: { kind: 'signal', label: 'Descarga de señal', tell: 57, duration: 27, w: 310, depth: 94 },
  ring: { kind: 'signal', label: 'Anillo de dispersión', tell: 47, duration: 24, w: 142, depth: 53 },
  swarm: { kind: 'reinforcements', label: 'Llegan refuerzos', tell: 40, duration: 16, w: 144, depth: 52 },
};

function startBossAttack(s: GameState, e: Enemy, target: Player, type: BossType, phase: number) {
  const rotation = BOSS_ROTATIONS[type][phase - 1];
  const pattern = rotation[e.n++ % rotation.length];
  const move = BOSS_MOVES[pattern];
  const span = pattern === 'sweep' && type === 'gerenta' ? 95 : move.depth;
  const center = s.camX + W / 2;
  const onSource = pattern === 'ring' || pattern === 'swarm';
  const acrossRoom = pattern === 'sweep' || pattern === 'charge';
  const x = acrossRoom ? center : onSource ? e.x : Math.max(s.camX + move.w / 2, Math.min(s.camX + W - move.w / 2, target.x));
  const z = onSource ? e.z : Math.max(20, Math.min(110, target.z));
  const dir = pattern === 'charge' ? (e.x > center ? -1 : 1) : (target.x < e.x ? -1 : 1);
  const tell = move.tell - (phase - 1) * 5;
  const duration = move.duration - (pattern === 'charge' ? (phase - 1) * 6 : 0);
  const label = pattern === 'sweep' && type === 'gerenta' ? 'Láser de desvinculación' : move.label;
  e.attack = { ...move, label, pattern, tell, duration, x, z, depth: span, dir, elapsed: 0, power: phase, originX: e.x };
  e.face = dir;
  e.st = 1;
  shotZ = e.z;
  emit(s, 'warn', e.x, e.y - e.h / 2);
}

function bossShockwave(s: GameState, x: number, z: number, dir: number) {
  shotZ = z;
  eshot(s, x, 442, dir > 0 ? 0 : Math.PI, 6, 13, 'wave');
}

function hitBossArea(s: GameState, attack: BossAttack, x: number, reach: number, height: number, damage: number) {
  const bounds = bossAttackBounds(attack);
  for (const p of living(s)) {
    if (Math.abs(p.x - x) >= reach + p.w / 2 || Math.abs(p.z - bounds.z) >= bounds.depth || p.y <= 460 - height) continue;
    shotZ = p.z;
    hurtPlayer(s, p, damage);
  }
}

function callBossReinforcements(s: GameState, e: Enemy, attack: BossAttack) {
  const side = attack.dir;
  const foes = e.type === 'colmena' ? ['flyer', 'flyer'] as const :
    e.type === 'grua' ? ['flyer', 'exploder'] as const :
    e.type === 'camion' ? ['grunt', 'rusher'] as const : ['shield', 'exploder'] as const;
  const limit = 3 + active(s).length;
  let count = s.enemies.filter(enemy => enemy.hp > 0).length;
  foes.forEach((type, i) => {
    if (count >= limit) return;
    const fly = ENEMIES[type].fly;
    const atRight = i === 0 ? side > 0 : side < 0;
    const x = s.camX + (atRight ? W + 28 : -28);
    spawnEnemy(s, type, x, fly ? 190 + i * 48 : 460, false).z = i === 0 ? 26 : 104;
    count++;
  });
}

function fireBossPattern(s: GameState, e: Enemy, attack: BossAttack, pulse: number) {
  const power = attack.power;
  const y = e.y - e.h * .54;
  shotZ = attack.z;
  switch (attack.pattern) {
    case 'mortar': {
      for (let i = 0; i < 3 + power; i++) {
        const offset = (i / (2 + power) - .5) * (attack.w - 34);
        shotZ = attack.z + (i % 2 ? 13 : -13);
        eshot(s, attack.x + offset, -30 - i * 8, Math.PI / 2, 14, 11 + power, 'orbe');
      }
      break;
    }
    case 'fan': {
      const aim = Math.atan2(415 - y, attack.x - e.x);
      for (let i = -2; i <= 2; i++) eshot(s, e.x, y, aim + i * .15, 4.6 + power * .35, 9 + power, 'orbe');
      break;
    }
    case 'ring': {
      const count = 10 + power * 2;
      const angle = e.n * .57 + pulse * .23;
      for (let i = 0; i < count; i++) {
        shotZ = Math.max(8, Math.min(DEPTH - 8, e.z + ((i % 3) - 1) * 28));
        eshot(s, e.x, y, angle + i * Math.PI * 2 / count, 3.8 + power * .25, 10 + power);
      }
      break;
    }
  }
  shotZ = e.z;
  emit(s, 'eshot', e.x, y);
}

function recoverBoss(s: GameState, e: Enemy, target: Player, type: BossType) {
  const center = s.camX + W / 2;
  const left = s.camX + e.w / 2 + 20, right = s.camX + W - e.w / 2 - 20;
  e.face = type === 'colmena' ? -1 : (target.x >= e.x ? 1 : -1);
  e.vx = 0;
  if (type === 'grua') {
    e.y += (222 - e.y) * .07;
    e.x += (Math.max(left, Math.min(right, target.x)) - e.x) * .014;
  } else if (type === 'loco') {
    e.y += (247 + Math.sin(e.t * .06) * 25 - e.y) * .075;
    e.x += (center + Math.sin(s.tick * .021) * 280 - e.x) * .028;
  } else if (type === 'gerenta') {
    e.y += (222 + Math.sin(e.t * .08) * 22 - e.y) * .062;
    e.x += (center + (e.n % 2 ? -W * .24 : W * .24) - e.x) * .044;
  }
}

function stepBoss(s: GameState, e: Enemy, target: Player, lv: Level) {
  const type = e.type as BossType;
  const phase = bossPhase(e);
  const left = s.camX + e.w / 2 + 20, right = s.camX + W - e.w / 2 - 20;
  if (phase > (e.announced ?? 1)) {
    e.announced = phase;
    e.n = 0;
    const line = PHASE_LINES[type][phase - 2];
    emit(s, 'bossphase', e.x, e.y - e.h / 2, phase, line);
    emit(s, 'text', W / 2, 155, phase, line);
  }

  const attack = e.attack;
  if (!attack) {
    recoverBoss(s, e, target, type);
    const recovery = [65, 54, 45][phase - 1];
    if (e.t >= recovery) startBossAttack(s, e, target, type, phase);
    return;
  }

  attack.elapsed++;
  const live = attack.elapsed - attack.tell;
  if (live < 0) {
    if (attack.pattern === 'slam') {
      const dropX = Math.max(left, Math.min(right, attack.x));
      e.x += (dropX - e.x) * .09;
      e.z += (attack.z - e.z) * .12;
      const height = 212 - 65 * (attack.elapsed / attack.tell);
      e.y += (height - e.y) * .13;
    } else if (attack.pattern === 'charge') {
      e.z += (attack.z - e.z) * .14;
    }
    return;
  }

  e.st = 2;
  const damage = 12 + attack.power * 2;
  if (attack.pattern === 'charge') {
    const endX = attack.dir < 0 ? left : right;
    const progress = Math.min(1, (live + 1) / attack.duration);
    e.x = attack.originX + (endX - attack.originX) * progress;
    e.z = attack.z;
    if (live % 4 === 0) { shotZ = e.z; emit(s, 'dust', e.x - e.face * 75, e.y); }
    hitBossArea(s, attack, e.x, e.w / 2, 74, damage + 2);
    if (live === attack.duration - 1) {
      shotZ = e.z;
      emit(s, 'boom', e.x + e.face * 45, e.y - 18, 54);
      s.shake = Math.max(s.shake, 11);
    }
  } else if (attack.pattern === 'slam') {
    if (live < 11) {
      const surface = surfaceAt(lv, e.x) ?? 460;
      e.y += (surface - e.y) / Math.max(1, 11 - live);
      if (live === 10) {
        shotZ = attack.z;
        emit(s, 'boom', attack.x, surface - 9, 76);
        s.shake = Math.max(s.shake, 15);
        if (attack.power >= 2) {
          bossShockwave(s, attack.x, attack.z, -1);
          bossShockwave(s, attack.x, attack.z, 1);
        }
      }
    } else if (live < 17) {
      hitBossArea(s, attack, attack.x, attack.w / 2, 59, damage + 2);
    }
  } else if (attack.pattern === 'sweep' || attack.pattern === 'pulse') {
    if (live === 0) { shotZ = attack.z; emit(s, 'boom', attack.x, 435, 34); }
    hitBossArea(s, attack, attack.x, attack.w / 2, attack.pattern === 'sweep' ? 57 : 48, damage);
  } else if (attack.pattern === 'swarm') {
    if (live === 0) callBossReinforcements(s, e, attack);
  } else if (live === 0 || (attack.power >= 2 && live === 16 && attack.pattern !== 'mortar')) {
    fireBossPattern(s, e, attack, live);
  }

  if (live + 1 >= attack.duration) {
    e.attack = undefined;
    e.st = 0;
    e.t = 0;
  }
}
