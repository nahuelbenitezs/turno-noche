// Carga las hojas de sprites de public/arte y prepara cada cuadro como textura. Lo que falta (brillos) se dibuja por código.
import { Assets, Rectangle, Texture } from 'pixi.js';

export interface Frame { tex: Texture; ay: number; bw: number; bh: number; ax: number }
export type Sheet = (Frame | null)[];
const BASE = import.meta.env.BASE_URL + 'arte/';
export const BG = ['fondo1-barrio', 'fondo2-puerto', 'fondo3-tren', 'fondo4-torre', 'fondo5-nave'];
export const BOSS_SHEET: Record<string, string> = { camion: 'jefe1-camion', grua: 'jefe2-grua', loco: 'jefe3-tren', colmena: 'jefe4-colmena', gerenta: 'jefe5-gerenta' };
export const HEROES = ['yoli', 'tito', 'mirta', 'beto'];

export async function loadArt() {
  const atlas = await (await fetch(BASE + 'atlas.json')).json();
  const sheets: Record<string, Sheet> = {};
  await Promise.all(Object.keys(atlas).map(async name => {
    const base: Texture = await Assets.load(BASE + name + '.webp');
    sheets[name] = atlas[name].map((f: any) => f && { tex: new Texture({ source: base.source, frame: new Rectangle(f.x, f.y, f.w, f.h) }), ay: f.bottom / f.h, ax: f.cx / f.w, bw: f.bw, bh: f.bh });
  }));
  const bgs: Texture[] = await Promise.all(BG.map(n => Assets.load(BASE + n + '.webp')));
  return { sheets, bgs };
}
export function bake(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  draw(cv.getContext('2d')!);
  return Texture.from(cv);
}
export const glowTex = () => bake(64, 64, c => { const g = c.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.3, 'rgba(255,255,255,.45)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 64, 64); });
export const chunkTex = () => bake(8, 8, c => { c.fillStyle = '#fff'; c.fillRect(0, 0, 8, 8); });
export const beamTex = () => bake(48, 8, c => { const g = c.createLinearGradient(0, 0, 48, 0); g.addColorStop(0, 'rgba(255,240,150,0)'); g.addColorStop(1, '#fffbd0'); c.fillStyle = g; c.fillRect(0, 1, 48, 6); });
export const vignetteTex = () => bake(480, 270, c => { const g = c.createRadialGradient(240, 135, 130, 240, 135, 300); g.addColorStop(0, 'rgba(0,0,10,0)'); g.addColorStop(1, 'rgba(0,0,10,.5)'); c.fillStyle = g; c.fillRect(0, 0, 480, 270); });

export function actionArt() {
  const sequence = (draw: (c: CanvasRenderingContext2D, progress: number) => void) =>
    Array.from({ length: 7 }, (_, i) => bake(96, 96, c => {
      c.translate(48, 48);
      draw(c, i / 6);
    }));
  const slash = sequence((c, t) => {
    c.rotate(-1.2 + t * 1.85);
    c.scale(1 + t * .15, .78 + t * .15);
    c.beginPath();
    c.moveTo(-36, 18);
    c.quadraticCurveTo(6, 41, 40, 8);
    c.quadraticCurveTo(49, -7, 28, -31);
    c.quadraticCurveTo(53, 19, -36, 18);
    c.fillStyle = 'rgba(255,255,255,.36)'; c.fill();
    c.beginPath();
    c.moveTo(-18, 22);
    c.quadraticCurveTo(49, 30, 42, -14);
    c.quadraticCurveTo(36, 20, -18, 22);
    c.fillStyle = '#fff'; c.fill();
  });
  const impact = sequence((c, t) => {
    for (let i = 0; i < 8; i++) {
      c.save();
      c.rotate(i * Math.PI / 4 + .24);
      const reach = 12 + t * 24 + i % 3 * 4;
      c.beginPath();
      c.moveTo(3 + 12 * t, 0);
      c.lineTo(reach * .64, -3 + t * 2);
      c.lineTo(reach, 0);
      c.lineTo(reach * .56, 2.5 - t);
      c.fillStyle = i % 2 ? 'rgba(255,255,255,.5)' : '#fff'; c.fill();
      c.restore();
    }
  });
  const blast = sequence((c, t) => {
    const radius = 11 + t * 30;
    c.beginPath();
    for (let i = 0; i <= 22; i++) {
      const a = i * Math.PI / 11;
      const r = radius - (i % 2 ? 1 : 6) * (1.2 - t);
      c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    c.strokeStyle = 'rgba(255,255,255,.4)'; c.lineWidth = 9 - t * 5; c.stroke();
    c.strokeStyle = '#fff'; c.lineWidth = 3 - t * 2; c.stroke();
    const inner = radius - 9 - t * 3;
    c.beginPath(); c.arc(0, 0, inner, 0, Math.PI * 2);
    c.strokeStyle = 'rgba(255,255,255,.36)'; c.lineWidth = 1.5; c.stroke();
  });
  const spark = bake(32, 10, c => {
    c.beginPath(); c.moveTo(0, 5); c.lineTo(25, 2); c.lineTo(32, 5); c.lineTo(25, 8); c.fillStyle = '#fff'; c.fill();
  });
  const smoke = bake(48, 48, c => {
    c.fillStyle = 'rgba(255,255,255,.30)';
    for (const [x, y, r] of [[18, 23, 12], [29, 18, 10], [32, 28, 11], [20, 32, 10]]) {
      c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    }
  });
  return { slash, impact, blast, spark, smoke };
}
