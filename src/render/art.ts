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
function bake(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d')!); return Texture.from(cv);
}
export const glowTex = () => bake(64, 64, c => { const g = c.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.3, 'rgba(255,255,255,.45)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 64, 64); });
export const chunkTex = () => bake(8, 8, c => { c.fillStyle = '#fff'; c.fillRect(0, 0, 8, 8); });
export const beamTex = () => bake(48, 8, c => { const g = c.createLinearGradient(0, 0, 48, 0); g.addColorStop(0, 'rgba(255,240,150,0)'); g.addColorStop(1, '#fffbd0'); c.fillStyle = g; c.fillRect(0, 1, 48, 6); });
export const vignetteTex = () => bake(480, 270, c => { const g = c.createRadialGradient(240, 135, 130, 240, 135, 300); g.addColorStop(0, 'rgba(0,0,10,0)'); g.addColorStop(1, 'rgba(0,0,10,.5)'); c.fillStyle = g; c.fillRect(0, 0, 480, 270); });
