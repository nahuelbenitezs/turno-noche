import { describe, expect, it } from 'vitest';
import { BTN, CHARS, ENEMIES, WEAPONS, pickBits } from '../src/sim/data';
import { Enemy, GameState, createGame, damageEnemy, hurtPlayer, loadLevel, step, surfaceAt, teamScale } from '../src/sim/sim';
import { LEVELS } from '../src/sim/levels';
import { botInput } from '../src/sim/bot';

function inPlay(n = 1, chars = [0, 1, 2, 3]): GameState {
  const s = createGame(7);
  const inputs = (b: (i: number) => number) => [0, 1, 2, 3].map(i => (i < n ? b(i) : null));
  step(s, inputs(() => 0));
  step(s, inputs(i => pickBits(chars[i])));
  for (let i = 0; i < 60 && s.phase === 'select'; i++) step(s, inputs(() => 0));
  expect(s.phase).toBe('story');
  s.phase = 'play'; loadLevel(s, 0);
  for (let i = 0; i < 60; i++) step(s, inputs(() => 0));
  return s;
}
const run = (s: GameState, n: number, i: number, slot = 0) => { for (let k = 0; k < n; k++) { const a: (number | null)[] = s.players.map(p => p.joined ? 0 : null); a[slot] = i; step(s, a); } };

