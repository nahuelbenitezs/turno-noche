import { describe, expect, it } from 'vitest';
import { W } from '../src/sim/data';
import { LEVELS, hazardZone } from '../src/sim/levels';
import { Enemy, GameState, bossAttackBounds, bossPhase, bossVulnerable, createGame, loadLevel, step } from '../src/sim/sim';

function enterArena(level: number, arena: number) {
  const s = createGame(187);
  s.players[0].joined = s.players[1].joined = true;
  s.phase = 'play';
  loadLevel(s, level);
  const lv = LEVELS[level], entry = lv.arenas[arena];
  s.arenaIdx = arena;
  s.camX = entry.x - 1;
  s.camLock = entry.x;
  s.spawnIdx = lv.spawns.length;
  s.pickups = [];
  s.players.slice(0, 2).forEach((p, i) => {
    p.x = entry.x + W / 2;
    p.z = i === 0 ? 61 : 119;
    p.y = 460;
    p.iframes = 0;
  });
  advance(s, 2);
  return s;
}

function advance(s: GameState, ticks = 1) {
  for (let i = 0; i < ticks; i++) step(s, [0, 0, null, null]);
}

function nextAttack(s: GameState, boss: Enemy) {
  for (let i = 0; i < 180 && !boss.attack; i++) advance(s);
  expect(boss.attack).toBeDefined();
  return boss.attack!;
}

describe('encuentros de campaña', () => {
  it('el aviso y la activación coinciden cuando el peligro alterna de carril', () => {
    for (const lv of LEVELS) {
      const h = lv.hazards.find(h => h.alternate)!;
      const activation = h.period - h.offset;
      expect(hazardZone(h, activation - h.warn)).toEqual(hazardZone(h, activation));
      expect(hazardZone(h, activation + h.period).z).toBe(130 - hazardZone(h, activation).z);
      expect(lv.sections.at(-1)?.x).toBe(lv.arenas.at(-1)?.x);
    }
  });

  it('el tren se detiene durante la emboscada y reanuda la marcha al despejarla', () => {
    const index = 2, s = enterArena(index, 0), arena = LEVELS[index].arenas[0];
    advance(s, 10);
    expect(s.camX).toBe(arena.x);
    for (let i = 0; i < arena.waves.length; i++) {
      s.enemies = [];
      advance(s);
    }
    expect(s.checkpoint).toBe(1);
    advance(s);
    expect(s.camX).toBeGreaterThan(arena.x);
  });

  it('el camión anticipa la trayectoria, embiste el carril marcado y queda expuesto', () => {
    const s = enterArena(0, LEVELS[0].arenas.length - 1);
    const boss = s.enemies.find(e => e.id === s.bossId)!;
    const [inLane, outLane] = s.players;
    const attack = nextAttack(s, boss);
    const bounds = bossAttackBounds(attack);
    expect(attack.kind).toBe('charge');
    expect(Math.abs(inLane.z - bounds.z)).toBeLessThan(bounds.depth);
    expect(Math.abs(outLane.z - bounds.z)).toBeGreaterThan(bounds.depth);
    advance(s, attack.tell - 1);
    expect(inLane.hp).toBe(inLane.maxHp);
    expect(bossVulnerable(boss)).toBe(false);
    advance(s, attack.duration + 10);
    expect(boss.attack).toBeUndefined();
    expect(inLane.hp).toBeLessThan(inLane.maxHp);
    expect(outLane.hp).toBe(outLane.maxHp);
    expect(bossVulnerable(boss)).toBe(true);
  });

  it.each([
    ['camion', 0, ['charge', 'charge', 'swarm']],
    ['grua', 1, ['slam', 'mortar', 'slam']],
    ['loco', 2, ['sweep', 'fan', 'sweep']],
    ['colmena', 3, ['ring', 'swarm', 'pulse']],
    ['gerenta', 4, ['fan', 'sweep', 'slam']],
  ] as const)('%s ajusta sus ataques por fase', (_name, index, patterns) => {
    for (const [i, hp] of [1, .6, .25].entries()) {
      const s = enterArena(index, LEVELS[index].arenas.length - 1);
      const boss = s.enemies.find(e => e.id === s.bossId)!;
      boss.hp = boss.maxHp * hp;
      expect(bossPhase(boss)).toBe(i + 1);
      expect(nextAttack(s, boss).pattern).toBe(patterns[i]);
    }
  });
});
