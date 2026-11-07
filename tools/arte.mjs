// Convierte las hojas de arte/ en WebP livianas para public/arte y genera atlas.json:
// para cada celda guarda dónde apoya el dibujo y su tamaño real.
import fs from 'node:fs';
import sharp from 'sharp';

const SHEETS = {
  yoli: [6, 6], tito: [6, 6], mirta: [6, 6], beto: [6, 6], enemigos: [6, 8], objetos: [6, 3], efectos: [6, 1],
  'jefe1-camion': [4, 2], 'jefe2-grua': [4, 2], 'jefe3-tren': [4, 2], 'jefe4-colmena': [4, 2], 'jefe5-gerenta': [4, 2],
};
const OUT = 'public/arte';
fs.mkdirSync(OUT, { recursive: true });
const atlas = {};
for (const [name, [cols, rows]] of Object.entries(SHEETS)) {
  const { data, info } = await sharp(`arte/${name}.png`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  // Saca el halo semitransparente que deja el recorte automático.
  for (let i = 3; i < data.length; i += 4) data[i] = data[i] < 170 ? 0 : 255;
  // Y borra el borde de color (rojo u oliva) que quedó alrededor del contorno oscuro.
  for (let pass = 0; pass < 3; pass++) {
    const del = [];
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4; if (!data[i + 3]) continue;
      if (data[i - 1] && data[i + 7] && data[i + 3 - w * 4] && data[i + 3 + w * 4]) continue;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if ((r > 80 && r > g * 1.7 && r > b * 1.5) || (r > 60 && r < 180 && g > 60 && g < 180 && b < g * .6)) del.push(i + 3);
    }
    for (const i of del) data[i] = 0;
  }
  const cw = w / cols, ch = h / rows, frames = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1;
    const x0 = Math.round(c * cw), y0 = Math.round(r * ch), x1 = Math.round((c + 1) * cw), y1 = Math.round((r + 1) * ch);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (data[(y * w + x) * 4 + 3]) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
    frames.push(maxX < 0 ? null : { x: x0, y: y0, w: x1 - x0, h: y1 - y0, bottom: maxY + 1 - y0, bw: maxX + 1 - minX, bh: maxY + 1 - minY, cx: (minX + maxX) / 2 - x0 });
  }
  atlas[name] = frames;
  await sharp(data, { raw: { width: w, height: h, channels: 4 } }).webp({ quality: 88, alphaQuality: 100 }).toFile(`${OUT}/${name}.webp`);
}
for (const n of ['fondo1-barrio', 'fondo2-puerto', 'fondo3-tren', 'fondo4-torre', 'fondo5-nave', 'portada']) await sharp(`arte/${n}.png`).webp({ quality: 82 }).toFile(`${OUT}/${n}.webp`);
fs.writeFileSync(`${OUT}/atlas.json`, JSON.stringify(atlas));
console.log('ok', Object.keys(atlas).length);