describe('selección y fases', () => {
  it('cada jugador conectado se suma y elige personaje', () => {
    const s = createGame();
    step(s, [0, 0, null, null]);
    expect(s.players.filter(p => p.joined).length).toBe(2);
    step(s, [pickBits(3), pickBits(1), null, null]);
    for (let i = 0; i < 60; i++) step(s, [0, 0, null, null]);
    expect(s.phase).toBe('story');
    expect(s.players[0].char).toBe(3);
    expect(s.players[1].maxHp).toBe(CHARS[1].hp);
  });
  it('tocar una carta al sumarse elige esa carta', () => {
    const s = createGame(); step(s, [pickBits(2), null, null, null]);
    expect(s.players[0].cursor).toBe(2); expect(s.players[0].ready).toBe(true);
  });
  it('hay al menos cinco niveles, cada uno termina en un jefe distinto', () => {
    const bosses = LEVELS.map(l => l.arenas.at(-1)!.boss);
    expect(LEVELS.length).toBeGreaterThanOrEqual(5);
    expect(new Set(bosses).size).toBe(LEVELS.length);
  });
});
describe('movimiento', () => {
  it('cae al piso y corre a la velocidad de su personaje', () => {
    const s = inPlay(); const p = s.players[0];
    expect(p.ground).toBe(true);
    const x = p.x; run(s, 30, BTN.R);
    expect(p.x).toBeGreaterThan(x + 60);
    expect(Math.abs(p.vx)).toBeLessThanOrEqual(CHARS[0].speed + .01);
  });
  it('soltar salto antes hace un salto más bajo', () => {
    const high = inPlay(); run(high, 1, BTN.J); let minHigh = 1e9; for (let i = 0; i < 25; i++) { run(high, 1, BTN.J); minHigh = Math.min(minHigh, high.players[0].y); }
    const low = inPlay(); run(low, 1, BTN.J); let minLow = 1e9; for (let i = 0; i < 25; i++) { run(low, 1, 0); minLow = Math.min(minLow, low.players[0].y); }
    expect(minLow).toBeGreaterThan(minHigh + 30);
  });
  it('solo Yoli tiene doble salto', () => {
    const y = inPlay(1, [0]); run(y, 1, BTN.J); run(y, 12, 0); const v0 = y.players[0].vy; run(y, 1, BTN.J); expect(y.players[0].vy).toBeLessThan(v0 - 3);
    const t = inPlay(1, [1]); run(t, 1, BTN.J); run(t, 12, 0); const v1 = t.players[0].vy; run(t, 1, BTN.J); expect(t.players[0].vy).toBeGreaterThanOrEqual(v1);
  });
  it('arriba y abajo mueven por la profundidad, dentro del escenario', () => {
    const s = inPlay(); const p = s.players[0]; const z = p.z; run(s, 5, BTN.D); expect(p.z).toBeGreaterThan(z); run(s, 200, BTN.D); expect(p.z).toBeLessThanOrEqual(130);
  });
  it('un disparo en otro carril no pega', () => {
    const s = inPlay(); const p = s.players[0]; s.enemies = [{ id: 99, z: p.z > 65 ? 0 : 130, type: 'turret', x: p.x + 150, y: p.y, w: 40, h: 40, vx: 0, vy: 0, ground: true, hp: 300, maxHp: 300, face: -1, t: 0, st: 0, cd: 999, stun: 0, flash: 0, arena: false, swings: [0, 0, 0, 0], n: 0 }];
    run(s, 40, BTN.S); expect(s.enemies[0].hp).toBe(300);
  });
  it('el piso no tiene huecos ni plataformas', () => {
    for (const l of LEVELS) { expect(l.plats.length).toBe(0); expect(new Set(l.solids.map(r => r.y)).size).toBe(1); }
  });
  it('todos los huecos del juego se pueden saltar con el personaje más pesado', () => {
    const c = CHARS[1]; const air = 2 * c.jump / .62; const reach = c.speed * air * .85;
    for (const l of LEVELS) { const r = [...l.solids].sort((a, b) => a.x - b.x); for (let i = 1; i < r.length; i++) expect(r[i].x - (r[i - 1].x + r[i - 1].w)).toBeLessThan(reach); }
  });
});
describe('combate', () => {
  it('un arma recogida gasta munición y vuelve al arma base', () => {
    const s = inPlay(); const p = s.players[0]; p.weapon = 'cohete'; p.ammo = 2;
    run(s, 80, BTN.S);
    expect(p.weapon).toBe(CHARS[0].weapon);
    expect(WEAPONS.pistola.ammo).toBe(0);
  });
  it('los frames de invulnerabilidad evitan daño doble', () => {
    const s = inPlay(); const p = s.players[0]; p.iframes = 0; const hp = p.hp;
    hurtPlayer(s, p, 10); hurtPlayer(s, p, 10);
    expect(p.hp).toBe(hp - 10);
  });
  it('el golpe cuerpo a cuerpo daña y frena el tiempo', () => {
    const s = inPlay(); const p = s.players[0]; s.enemies = [];
    s.enemies.push({ id: 99, z: s.players[0].z, type: 'heavy', x: p.x + 40, y: p.y, w: 60, h: 80, vx: 0, vy: 0, ground: true, hp: 500, maxHp: 500, face: -1, t: 0, st: 0, cd: 999, stun: 0, flash: 0, arena: false, swings: [0, 0, 0, 0], n: 0 });
    run(s, 1, BTN.M); let stopped = false; for (let i = 0; i < 14; i++) { run(s, 1, 0); if (s.hitstop > 0) stopped = true; }
    expect(s.enemies[0].hp).toBeLessThan(500);
    expect(stopped).toBe(true);
  });
  it('el enemigo con escudo bloquea las balas de frente', () => {
    const s = inPlay(); const p = s.players[0]; s.enemies = [];
    s.enemies.push({ id: 99, z: s.players[0].z, type: 'shield', x: p.x + 200, y: p.y, w: 36, h: 54, vx: 0, vy: 0, ground: true, hp: 300, maxHp: 300, face: -1, t: 0, st: 0, cd: 999, stun: 0, flash: 0, arena: false, swings: [0, 0, 0, 0], n: 0 });
    run(s, 60, BTN.S | BTN.R & 0);
    expect(s.enemies[0].hp).toBe(300);
  });
  it('los enemigos resisten más con más jugadores', () => {
    expect(teamScale(inPlay(4))).toBeGreaterThan(teamScale(inPlay(1)));
    expect(ENEMIES.gerenta.hp).toBeGreaterThan(ENEMIES.camion.hp);
  });
  it('los especiales son distintos: Mirta cura y Beto aturde', () => {
    const s = inPlay(2, [2, 3]); const [m, b] = s.players; b.hp = 10; m.meter = 100;
    run(s, 1, BTN.X); expect(b.hp).toBeGreaterThan(10);
    s.enemies.push({ id: 99, z: s.players[0].z, type: 'grunt', x: s.camX + 400, y: 460, w: 30, h: 50, vx: 0, vy: 0, ground: true, hp: 300, maxHp: 300, face: -1, t: 0, st: 0, cd: 999, stun: 0, flash: 0, arena: false, swings: [0, 0, 0, 0], n: 0 });
    b.meter = 100; for (let i = 0; i < 12; i++) run(s, 1, i === 0 ? BTN.X : 0, 1);
    expect(s.enemies.find(e => e.id === 99)!.stun).toBeGreaterThan(0);
  });
});
describe('equipo y vidas', () => {
  it('un compañero levanta al caído sin gastar vidas', () => {
    const s = inPlay(2); const [a, b] = s.players; b.x = a.x + 10; b.y = a.y; a.iframes = 0; s.enemies = []; const lives = s.lives;
    hurtPlayer(s, a, 999); expect(a.down).toBe(true);
    for (let i = 0; i < 90; i++) { b.x = a.x + 10; run(s, 1, 0, 1); }
    expect(a.down).toBe(false); expect(s.lives).toBe(lives);
  });
  it('sin vidas se pierde, y continuar reinicia el mismo nivel', () => {
    const s = inPlay(); const p = s.players[0]; s.lives = 0; p.iframes = 0; hurtPlayer(s, p, 999);
    run(s, 90, 0); expect(s.phase).toBe('gameover');
    run(s, 50, 0); run(s, 1, BTN.J); expect(s.phase).toBe('play'); expect(s.lives).toBe(3);
  });
  it('caer al vacío no deja al jugador fuera del mapa', () => {
    const s = inPlay(); const p = s.players[0]; p.y = 900; p.iframes = 0; run(s, 2, 0);
    expect(p.y).toBeLessThan(600);
  });
  it('la cámara no retrocede y los jefes traban la cámara', () => {
    const s = inPlay(); const a0 = s.camX; run(s, 200, BTN.R); const a1 = s.camX; expect(a1).toBeGreaterThan(a0); run(s, 60, BTN.L); expect(s.camX).toBeGreaterThanOrEqual(a1);
  });
  it('los spawns están sobre terreno', () => {
    for (const l of LEVELS) for (const d of l.spawns) if (d.y === undefined) expect(surfaceAt(l, d.x), `${l.name} ${d.x}`).not.toBeNull();
  });
  it('el daño a un jefe no lo empuja', () => {
    const s = inPlay(); s.enemies.push({ id: 99, z: s.players[0].z, type: 'camion', x: 400, y: 460, w: 180, h: 110, vx: 0, vy: 0, ground: true, hp: 300, maxHp: 300, face: -1, t: 0, st: 0, cd: 999, stun: 0, flash: 0, arena: true, swings: [0, 0, 0, 0], n: 0 });
    damageEnemy(s, s.enemies.at(-1)!, 5, 10, -10, null); expect(s.enemies.at(-1)!.vx).toBe(0);
  });
});
describe('historia completa con jugador automático', () => {
  for (const n of [1, 2, 4]) it(`${n} jugador(es) llegan al final`, () => {
    const s = createGame(99 + n); let gameovers = 0, seen = new Set<number>(), done = false;
    for (let t = 0; t < 900000 && !done; t++) {
      if (s.phase === 'gameover' && s.phaseT === 1) gameovers++;
      if (s.phase === 'play') seen.add(s.levelIdx);
      if (s.phase === 'ending') done = true;
      const inp = [0, 1, 2, 3].map(i => (i < n ? (s.phase === 'select' ? pickBits(i) * (s.players[i].ready ? 0 : 1) : botInput(s, i)) : null));
      step(s, inp); JSON.stringify(s.events); s.events = [];
    }
    console.log(`${n}j: fin=${done} ticks=${s.stats.ticks} (${Math.round(s.stats.ticks / 3600)} min) gameovers=${gameovers} caídas=${s.stats.deaths} bajas=${s.stats.kills} rescatados=${s.stats.rescued}`);
    expect(done).toBe(true);
    expect(seen.size).toBe(LEVELS.length);
  }, 120000);
});
describe('continuar', () => {
  it('perder con un jefe vuelve directo al jefe', () => {
    const s = inPlay(); const lv = LEVELS[0]; s.camX = lv.arenas[1].x - 1; s.arenaIdx = 1; s.spawnIdx = lv.spawns.length; s.players[0].x = s.camX + 100;
    run(s, 5, 0); expect(s.atBoss).toBe(true);
    s.lives = 0; s.players[0].iframes = 0; hurtPlayer(s, s.players[0], 999); run(s, 90, 0); expect(s.phase).toBe('gameover');
    run(s, 50, 0); run(s, 1, BTN.J); run(s, 10, 0);
    expect(s.phase).toBe('play'); expect(s.camX).toBeGreaterThanOrEqual(lv.arenas[1].x - 3); expect(s.enemies.some(e => e.type === 'camion')).toBe(true);
  });
  it('el jefe conserva el daño al continuar', () => {
    const s = inPlay(); const lv = LEVELS[0]; s.camX = lv.arenas[1].x - 1; s.arenaIdx = 1; s.spawnIdx = lv.spawns.length; s.players[0].x = s.camX + 100;
    run(s, 5, 0); const b = s.enemies.find(e => e.type === 'camion')!; b.hp = 100;
    s.lives = 0; s.players[0].iframes = 0; hurtPlayer(s, s.players[0], 999); run(s, 90, 0); run(s, 50, 0); run(s, 1, BTN.J); run(s, 10, 0);
    expect(s.enemies.find(e => e.type === 'camion')!.hp).toBeLessThanOrEqual(100);
  });
});


