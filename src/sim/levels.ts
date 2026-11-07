// Niveles definidos con un pequeño constructor: se avanza un cursor agregando piso, huecos y enemigos.
import { BossType, EnemyType, H, W, WeaponId } from './data';

export interface Rect { x: number; y: number; w: number; h: number }
export type SpawnKind = { k: 'e'; type: EnemyType } | { k: 'crate' } | { k: 'barrel' } | { k: 'prisoner'; drop: WeaponId | 'food' } | { k: 'vehicle' } | { k: 'pickup'; drop: WeaponId | 'food' };
export type Spawn = SpawnKind & { x: number; y?: number };
export interface WaveEnemy { type: EnemyType; side: -1 | 1; y?: number }
export interface Arena { x: number; waves: WaveEnemy[][]; boss?: BossType }
export interface Level { name: string; sub: string; theme: number; width: number; solids: Rect[]; plats: Rect[]; spawns: Spawn[]; arenas: Arena[]; autoScroll: number }

const GROUND = 460;
class B {
  c = 0; s = 0; top = GROUND; solids: Rect[] = []; plats: Rect[] = []; spawns: Spawn[] = []; arenas: Arena[] = [];
  /** Piso de largo `len`, opcionalmente a otra altura. */
  g(len: number, _top?: number) { const top = GROUND; this.top = top; this.s = this.c; this.solids.push({ x: this.c, y: top, w: len, h: H + 200 - top }); this.c += len; return this; }
  gap(len: number) { return this.g(len); }
  /** Plataforma atravesable; dx es relativo al inicio del último piso. */
  p(_dx: number, _y: number, _w: number) { return this; }
  e(dx: number, type: EnemyType, y?: number) { void y; this.spawns.push({ k: 'e', type, x: this.s + dx }); return this; }
  crate(dx: number) { this.spawns.push({ k: 'crate', x: this.s + dx }); return this; }
  barrel(dx: number) { this.spawns.push({ k: 'barrel', x: this.s + dx }); return this; }
  pow(dx: number, drop: WeaponId | 'food') { this.spawns.push({ k: 'prisoner', drop, x: this.s + dx }); return this; }
  vehicle(dx: number) { this.spawns.push({ k: 'vehicle', x: this.s + dx }); return this; }
  /** La cámara se traba hasta limpiar las oleadas. */
  arena(waves: WaveEnemy[][]) { this.arenas.push({ x: this.c - W + 60, waves }); return this; }
  boss(type: BossType, waves: WaveEnemy[][] = []) { this.g(W + 40); this.arenas.push({ x: this.c - W, waves, boss: type }); return this; }
  done(name: string, sub: string, theme: number, autoScroll = 0): Level {
    return { name, sub, theme, autoScroll, width: this.c, solids: this.solids, plats: this.plats, spawns: this.spawns.sort((a, b) => a.x - b.x), arenas: this.arenas };
  }
}
const R = (type: EnemyType, y?: number): WaveEnemy => ({ type, side: 1, y });
const LFT = (type: EnemyType, y?: number): WaveEnemy => ({ type, side: -1, y });

