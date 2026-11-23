import { describe, expect, it } from 'vitest';
import { BTN, ENEMIES, pickBits } from '../src/sim/data';
import { LEVELS } from '../src/sim/levels';
import { MISSION_RECORDS } from '../src/sim/records';
import { Enemy, GameState, countRecords, createGame, damageEnemy, loadLevel, missionResult, step, surfaceAt } from '../src/sim/sim';

function start(team = false) {
  const s = createGame();
  step(s, [0, team ? 0 : null, null, null]);
  loadLevel(s, 0);
  s.phase = 'play';
  s.spawnIdx = LEVELS[0].spawns.length;
  for (const p of s.players) { p.y = 460; p.ground = true; p.iframes = 0; }
  return s;
}

function target(s: GameState, type: Enemy['type'] = 'turret'): Enemy {
  const { x, z } = s.players[0], { w, h } = ENEMIES[type];
  return { id: s.nextId++, type, x: x + 180, z, y: 460, w, h, vx: 0, vy: 0, ground: true, hp: 500, maxHp: 500,
    face: -1, t: 0, st: 0, cd: 999, stun: 0, flash: 0, arena: false, swings: [0, 0, 0, 0], n: 0 };
}

describe('respuesta de combate', () => {
  it('un dash lateral esquiva en profundidad y carga un solo contragolpe', () => {
    const s = start(), p = s.players[0], { x, z } = p;
    s.bullets.push({ id: s.nextId++, z, x: x + 20, y: p.y - 28, vx: -6, vy: 0, dmg: 10, life: 40,
      kind: 'orbe', side: 1, owner: -1, pierce: false, grav: 0, r: 7, hits: [] });
    step(s, [BTN.D | BTN.DASH, null, null, null]);
    for (let i = 0; i < 9; i++) step(s, [BTN.U, null, null, null]);
    expect(p.x).toBe(x);
    expect(p.z).toBeGreaterThan(z + 70);
    expect(s.stats.dodges).toBe(1);
    const e = target(s);
    damageEnemy(s, e, 10, 0, 0, p);
    damageEnemy(s, e, 10, 0, 0, p);
    expect(e.hp).toBe(474);
    expect(p.counterT).toBe(0);
  });

  it('un golpe tras el disparo de un aliado premia la coordinación una vez por ventana', () => {
    const s = start(true), [a, b] = s.players, e = target(s);
    damageEnemy(s, e, 20, 0, 0, a);
    damageEnemy(s, e, 20, 0, 0, b, true);
    expect(e.hp).toBe(455);
    expect(e.stun).toBeGreaterThan(0);
    expect(s.frenzyCharge).toBe(12);
    damageEnemy(s, e, 20, 0, 0, a, true);
    expect(s.events.filter(event => event.k === 'teamhit')).toHaveLength(1);
  });

  it('la puntería en altura permite acertar a un enemigo elevado y las balas que pasan abajo fallan', () => {
    const s = start(), p = s.players[0], e = target(s);
    e.y = 300;
    s.enemies = [e];
    s.bullets.push({ id: s.nextId++, z: p.z, x: e.x - 13, y: 420, vx: 13, vy: 0, dmg: 40, life: 40,
      kind: 'bala', side: 0, owner: p.slot, pierce: false, grav: 0, r: 6, hits: [] });
    step(s, [0, null, null, null]);
    expect(e.hp).toBe(500);
    for (let i = 0; i < 40; i++) step(s, [BTN.S, null, null, null]);
    expect(e.hp).toBeLessThan(500);
  });
});

describe('objetivos opcionales y repetición', () => {
  it('los quince coleccionables tienen piso y se pueden alcanzar antes de cada cierre', () => {
    MISSION_RECORDS.forEach((records, i) => {
      const level = LEVELS[i];
      expect(records.positions).toHaveLength(3);
      for (const { x, z } of records.positions) {
        expect(surfaceAt(level, x)).not.toBeNull();
        expect(z).toBeGreaterThan(0);
        expect(z).toBeLessThan(130);
        expect(x).toBeLessThan(level.arenas.at(-1)!.x + 960 - 20);
      }
    });
  });

  it('dos jugadores recogen el mismo objeto una sola vez y el equipo lo conserva al continuar', () => {
    const s = start(true), first = s.pickups[0];
    for (const p of s.players.slice(0, 2)) { p.x = first.x; p.z = first.z; }
    step(s, [0, 0, null, null]);
    expect(countRecords(s)).toBe(1);
    expect(s.score).toBe(750);
    expect(s.events.filter(event => event.k === 'record')).toHaveLength(1);
    s.phase = 'gameover'; s.phaseT = 60;
    step(s, [BTN.J, 0, null, null]);
    expect(countRecords(s)).toBe(1);
    expect(s.pickups.filter(p => p.drop === 'record').map(p => p.record)).toEqual([1, 2]);
    expect(s.score).toBe(375);
    loadLevel(s, 1);
    expect(countRecords(s)).toBe(0);
  });

  it('la misión elegida se juega por separado y el rango usa solo el resultado de ese intento', () => {
    const s = createGame(); s.replay = true; s.levelIdx = 3; s.stats.deaths = 6;
    step(s, [pickBits(0), null, null, null]);
    for (let i = 0; i < 60; i++) step(s, [0, null, null, null]);
    expect(s).toMatchObject({ phase: 'story', levelIdx: 3 });
    s.phase = 'clear'; s.phaseT = 60;
    s.mission = { records: 7, ticks: 3200, falls: 0 };
    expect(missionResult(s)).toEqual({ rank: 'S', records: 3, ticks: 3200, falls: 0 });
    s.mission.falls++;
    expect(missionResult(s).rank).toBe('A');
    step(s, [BTN.J, null, null, null]);
    expect(s).toMatchObject({ phase: 'clear', levelIdx: 3 });
  });
});