const target = (s: GameState, x: number, hp = 500): Enemy => ({ id: s.nextId++, z: s.players[0].z, type: 'turret', x, y: 460, w: 40, h: 40, vx: 0, vy: 0, ground: true, hp, maxHp: hp, face: -1, t: 0, st: 0, cd: 9999, stun: 0, flash: 0, arena: false, swings: [0, 0, 0, 0], n: 0 });
const isolate = (s: GameState) => { s.enemies = []; s.props = []; s.pickups = []; s.bullets = []; s.spawnIdx = LEVELS[s.levelIdx].spawns.length; s.hitstop = 0; };

describe('equipo con personajes exclusivos', () => {
  it('cuatro confirmaciones simultáneas no reservan el mismo personaje', () => {
    const s = createGame();
    step(s, [pickBits(2), pickBits(2), pickBits(2), pickBits(2)]);
    expect(s.players.filter(p => p.ready).map(p => p.cursor)).toEqual([2]);
    expect(s.events.filter(e => e.k === 'pickblocked')).toHaveLength(3);
    step(s, [0, pickBits(0), pickBits(1), pickBits(3)]);
    for (let i = 0; i < 60; i++) step(s, [0, 0, 0, 0]);
    expect(s.phase).toBe('story');
    expect(new Set(s.players.map(p => p.char)).size).toBe(4);
  });
  it('la navegación saltea personajes confirmados y liberar la elección permite usarlos', () => {
    const s = createGame(); step(s, [pickBits(0), 0, null, null]);
    step(s, [0, BTN.L, null, null]); expect(s.players[1].cursor).toBe(3);
    step(s, [BTN.M, 0, null, null]);
    step(s, [0, pickBits(0), null, null]);
    expect(s.players[1].cursor).toBe(0); expect(s.players[1].ready).toBe(true);
  });
  it('rechaza una carta inexistente recibida de la red', () => {
    const s = createGame(); step(s, [pickBits(15), null, null, null]);
    expect(s.players[0].ready).toBe(false); expect(s.players[0].cursor).toBeLessThan(4);
  });
  it('desconectarse de la selección libera la reserva antes de otras confirmaciones', () => {
    const s = createGame(); step(s, [pickBits(0), pickBits(2), null, null]);
    step(s, [BTN.M, null, null, null]); step(s, [pickBits(2), null, null, null]);
    expect(s.players[0].cursor).toBe(2); expect(s.players[0].ready).toBe(true); expect(s.players[1].joined).toBe(false);
  });
  it('incorporarse a una partida y reconectar conserva un plantel único', () => {
    const s = inPlay(2, [3, 1]); isolate(s); const previous = s.players[0].char;
    step(s, [null, 0, 0, null]);
    expect(new Set(s.players.filter(p => p.joined).map(p => p.char)).size).toBe(3);
    step(s, [0, 0, 0, null]); expect(s.players[0].char).toBe(previous);
  });
  it('la sala espera explícitamente al anfitrión aunque todos estén listos', () => {
    const s = createGame(); s.autoStart = false;
    step(s, [pickBits(0), pickBits(1), null, null]);
    for (let i = 0; i < 180; i++) step(s, [0, 0, null, null]);
    expect(s.phase).toBe('select');
    s.startRequested = true;
    for (let i = 0; i < 60; i++) step(s, [0, 0, null, null]);
    expect(s.phase).toBe('story'); expect(s.startRequested).toBe(false);
  });
});