function barrio() {
  return new B().g(900).e(560, 'grunt').e(760, 'grunt').crate(420).barrel(640).pow(860, 'metra')
    .g(500).e(150, 'rusher').e(300, 'rusher').p(200, 350, 200).e(300, 'grunt', 340)
    .gap(100).g(700).e(200, 'grunt').e(320, 'flyer', 220).barrel(420).crate(520).e(600, 'grunt')
    .g(500, 400).e(120, 'shield').e(300, 'grunt').pow(420, 'food')
    .g(900, 460).arena([[R('rusher'), R('rusher'), LFT('rusher')], [R('grunt'), R('flyer', 200), R('flyer', 260), R('shield')]])
    .e(200, 'lobber').crate(320).vehicle(450).e(700, 'grunt').e(780, 'exploder')
    .boss('camion').done('El Barrio, 3 AM', 'Nivel 1 · Sin sol y sin colectivo', 0);
}
function puerto() {
  return new B().g(700).e(400, 'grunt').e(560, 'lobber').crate(300).barrel(480)
    .gap(110).g(320, 420).e(200, 'exploder').gap(110).g(320, 380).e(200, 'grunt').pow(100, 'escopeta').gap(120)
    .g(800, 460).p(100, 350, 180).p(360, 280, 180).e(180, 'turret', 330).e(450, 'turret', 260).e(600, 'shield').barrel(540).crate(720)
    .g(800).arena([[R('exploder'), R('exploder'), LFT('exploder')], [R('lobber'), R('grunt'), R('flyer', 180), LFT('grunt')]])
    .e(240, 'grunt').e(400, 'flyer', 200).e(480, 'flyer', 260).pow(600, 'fuego').barrel(700)
    .gap(120).g(600, 420).e(240, 'heavy').crate(120).g(400, 460).e(250, 'rusher').e(320, 'rusher')
    .boss('grua').done('El Puerto', 'Nivel 2 · Contenedores de sol robado', 1);
}
function tren() {
  // Nivel con cámara que avanza sola, sobre techos de vagones.
  const b = new B().g(800, 430).e(620, 'grunt').crate(360).pow(500, 'metra');
  for (let i = 0; i < 6; i++) {
    b.gap(70).g(620, i % 2 ? 400 : 430);
    if (i % 3 === 0) b.c -= 620, b.e(260, 'flyer', 190).e(460, 'grunt'), b.c += 620;
    if (i % 3 === 1) b.c -= 620, b.e(240, 'rusher').e(380, 'rusher').e(520, 'shield'), b.c += 620;
    if (i % 3 === 2) b.c -= 620, b.e(240, 'exploder').e(350, 'lobber').barrel(160).e(520, 'flyer', 220), b.c += 620;
    if (i === 2) b.c -= 620, b.pow(100, 'laser'), b.c += 620;
    if (i === 4) b.c -= 620, b.pow(100, 'food'), b.c += 620;
  }
  return b.gap(70).top = 430, b.boss('loco').done('Último Tren', 'Nivel 3 · La cámara no espera a nadie', 2, 2.1);
}
function torre() {
  return new B().g(620).e(360, 'shield').e(520, 'grunt').pow(250, 'cohete').p(120, 340, 160)
    .g(300, 370).e(180, 'turret', 240).g(300, 300).e(150, 'grunt').g(300, 370).e(180, 'exploder').g(400, 460).e(200, 'heavy')
    .g(900).p(120, 350, 180).p(420, 270, 180).p(700, 350, 160).arena([[R('flyer', 180), R('flyer', 240), LFT('flyer', 200), R('shield')], [R('heavy'), R('lobber'), LFT('rusher'), LFT('rusher')]])
    .e(260, 'turret', 300).e(500, 'grunt', 260).e(800, 'lobber', 340).vehicle(620)
    .gap(110).g(500).e(300, 'rusher').e(360, 'rusher').e(420, 'rusher').crate(120).gap(110).g(600).e(300, 'heavy').e(500, 'flyer', 200).pow(100, 'fuego').barrel(420)
    .boss('colmena').done('La Torre de Antenas', 'Nivel 4 · Mala señal, mucha colmena', 3);
}
function nave() {
  return new B().g(800).pow(240, 'laser').e(460, 'shield').e(640, 'turret', 330).p(380, 340, 160)
    .g(500, 400).e(200, 'heavy').gap(120).g(500, 460).e(200, 'exploder').e(280, 'exploder').e(380, 'flyer', 200)
    .g(900).arena([[R('grunt'), LFT('grunt'), R('flyer', 200), LFT('flyer', 240), R('lobber')], [R('heavy'), LFT('shield'), R('shield')], [R('rusher'), R('rusher'), LFT('rusher'), LFT('exploder'), R('exploder'), R('heavy')]])
    .pow(300, 'cohete').e(600, 'turret', 330).p(520, 340, 160)
    .g(300).pow(150, 'food').boss('gerenta').done('Nave Nodriza', 'Nivel 5 · Reunión con la Gerencia', 4);
}
export const LEVELS: Level[] = [barrio(), puerto(), tren(), torre(), nave()];
