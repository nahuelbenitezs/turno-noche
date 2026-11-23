import { Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { W } from '../sim/data';
import { bake } from './art';

export const THEME_LIGHT = [0xffb65a, 0x59cde8, 0xff876c, 0x95a0ff, 0x75f0bf];
const PLATE = ['#ffbc71', '#65deea', '#ff9479', '#b0afff', '#82f4c4'];
const DEPTH = ['#492c3a', '#20364a', '#412842', '#302a51', '#2c3456'];
const dark = '#111326', steel = '#272c48', edge = '#595774';
const TAU = Math.PI * 2;

/**
 * Decorative sprites share the stage palette and stay behind the walkable plane.
 * Each motif is baked once per renderer and reused along its route.
 */
export function stageMotifs() {
  return PLATE.map((accent, theme) => bake(152, 114, c => {
    const rect = (x: number, y: number, w: number, h: number, color: string) => {
      c.fillStyle = color; c.fillRect(x, y, w, h);
    };
    const disk = (x: number, y: number, r: number, color: string) => {
      c.fillStyle = color; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
    };
    const polygon = (points: number[], color: string) => {
      c.beginPath();
      for (let n = 0; n < points.length; n += 2) c.lineTo(points[n], points[n + 1]);
      c.fillStyle = color; c.fill();
    };
    if (theme === 0) {
      // Vidriera nocturna con el emblema de un pan cruzado por una luna.
      rect(12, 94, 128, 12, dark); rect(20, 98, 110, 4, DEPTH[theme]);
      rect(23, 13, 106, 84, dark); rect(27, 17, 98, 75, '#71394a');
      rect(33, 23, 86, 60, '#20162d'); rect(39, 29, 74, 48, '#37223b');
      disk(74, 53, 19, accent); disk(82, 45, 17, '#37223b');
      polygon([52, 66, 60, 57, 83, 54, 94, 58, 92, 65, 82, 70, 58, 70], '#ec814a');
      for (let i = 0; i < 3; i++) {
        polygon([65 + i * 7, 59 - i, 69 + i * 7, 59 - i, 73 + i * 7, 63 - i, 69 + i * 7, 64 - i], accent);
      }
      for (const x of [33, 116]) rect(x, 88, 3, 3, '#9a6573');
    } else if (theme === 1) {
      polygon([8, 91, 138, 91, 146, 101, 140, 108, 12, 108, 4, 102], dark);
      rect(14, 45, 124, 54, '#152b3c'); rect(17, 49, 118, 46, DEPTH[theme]);
      rect(20, 52, 111, 4, '#527487'); rect(20, 89, 111, 4, dark);
      for (let i = 0; i < 7; i++) {
        rect(26 + i * 16, 57, 3, 30, '#34586c'); rect(29 + i * 16, 57, 3, 30, dark);
      }
      rect(60, 21, 32, 28, dark); rect(65, 24, 22, 19, '#22566d');
      rect(70, 28, 13, 13, accent); rect(73, 29, 5, 7, '#e4ffff');
      for (const x of [16, 123]) { rect(x, 81, 13, 12, '#8e4f3d'); rect(x + 2, 83, 9, 3, '#ef9961'); }
    } else if (theme === 2) {
      rect(13, 23, 126, 58, dark); rect(17, 27, 118, 50, '#73495a');
      rect(23, 34, 106, 34, '#26192e'); rect(25, 36, 102, 3, '#431d38');
      rect(25, 64, 102, 2, '#692f49');
      for (let i = 0; i < 5; i++) {
        const x = 33 + i * 18;
        polygon([x, 44, x + 7, 44, x + 14, 51, x + 7, 58, x, 58, x + 7, 51], i < 3 ? accent : '#a34a58');
      }
      rect(32, 12, 6, 13, steel); rect(114, 12, 6, 13, steel);
      rect(34, 12, 2, 10, edge); rect(116, 12, 2, 10, edge);
    } else if (theme === 3) {
      polygon([56, 39, 38, 86, 24, 98, 25, 106, 127, 106, 122, 96, 104, 84, 92, 40], dark);
      polygon([60, 40, 47, 83, 35, 93, 115, 93, 101, 83, 88, 40], DEPTH[theme]);
      disk(75, 39, 28, dark); disk(75, 39, 23, '#525084'); disk(75, 39, 19, '#191a34');
      disk(75, 39, 12, '#353462'); disk(75, 39, 6, accent);
      rect(73, 38, 26, 2, accent); rect(74, 14, 2, 48, '#aca4de');
      rect(34, 95, 82, 6, '#535287');
      for (let x = 62; x <= 88; x += 9) rect(x, 87, 4, 3, '#a2dfbc');
    } else {
      polygon([35, 91, 117, 91, 126, 101, 116, 106, 36, 106, 25, 101], dark);
      polygon([39, 91, 113, 91, 119, 98, 109, 102, 43, 102, 33, 98], '#626081');
      rect(58, 87, 36, 8, accent);
      c.strokeStyle = '#408283'; c.lineWidth = 2;
      c.beginPath(); c.ellipse(76, 53, 34, 20, -.35, 0, TAU); c.stroke();
      disk(76, 53, 20, '#365d67'); disk(76, 53, 16, '#50a792'); disk(76, 53, 12, accent);
      polygon([68, 55, 71, 48, 84, 45, 81, 53, 74, 57, 69, 65], '#d1ffe9');
      disk(47, 51, 3, accent); disk(108, 62, 2, accent);
    }
  }));
}

export function buildScenery(
  theme: number,
  sections: readonly { x: number; label: string }[],
  motif: Texture,
  glow: Texture,
) {
  const layer = new Container();
  const color = THEME_LIGHT[theme];
  const pools = new Container();
  const fixtures = new Container();
  const lights: Sprite[] = [];
  layer.addChild(pools, fixtures);
  for (const [i, section] of sections.entries()) {
    const x = section.x + 166, y = 332 + (i % 2) * 12;
    const sprite = new Sprite(motif);
    sprite.anchor.set(.5, 1); sprite.position.set(x - 114, y + 1);
    sprite.scale.set(theme === 2 ? .64 : .78);
    const pool = new Sprite(glow);
    pool.anchor.set(.5); pool.position.set(x - 102, 386); pool.width = 202; pool.height = 46;
    pool.tint = color; pool.alpha = .22; pool.blendMode = 'add';
    const light = new Sprite(glow);
    light.anchor.set(.5); light.position.set(x - 114, y - 39); light.width = 128; light.height = 100;
    light.tint = color; light.alpha = .1; light.blendMode = 'add'; lights.push(light);
    pools.addChild(pool, light);

    const label = new Text({ text: section.label.toLocaleUpperCase('es-UY'), style: {
      fontFamily: 'monospace', fontSize: 11, fill: color, fontWeight: 'bold', letterSpacing: 1,
    } });
    const w = label.width + 35;
    const plate = new Graphics()
      .poly([0, 0, w + 12, 0, w + 17, 5, w + 17, 23, 4, 23, 0, 19])
      .fill({ color: 0x111323, alpha: .97 }).stroke({ color, alpha: .62, width: 1 })
      .rect(5, 5, 3, 13).fill(color)
      .rect(w - 1, 10, 9, 2).fill({ color, alpha: .6 })
      .rect(w + 7, 12, 2, 3).fill({ color, alpha: .6 });
    plate.position.set(x - 45, y - 52);
    label.position.set(14, 5); plate.addChild(label);
    fixtures.addChild(sprite, plate);
  }
  return { layer, lights };
}

const WINDOWS = [[243, 254, 278, 139], [691, 254, 277, 139], [1153, 254, 278, 139]];
const mod = (value: number, limit: number) => (value % limit + limit) % limit;

export function drawTrainWindows(g: Graphics, left: number, scale: number, t: number) {
  const period = 1672 * scale;
  const start = mod(left, period) - period;
  for (let tile = start; tile < W; tile += period) {
    for (const [x, y, width, height] of WINDOWS) {
      const wx = tile + x * scale, wy = y * scale, ww = width * scale, wh = height * scale;
      if (wx + ww <= 0 || wx >= W) continue;
      g.roundRect(wx + 2, wy + 4, ww - 4, wh - 8, 9).fill({ color: 0x172039, alpha: .76 });
      for (let i = 0; i < 17; i++) {
        const px = wx + 8 + mod(i * 37 - t * .28 + tile, ww - 16);
        const py = wy + 9 + (i * 17) % (wh - 25);
        g.rect(px, py, i % 4 === 0 ? 3 : 1, 1).fill({ color: 0xb5b0ee, alpha: .53 });
      }
      for (let i = 0; i < 9; i++) {
        const px = wx + 8 + mod(i * 29 + tile * .6 - t * 1.7, ww - 21);
        const ph = 6 + (i * 17) % 22;
        g.rect(px, wy + wh - 5 - ph, 5 + i % 3 * 2, ph).fill(0x252544);
        if (i % 2 === 0) g.rect(px + 3, wy + wh - ph - 1, 2, 2).fill({ color: 0xffb779, alpha: .48 });
      }
    }
  }
}