describe('arsenal y ritmo arcade', () => {
  it('una granada explota por mecha, daña en área y no daña al equipo', () => {
    const s = inPlay(2); isolate(s); const p = s.players[0], hp = s.players.map(p => p.hp);
    const e = target(s, p.x + 370); s.enemies.push(e);
    run(s, 70, BTN.G);
    expect(p.grenades).toBe(2); expect(s.stats.grenades).toBe(1); expect(e.hp).toBeLessThan(500);
    expect(s.players.map(p => p.hp)).toEqual(hp); expect(s.bullets.filter(b => b.kind === 'granada')).toHaveLength(0);
  });
  it('el stock de granadas se agota y se repone al cambiar de nivel', () => {
    const s = inPlay(); isolate(s); const p = s.players[0];
    for (let i = 0; i < 4; i++) { run(s, 1, BTN.G); run(s, 70, 0); }
    expect(p.grenades).toBe(0); expect(s.stats.grenades).toBe(3);
    loadLevel(s, 1); expect(p.grenades).toBe(3);
  });
  it('esquivar una bala inminente premia el timing y protege del daño', () => {
    const s = inPlay(); isolate(s); const p = s.players[0]; p.iframes = 0; p.meter = 0;
    s.bullets.push({ id: s.nextId++, z: p.z, x: p.x + 10, y: p.y - 25, vx: -5, vy: 0, dmg: 20, life: 90, kind: 'orbe', side: 1, owner: -1, pierce: false, grav: 0, r: 7, hits: [] });
    const hp = p.hp; run(s, 5, BTN.DASH);
    expect(s.stats.dodges).toBe(1); expect(p.meter).toBeGreaterThanOrEqual(25); expect(p.hp).toBe(hp);
  });
  it('el dash embiste y rompe la guardia sin golpear dos veces al mismo enemigo', () => {
    const s = inPlay(); isolate(s); const p = s.players[0];
    const e = target(s, p.x + 40); s.enemies.push(e);
    run(s, 1, BTN.DASH); run(s, 15, 0);
    expect(e.hp).toBeLessThan(500); expect(e.hp).toBeGreaterThan(470);
  });
  it('las bajas cargan un frenesí temporal que aumenta el daño y puntaje', () => {
    const s = inPlay(); isolate(s); const p = s.players[0]; s.frenzyCharge = 98;
    const e = target(s, p.x + 100, 1); s.enemies.push(e); damageEnemy(s, e, 5, 0, 0, p);
    expect(s.frenzy).toBe(480); expect(s.events.some(e => e.k === 'frenzy')).toBe(true);
    const other = target(s, p.x + 200); damageEnemy(s, other, 100, 0, 0, p); expect(other.hp).toBe(365);
    run(s, 500, 0); expect(s.frenzy).toBe(0);
  });
  it('rescatar repone una granada para cada integrante del equipo', () => {
    const s = inPlay(2); isolate(s); const p = s.players[0]; s.players.forEach(p => p.grenades = 0);
    s.props.push({ id: s.nextId++, z: p.z, x: p.x + 35, y: p.y, w: 28, h: 50, vx: 0, vy: 0, ground: true, kind: 'prisoner', hp: 1, freed: 0 });
    run(s, 20, BTN.S); expect(s.stats.rescued).toBe(1); expect(s.players.slice(0, 2).map(p => p.grenades)).toEqual([1, 1]);
  });
  it('detonar barriles encadenados suma una recompensa y no entra en recursión infinita', () => {
    const s = inPlay(); isolate(s); const p = s.players[0];
    s.props = [40, 120, 200].map(dx => ({ id: s.nextId++, z: p.z, x: p.x + dx, y: 460, w: 30, h: 42, vx: 0, vy: 0, ground: true, kind: 'barrel' as const, hp: 8, freed: 0 }));
    run(s, 30, BTN.S); expect(s.stats.chains).toBeGreaterThanOrEqual(2); expect(s.props).toHaveLength(0); expect(s.score).toBeGreaterThanOrEqual(1250);
  });
  it('cada misión tiene peligros avisados y suministros en un carril alternativo', () => {
    for (const lv of LEVELS) {
      expect(lv.objective.length).toBeGreaterThan(20); expect(lv.hazards).toHaveLength(3);
      for (const h of lv.hazards) { expect(h.period - h.on).toBeGreaterThan(55); expect(h.x + h.w).toBeLessThan(lv.width - 960); }
      expect(lv.spawns.some(d => d.z !== undefined && d.k === 'pickup')).toBe(true);
    }
  });
  it('el peligro daña el carril activo y permite evitarlo cambiando de carril', () => {
    const s = inPlay(2); isolate(s); const [a, b] = s.players, h = LEVELS[0].hazards[0];
    s.tick = h.period - h.offset - 1; s.camX = h.x - 250;
    for (const p of [a, b]) { p.x = h.x + 30; p.y = 460; p.iframes = 0; }
    a.z = h.z; b.z = h.z < 65 ? 125 : 5;
    const hpA = a.hp, hpB = b.hp; step(s, [0, 0, null, null]);
    expect(a.hp).toBe(hpA - h.dmg); expect(b.hp).toBe(hpB);
  });
});


describe('puntos de control de misión', () => {
  it('limpiar una arena guarda progreso y continuar vuelve allí con suministros', () => {
    const s = inPlay(); isolate(s); const a = LEVELS[0].arenas[0];
    s.camX = a.x; s.camLock = a.x; s.arenaIdx = 0; s.arenaOn = true; s.wave = a.waves.length - 1; s.players[0].x = a.x + 200;
    step(s, [0, null, null, null]);
    expect(s.checkpoint).toBe(1); expect(s.arenaIdx).toBe(1); expect(s.events.some(e => e.k === 'checkpoint')).toBe(true);
    s.phase = 'gameover'; s.phaseT = 50; s.players[0].prev = 0; s.players[0].grenades = 0;
    step(s, [BTN.J, null, null, null]);
    expect(s.phase).toBe('play'); expect(s.checkpoint).toBe(1); expect(s.arenaIdx).toBe(1); expect(s.camX).toBe(a.x);
    expect(s.players[0].grenades).toBe(3); expect(s.spawnIdx).toBeGreaterThan(0);
  });
});
