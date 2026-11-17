// Dibuja el estado de la simulación con PixiJS (WebGL). No toma decisiones de juego.
import { Application, Container, Graphics, Sprite, Text, Texture, TilingSprite } from 'pixi.js';
import { CHARS, EnemyType, H, W, isBoss } from '../sim/data';
import { LEVELS } from '../sim/levels';
import { Bullet, Enemy, Ev, GameState, Player } from '../sim/sim';
import { BOSS_SHEET, Frame, HEROES, Sheet, beamTex, chunkTex, glowTex, loadArt, vignetteTex } from './art';

const screenY = (y: number, z: number) => y - 80 + z;
const FLOOR_SRC = 572 / 941; // Altura del piso dentro de las imágenes de fondo
const PLAYER_TINT = [0xff5a4e, 0x4ea8ff, 0x7dff6a, 0xffd23f];
const CHUNK = [0x7fd34a, 0x6b3fa0, 0xc0392b, 0x8d99ae, 0xffd23f];
const ENEMY_ROW: Partial<Record<EnemyType, number>> = { grunt: 0, rusher: 1, flyer: 2, shield: 3, lobber: 4, turret: 5, exploder: 6, heavy: 7 };
/** Alto en pantalla de cada enemigo. */
const ENEMY_H: Record<string, number> = { grunt: 88, rusher: 66, flyer: 60, shield: 92, lobber: 90, turret: 70, exploder: 62, heavy: 128, camion: 190, grua: 170, loco: 170, colmena: 340, gerenta: 170 };
const OBJ = { crate: 0, barrel: 1, prisoner: 2, vehicle: 3, food: 4, caja: 5, metra: 6, escopeta: 7, cohete: 8, fuego: 9, laser: 10, bala: 11, jeringa: 12, misil: 13, harina: 14, orbe: 15, granada: 16 } as const;
const OBJ_SIZE: Record<string, number> = { crate: 46, barrel: 56, prisoner: 62, vehicle: 92 };
const FX = { slash: 0, spark: 1, boom: 2, dust: 3, fire: 4, heal: 5 };
const heroFrame = (r: number, c: number) => r * 6 + c;

interface Part { s: Sprite; vx: number; vy: number; g: number; life: number; max: number; spin: number; grow: number; alpha?: number }
interface Rig { c: Container; body: Sprite; veh: Sprite; tag: Text; char: number; k: number }
const THEME_LIGHT = [0xffb65a, 0x59cde8, 0xff876c, 0x95a0ff, 0x75f0bf];
const SIGNS = [
  ['PAN CALIENTE', 'NO HAY SOL. HAY FIADO.', 'DELIVERY 24 HS'],
  ['MUELLE 04', 'NO ALIMENTAR A LA GRÚA', 'SOL: FRÁGIL'],
  ['PRÓXIMA: NINGUNA', 'NO ASOMAR LA CABEZA', 'ÚLTIMO SERVICIO'],
  ['SIN SEÑAL', 'NO ES EL ROUTER', 'COLMENA S.A.'],
  ['RECURSOS INHUMANOS', 'SONREÍ. ESTÁS EN TURNO.', 'HORAS EXTRA: 0'],
];

export class Renderer {
  app = new Application(); sheets: Record<string, Sheet> = {}; bgs: Texture[] = []; glow!: Texture; chunk!: Texture; beam!: Texture;
  root = new Container(); world = new Container(); levelC = new Container(); shadows = new Graphics(); actC = new Container(); fxC = new Container(); addC = new Container(); textC = new Container();
  markers = new Graphics(); hazards = new Graphics(); atmosphere = new Graphics();
  private backdrop?: TilingSprite;
  reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  lowFx = matchMedia('(pointer: coarse)').matches;
  private mobile = matchMedia('(pointer: coarse)').matches;
  private lastSimTick = -1;
  private hazardLabels = new Map<number, Text>();
  rigs = new Map<number, Rig>(); objs = new Map<number, Sprite>(); parts: Part[] = []; floats: { t: Text; life: number }[] = [];
  flash!: Graphics; levelDrawn = -1; smooth = 1; zoomPunch = 0; shakeExtra = 0; t = 0; camShown = 0;

  async init(host: HTMLElement) {
    await this.app.init({ width: W, height: H, background: 0x05030f, antialias: false, resolution: Math.min(window.devicePixelRatio || 1, this.mobile ? 1.5 : 2), autoDensity: true, powerPreference: 'high-performance' });
    host.prepend(this.app.canvas);
    const art = await loadArt(); this.sheets = art.sheets; this.bgs = art.bgs;
    this.glow = glowTex(); this.chunk = chunkTex(); this.beam = beamTex();
    this.actC.sortableChildren = true; this.addC.blendMode = 'add';
    this.world.addChild(this.levelC, this.hazards, this.shadows, this.actC, this.fxC, this.addC, this.markers);
    const vig = new Sprite(vignetteTex()); vig.width = W; vig.height = H;
    this.flash = new Graphics().rect(0, 0, W, H).fill(0xffffff); this.flash.alpha = 0;
    this.root.addChild(this.world, this.atmosphere, vig, this.flash, this.textC);
    this.app.stage.addChild(this.root);
  }
  /** Primer cuadro de cada personaje, para las cartas. */
  portrait(i: number) { return this.sheets[HEROES[i]][0]!; }
  private drawLevel(idx: number) {
    this.levelDrawn = idx; const lv = LEVELS[idx], tex = this.bgs[lv.theme];
    this.levelC.removeChildren().forEach(c => c.destroy({ children: true }));
    // El piso de la imagen queda alineado con la zona por donde se camina.
    const k = (380 - 44) / (tex.height * FLOOR_SRC);
    const bg = new TilingSprite({ texture: tex, width: W + 4, height: H + 40 }); bg.tileScale.set(Math.max(k, H / tex.height));
    this.backdrop = bg; this.levelC.addChild(bg);
    // El decorado se mueve más lento que el piso: profundidad sin filtros costosos.
    const trim = new Graphics(); const color = THEME_LIGHT[lv.theme];
    for (let x = 80; x < lv.width; x += 340) {
      const y = 395 + (Math.floor(x / 340) % 3) * 39;
      trim.ellipse(x, y, 58, 5).fill({ color, alpha: .07 });
      trim.moveTo(x - 38, y).lineTo(x + 38, y).stroke({ color, alpha: .17, width: 1 });
      if (lv.theme === 1 || lv.theme === 4) {
        trim.rect(x - 55, 380, 2, 150).fill({ color, alpha: .09 });
        for (let n = 0; n < 4; n++) trim.rect(x - 42 + n * 22, 385, 12, 3).fill({ color: 0xffd23f, alpha: .24 });
      }
    }
    this.levelC.addChild(trim);
    // Cartelería del mundo: cada nivel tiene sus propios chistes y color.
    for (let i = 0, x = 660; x < lv.width - 500; i++, x += 1250) {
      const sign = new Container(); sign.position.set(x, 242 + (i % 2) * 35);
      const words = SIGNS[lv.theme][i % 3]; const w = Math.max(132, words.length * 7 + 24);
      const plate = new Graphics().roundRect(-w / 2, -18, w, 34, 3).fill({ color: 0x0b1020, alpha: .95 }).stroke({ color, alpha: .7, width: 1 });
      plate.moveTo(-w / 2 + 8, 17).lineTo(-w / 2 + 8, 32).moveTo(w / 2 - 8, 17).lineTo(w / 2 - 8, 32).stroke({ color: 0x182034, width: 3 });
      const label = new Text({ text: words, style: { fontFamily: 'monospace', fontSize: 11, fontWeight: 'bold', fill: color, letterSpacing: 1 } }); label.anchor.set(.5);
      sign.addChild(plate, label); this.levelC.addChild(sign);
    }
    for (const label of this.hazardLabels.values()) label.destroy(); this.hazardLabels.clear();
    for (const p of this.parts) p.s.destroy(); this.parts = [];
    for (const f of this.floats) f.t.destroy(); this.floats = [];
  }
  private rig(p: Player): Rig {
    const old = this.rigs.get(p.id);
    if (old && old.char === p.char) return old;
    if (old) { old.c.destroy({ children: true }); old.tag.destroy(); }
    const c = new Container(); const body = new Sprite(Texture.EMPTY);
    const f = this.sheets[HEROES[p.char]][0]!; const k = (p.char === 1 ? 108 : 96) / f.bh;
    const veh = this.objSprite('vehicle'); veh.visible = false; veh.anchor.set(.5, veh.anchor.y);
    c.addChild(veh, body);
    const tag = new Text({ text: `J${p.slot + 1}`, style: { fontFamily: 'Arial Black, Arial, sans-serif', fontSize: 15, fontWeight: '900', fill: PLAYER_TINT[p.slot], stroke: { color: 0, width: 3 } } }); tag.anchor.set(.5, 1); tag.zIndex = 999;
    this.actC.addChild(c, tag);
    const r: Rig = { c, body, veh, tag, char: p.char, k }; this.rigs.set(p.id, r); return r;
  }
  private heroAnim(s: GameState, p: Player): number {
    const t = s.tick;
    if (p.down) return heroFrame(4, 5);
    if (p.specialT > 0) return heroFrame(5, 2 + (t >> 2) % 4);
    if (p.flash > 0) return heroFrame(4, 2 + (p.flash > 6 ? 0 : 1));
    if (p.dashT > 0) return heroFrame(2, 4 + (p.dashT > 5 ? 0 : 1));
    if (p.meleeT > 0) {
      const total = p.meleeStep === 2 ? 18 : 14; const late = p.meleeT < total * .68 ? 1 : 0;
      return p.dive ? heroFrame(3, 5) : heroFrame(3, p.meleeStep * 2 + late);
    }
    if (p.shooting > 0) return heroFrame(4, p.shooting > 6 ? 1 : 0);
    if (!p.ground) return heroFrame(2, p.vy < -3 ? 0 : p.vy < 3 ? 1 : 2);
    if (Math.abs(p.vx) > .6) return heroFrame(1, (t >> 2) % 6);
    return heroFrame(0, (t >> 4) % 6);
  }
  private syncPlayer(s: GameState, p: Player) {
    const r = this.rig(p); const show = p.joined && !p.out; r.c.visible = show; r.tag.visible = show && s.phase === 'play';
    if (!show) return;
    const py = screenY(p.y, p.z), k = this.smooth;
    r.c.x += (p.x - r.c.x) * k; r.c.y += (py - r.c.y) * k; if (Math.abs(p.x - r.c.x) > 200) r.c.position.set(p.x, py);
    r.c.zIndex = p.z; r.tag.position.set(r.c.x, r.c.y - (p.down ? 52 : 112));
    r.tag.text = p.down ? 'LEVANTAME' : !p.connected ? `J${p.slot + 1} · DESCONECTADO` : `J${p.slot + 1}`;
    r.tag.style.fill = p.down ? 0xffbc63 : PLAYER_TINT[p.slot];
    const f = this.sheets[HEROES[p.char]][this.heroAnim(s, p)] ?? this.sheets[HEROES[p.char]][0]!;
    this.setFrame(r.body, f); r.body.scale.set(r.k * p.face, r.k);
    r.veh.visible = !!p.vehicle; if (p.vehicle) { r.veh.scale.x = Math.abs(r.veh.scale.x) * p.face; r.body.y = -26; } else r.body.y = 0;
    r.c.alpha = p.iframes > 0 && p.iframes % 8 < 4 && !p.specialT ? .55 : 1;
    r.body.tint = p.flash > 8 ? 0xff9090 : 0xffffff;
  }
  private setFrame(sp: Sprite, f: Frame) { if (sp.texture !== f.tex) sp.texture = f.tex; sp.anchor.set(.5, f.ay); }
  private objFrame(key: keyof typeof OBJ) { return this.sheets.objetos[OBJ[key]]!; }
  private objSprite(key: keyof typeof OBJ, size = OBJ_SIZE[key] ?? 34) { const f = this.objFrame(key); const q = new Sprite(f.tex); q.anchor.set(.5, f.ay); q.scale.set(size / Math.max(f.bw, f.bh)); return q; }
  private enemyFrame(e: Enemy): Frame {
    if (isBoss(e.type)) {
      const sh = this.sheets[BOSS_SHEET[e.type]]; const blink = (e.t >> 4) % 2;
      if (e.flash > 2) return sh[4 + (e.flash > 4 ? 1 : 0)]!;
      return sh[e.st !== 0 || e.cd > 0 && e.cd < 12 ? 2 + blink : blink]!;
    }
    const row = ENEMY_ROW[e.type]! * 6, sh = this.sheets.enemigos;
    if (e.flash > 1 || e.stun > 0) return sh[row + 4]!;
    if (e.cd > 0 && e.cd < 14) return sh[row + 3]!;
    if (e.type === 'exploder' && e.st > 0) return sh[row + 3]!;
    return sh[row + ((e.t >> 3) % 2)]!;
  }
  private syncBullet(s: GameState, b: Bullet, newTick: boolean) {
    const key = ({ bala: 'bala', jeringa: 'jeringa', cohete: 'misil', harina: 'harina', orbe: 'orbe', granada: 'granada' } as Record<string, keyof typeof OBJ>)[b.kind];
    let q = this.objs.get(b.id);
    if (!q) {
      if (key) { const size = { bala: 20, jeringa: 32, misil: 42, harina: 26, orbe: 26, granada: 24 }[key as string] ?? 24; q = this.objSprite(key, size); q.anchor.set(.5, .5); this.fxC.addChild(q); }
      else if (b.kind === 'fuego' || b.kind === 'wave') { const f = this.sheets.efectos[FX.fire]!; q = new Sprite(f.tex); q.anchor.set(.5, .6); q.scale.set((b.kind === 'wave' ? 62 : 40) / f.bh); this.fxC.addChild(q); }
      else { q = new Sprite(this.beam); q.anchor.set(.5); q.scale.set(1.2); this.addC.addChild(q); }
      this.objs.set(b.id, q);
    }
    q.position.set(b.x, screenY(b.y, b.z));
    if (key === 'jeringa' || key === 'misil') q.rotation = Math.atan2(b.vy, b.vx) + .4;
    else if (key === 'bala' || !key && b.kind === 'laser') q.rotation = Math.atan2(b.vy, b.vx);
    else if (key === 'granada' || key === 'harina') q.rotation += .15;
    else if (b.kind === 'wave') { q.tint = b.side ? 0xffffff : 0xffe27a; q.scale.x = Math.abs(q.scale.x) * Math.sign(b.vx || 1); }
    else if (b.kind === 'fuego') { q.alpha = Math.min(1, b.life / 10); q.scale.x = Math.abs(q.scale.x) * Math.sign(b.vx || 1); }
    if (newTick && b.kind === 'cohete' && s.tick % 2 === 0) this.spawn(b.x - b.vx, screenY(b.y, b.z), 0xbbbbbb, { tex: this.glow, size: .5, life: 20, v: .3, vy: -.4 });
    if (b.kind === 'granada') q.tint = b.side ? 0xff8585 : 0xa8ffd9;
  }
  private drawAtmosphere(s: GameState) {
    const g = this.atmosphere.clear(), theme = LEVELS[this.levelDrawn].theme;
    if (s.phase !== 'play' && s.phase !== 'clear') return;
    const t = this.reducedMotion ? 0 : this.t;
    // Un único Graphics para lluvia, viento y partículas ambientales; sin sprites por gota.
    if (theme < 2 || theme === 3) {
      const count = this.lowFx ? 16 : 42;
      for (let i = 0; i < count; i++) {
        const x = ((i * 137.7 - t * 1.7 - this.camShown * .18) % (W + 30) + W + 30) % (W + 30);
        const y = (i * 79.3 + t * 7.3) % (H + 30) - 20;
        g.moveTo(x, y).lineTo(x - 4, y + 13).stroke({ color: 0xadc7f5, width: .8, alpha: .18 });
      }
    } else if (theme === 2) {
      for (let i = 0; i < 11; i++) {
        const x = ((i * 211 - t * 11) % (W + 240) + W + 240) % (W + 240) - 120;
        const y = 125 + i * 29;
        g.moveTo(x, y).lineTo(x + 70 + (i % 3) * 16, y).stroke({ color: 0xffe0c1, alpha: .07, width: 1 });
      }
    } else {
      for (let i = 0; i < (this.lowFx ? 8 : 22); i++) {
        const x = (i * 113.7 + Math.sin(t * .008 + i) * 19) % W;
        const y = ((i * 97 - t * .4) % H + H) % H;
        g.circle(x, y, i % 3 ? 1 : 2).fill({ color: 0x75f0bf, alpha: .12 + Math.sin(t * .02 + i) * .07 });
      }
    }
    if (s.frenzy > 0) {
      const a = .055 + Math.sin(t * .08) * .02;
      g.rect(0, 0, 6, H).rect(W - 6, 0, 6, H).fill({ color: 0xffd23f, alpha: a * 3 });
      g.rect(0, 0, W, 4).rect(0, H - 4, W, 4).fill({ color: 0xffd23f, alpha: a * 3 });
    }
  }
  private drawMarkers(s: GameState, newTick: boolean) {
    const g = this.markers.clear();
    if (s.phase !== 'play') return;
    const visible = (x: number) => x > this.camShown - 100 && x < this.camShown + W + 100;
    for (const p of s.players) if (p.joined && !p.out) {
      const y = screenY(p.y, p.z), color = PLAYER_TINT[p.slot];
      // La pequeña flecha identifica al jugador entre explosiones y a sus compañeros caídos.
      if (!p.down) g.poly([p.x - 4, y - 109, p.x + 4, y - 109, p.x, y - 103]).fill(color);
      if (p.down) {
        g.ellipse(p.x, y - 3, 38, 13).stroke({ color: 0xffbc63, width: 2, alpha: .55 + Math.sin(this.t * .09) * .2 });
        g.roundRect(p.x - 28, y - 44, 56, 5, 2).fill({ color: 0x151525, alpha: .95 });
        g.roundRect(p.x - 27, y - 43, Math.max(1, Math.min(54, p.revive / 70 * 54)), 3, 1).fill(0x85f0b2);
        g.moveTo(p.x - 4, y - 24).lineTo(p.x + 4, y - 24).moveTo(p.x, y - 28).lineTo(p.x, y - 20).stroke({ color: 0xffbc63, width: 2 });
      }
      if ((p.dashT > 0 || p.specialT > 0) && newTick && s.tick % (this.lowFx ? 4 : 2) === 0 && !this.reducedMotion && this.parts.length < (this.lowFx ? 70 : 260)) {
        const rig = this.rigs.get(p.id)!; const sp = new Sprite(rig.body.texture);
        sp.anchor.copyFrom(rig.body.anchor); sp.position.set(p.x - p.face * 12, y); sp.scale.copyFrom(rig.body.scale); sp.tint = CHARS[p.char].color;
        this.fxC.addChild(sp); this.parts.push({ s: sp, vx: -p.face * .4, vy: 0, g: 0, life: 12, max: 12, spin: 0, grow: 0, alpha: .24 });
      }
    }
    for (const e of s.enemies) if (visible(e.x) && e.hp > 0) {
      const y = screenY(e.y, e.z), h = ENEMY_H[e.type];
      if (!isBoss(e.type) && e.hp < e.maxHp) {
        const w = e.type === 'heavy' ? 50 : 34;
        g.roundRect(e.x - w / 2 - 1, y - h - 8, w + 2, 5, 1).fill({ color: 0x080c1c, alpha: .85 });
        g.rect(e.x - w / 2, y - h - 7, w * Math.max(0, e.hp / e.maxHp), 3).fill(e.stun > 0 ? 0x8edbff : 0xff786a);
      }
      if (e.type === 'exploder' && e.st > 0) {
        g.ellipse(e.x, 380 + e.z, 80, 22).fill({ color: 0xff443a, alpha: .12 }).stroke({ color: 0xff7a61, width: 2, alpha: .8 });
      }
      if ((e.type === 'grua' && e.st === 1) || (e.type === 'gerenta' && e.st === 3 && e.t < 30)) {
        g.ellipse(e.x, 380 + e.z, e.w * .65, 19).fill({ color: 0xff553b, alpha: .18 }).stroke({ color: 0xff9b62, width: 2 });
        g.moveTo(e.x, y).lineTo(e.x, 380 + e.z).stroke({ color: 0xffb47d, width: 1, alpha: .55 });
      }
      if (e.type === 'camion' && e.st === 0 && e.t > 25) {
        const x = e.face > 0 ? e.x : this.camShown;
        const w = Math.max(0, e.face > 0 ? this.camShown + W - e.x : e.x - this.camShown);
        g.rect(x, 365 + e.z, w, 26).fill({ color: 0xff5543, alpha: .08 });
      }
      if (e.stun > 0 && !this.reducedMotion) {
        const a = this.t * .13;
        for (let i = 0; i < 3; i++) g.circle(e.x + Math.cos(a + i * 2.1) * 15, y - h + Math.sin(a + i * 2.1) * 4, 2).fill(0xffe481);
      }
    }
    for (const o of s.props) if (visible(o.x) && !o.freed) {
      const y = screenY(o.y, o.z);
      if (o.kind === 'prisoner') g.poly([o.x, y - 77, o.x + 5, y - 71, o.x, y - 65, o.x - 5, y - 71]).fill(0xffd23f);
      if (o.kind === 'vehicle') {
        g.ellipse(o.x, y, 48, 12).stroke({ color: 0x87dbff, width: 1, alpha: .6 });
        g.poly([o.x - 5, y - 112, o.x + 5, y - 112, o.x, y - 106]).fill(0x87dbff);
      }
    }
    for (const k of s.pickups) if (visible(k.x)) {
      const color = k.drop === 'food' ? 0x83efae : 0xffd45f;
      g.ellipse(k.x, 380 + k.z, 22, 7).stroke({ color, width: 1, alpha: .55 });
    }
    for (const b of s.bullets) if (b.kind === 'granada' && b.grav > 0 && visible(b.x)) {
      const dt = Math.min(b.life, Math.max(0, (-b.vy + Math.sqrt(Math.max(0, b.vy * b.vy + 2 * b.grav * (450 - b.y)))) / b.grav));
      const x = b.x + b.vx * dt;
      g.ellipse(x, 380 + b.z, b.side ? 25 : 18, 7).stroke({ color: b.side ? 0xff7763 : 0x8dffd2, width: 1.5, alpha: .65 });
    }
  }
  private drawHazards(s: GameState) {
    const g = this.hazards.clear();
    const lv = LEVELS[this.levelDrawn];
    for (const [i, h] of lv.hazards.entries()) {
      const phase = (s.tick + h.offset) % h.period, on = phase < h.on;
      const warn = phase >= h.period - 55;
      const visible = s.phase === 'play' && h.x + h.w > this.camShown && h.x < this.camShown + W && (on || warn);
      let label = this.hazardLabels.get(i);
      if (!label) {
        label = new Text({ text: h.label, style: { fontFamily: 'monospace', fontSize: 11, fontWeight: 'bold', fill: 0xffcd73, stroke: { color: 0x100c1f, width: 3 } } });
        label.anchor.set(.5, 1); this.world.addChild(label); this.hazardLabels.set(i, label);
      }
      label.visible = visible;
      if (!visible) continue;
      const y = 380 + h.z, color = on ? 0xff583f : 0xffce71;
      label.position.set(h.x + h.w / 2, y - 34); label.text = on ? `⚠ ${h.label}` : '¡OJO AL PISO!';
      // Mismo alcance en profundidad que stepHazards: +/-27, también en los bordes.
      g.roundRect(h.x, y - 27, h.w, 54, 5).fill({ color, alpha: on ? .18 : .06 }).stroke({ color, width: 1.5, alpha: on ? .8 : .45 + Math.sin(this.t * .15) * .25 });
      for (let x = h.x + 8; x < h.x + h.w - 4; x += 22) g.moveTo(x, y + 16).lineTo(x + 10, y - 16).stroke({ color, width: 3, alpha: on ? .44 : .2 });
      if (on && !this.reducedMotion) for (let n = 0; n < 3; n++) {
        const x = h.x + ((this.t * 3 + n * h.w / 3) % h.w);
        g.moveTo(x, y).lineTo(x + 3, y - 17).lineTo(x - 3, y - 25).stroke({ color: 0xffe4b0, alpha: .6, width: 1 });
      }
    }
  }
  draw(s: GameState) {
    this.t++;
    const newTick = s.tick !== this.lastSimTick; this.lastSimTick = s.tick;
    const lvIdx = Math.min(s.levelIdx, LEVELS.length - 1);
    if (this.levelDrawn !== lvIdx) { this.drawLevel(lvIdx); this.objs.forEach(o => o.destroy()); this.objs.clear(); this.camShown = s.camX; }
    const mag = this.reducedMotion ? 0 : Math.min(18, s.shake + this.shakeExtra); this.shakeExtra *= .85;
    const sx = (Math.sin(this.t * 1.9) + Math.sin(this.t * 3.1)) * mag * .2, sy = (Math.cos(this.t * 2.3) + Math.sin(this.t * 2.9)) * mag * .2;
    this.camShown += (s.camX - this.camShown) * (Math.abs(s.camX - this.camShown) > 300 ? 1 : this.smooth);
    this.world.x = -this.camShown; this.root.position.set(sx, sy);
    this.zoomPunch *= .85; const z = 1 + (this.reducedMotion ? 0 : Math.min(.035, this.zoomPunch)); this.root.scale.set(z); this.root.pivot.set(W / 2 * (z - 1) / z, H / 2 * (z - 1) / z);
    this.flash.alpha *= .78;
    if (this.reducedMotion) this.flash.alpha = Math.min(.035, this.flash.alpha);
    if (this.backdrop) { this.backdrop.x = this.camShown - 2; this.backdrop.tilePosition.x = -this.camShown * .72; }

    for (const p of s.players) this.syncPlayer(s, p);
    const sh = this.shadows.clear();
    const blob = (x: number, zz: number, w: number, c = 0, a = .5) => sh.ellipse(x, 380 + zz, w, Math.max(4, w * .24)).fill({ color: c, alpha: a });
    for (const p of s.players) if (p.joined && !p.out) { blob(p.x, p.z, 26); blob(p.x, p.z, 20, PLAYER_TINT[p.slot], .75); }
    const seen = new Set<number>();
    for (const e of s.enemies) {
      seen.add(e.id); blob(e.x, e.z, e.w * .62);
      let o = this.objs.get(e.id); if (!o) { o = new Sprite(Texture.EMPTY); this.actC.addChild(o); this.objs.set(e.id, o); o.position.set(e.x, screenY(e.y, e.z)); }
      o.x += (e.x - o.x) * this.smooth; o.y += (screenY(e.y, e.z) - o.y) * this.smooth; o.zIndex = e.z;
      const f = this.enemyFrame(e); this.setFrame(o, f);
      const base = this.enemyBase(e.type), pop = e.flash > 3 ? 1.06 : 1;
      o.scale.set(base * pop * (e.face < 0 ? -1 : 1), base * pop);
      o.tint = e.flash > 3 ? 0xffb0b0 : e.stun > 0 ? 0x9fc7ff : e.type === 'exploder' && e.st > 0 && s.tick % 6 < 3 ? 0xff7070 : 0xffffff;
    }
    for (const o of s.props) {
      seen.add(o.id); blob(o.x, o.z, o.w * .55);
      let q = this.objs.get(o.id); if (!q) { q = this.objSprite(o.kind); this.actC.addChild(q); this.objs.set(o.id, q); }
      q.position.set(o.x, screenY(o.y, o.z)); q.zIndex = o.z;
      if (o.kind === 'prisoner' && o.freed) { q.y -= Math.abs(Math.sin(o.freed * .3)) * 12; q.alpha = Math.max(0, 1 - o.freed / 120); }
    }
    for (const k of s.pickups) {
      seen.add(k.id); blob(k.x, k.z, 16);
      let q = this.objs.get(k.id); if (!q) { const key = (k.drop === 'food' ? 'food' : k.drop) as keyof typeof OBJ; q = this.objSprite(key, 42); this.actC.addChild(q); this.objs.set(k.id, q); }
      q.position.set(k.x, screenY(k.y, k.z) - 4 + Math.sin(s.tick * .12 + k.id) * 3); q.zIndex = k.z; q.visible = k.life > 120 || s.tick % 10 < 6;
    }
    for (const b of s.bullets) { seen.add(b.id); this.syncBullet(s, b, newTick); }
    this.objs.forEach((o, id) => { if (!seen.has(id)) { o.destroy(); this.objs.delete(id); } });
    this.drawMarkers(s, newTick); this.drawHazards(s); this.drawAtmosphere(s);
    this.stepParts();
    this.floats = this.floats.filter(f => { f.life--; f.t.y -= .7; f.t.scale.set(Math.min(1, f.t.scale.x + .14)); f.t.alpha = Math.min(1, f.life / 15); if (f.life <= 0) { f.t.destroy(); return false; } return true; });
  }
  private enemyBase(type: EnemyType) { const sh = isBoss(type) ? this.sheets[BOSS_SHEET[type]][0]! : this.sheets.enemigos[ENEMY_ROW[type]! * 6]!; return ENEMY_H[type] / sh.bh; }
  // ---------- Partículas y efectos ----------
  private spawn(x: number, y: number, tint: number, o: { tex?: Texture; size?: number; life?: number; v?: number; vx?: number; vy?: number; g?: number; add?: boolean; grow?: number; spin?: number; noRot?: boolean } = {}) {
    if (this.parts.length >= (this.lowFx ? 80 : 280)) return;
    const s = new Sprite(o.tex ?? this.chunk); s.anchor.set(.5); s.position.set(x, y); s.tint = tint; if (!o.noRot) s.rotation = Math.random() * 6; s.scale.set(o.size ?? 1);
    (o.add ? this.addC : this.fxC).addChild(s);
    const a = Math.random() * 6.28, v = (o.v ?? 2) * (.4 + Math.random() * .8);
    this.parts.push({ s, vx: (o.vx ?? 0) + Math.cos(a) * v, vy: (o.vy ?? 0) + Math.sin(a) * v, g: o.g ?? 0, life: o.life ?? 24, max: o.life ?? 24, spin: o.noRot ? 0 : o.spin ?? (Math.random() - .5) * .4, grow: o.grow ?? 0 });
  }
  private stepParts() {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i]; p.life--; p.vy += p.g; p.s.x += p.vx; p.s.y += p.vy; p.vx *= .97; p.s.rotation += p.spin; if (p.grow) p.s.scale.set(p.s.scale.x + p.grow); p.s.alpha = Math.min(1, p.life / p.max * 1.6) * (p.alpha ?? 1);
      if (p.life <= 0) { p.s.destroy(); this.parts.splice(i, 1); }
    }
  }
  private fxSprite(i: number, x: number, y: number, size: number, life: number, o: { grow?: number; vy?: number } = {}) { const f = this.sheets.efectos[i]!; this.spawn(x, y, 0xffffff, { tex: f.tex, size: size / Math.max(f.bw, f.bh), life, v: 0, noRot: true, grow: o.grow, vy: o.vy }); }
  private boom(x: number, y: number, r: number) {
    this.fxSprite(FX.boom, x, y - r * .2, r * 2, 20, { grow: .004 });
    for (let i = 0; i < 7; i++) this.spawn(x, y, 0x333344, { size: 1.3, life: 40, v: 8, g: .35 });
    this.spawn(x, y, 0xffb060, { tex: this.glow, size: r / 40, life: 10, v: 0, add: true });
    this.flash.tint = 0xffffff; this.flash.alpha = Math.max(this.flash.alpha, .05);
  }
  private corpse(e: Ev) {
    if (this.parts.length >= (this.lowFx ? 80 : 280)) return;
    const t = e.s as EnemyType; if (!t) return;
    const boss = isBoss(t); const f = boss ? this.sheets[BOSS_SHEET[t]][7] : this.sheets.enemigos[ENEMY_ROW[t]! * 6 + 5]; if (!f) return;
    const k = this.enemyBase(t); const sp = new Sprite(f.tex); sp.anchor.set(.5, f.ay); sp.position.set(e.x, e.y + 30); sp.scale.set(k * (e.a === -1 ? -1 : 1), k); this.fxC.addChild(sp);
    this.parts.push({ s: sp, vx: 0, vy: 0, g: 0, life: boss ? 170 : 55, max: boss ? 170 : 55, spin: 0, grow: 0 });
  }
  floatText(x: number, y: number, str: string, color = 0xffffff, size = 26) {
    const fontSize = Math.min(size, Math.max(16, (W - 100) / Math.max(1, str.length * .66)));
    const t = new Text({ text: str, style: { fontFamily: 'Arial Black, Arial, sans-serif', fontSize, fontWeight: '900', fill: color, stroke: { color: 0x14101f, width: 4 }, wordWrap: true, wordWrapWidth: W - 100, align: 'center' } });
    t.anchor.set(.5); t.position.set(Math.max(100, Math.min(W - 100, x)), Math.max(110, Math.min(H - 55, y))); t.scale.set(this.reducedMotion ? 1 : .3); this.textC.addChild(t);
    this.floats.push({ t, life: 62 });
    while (this.floats.length > 5) this.floats.shift()!.t.destroy();
  }
  fx(e: Ev, s: GameState) {
    switch (e.k) {
      case 'shot': this.spawn(e.x, e.y, e.s === 'fuego' ? 0xff9f1c : 0xfff1a8, { tex: this.glow, size: e.s === 'cohete' ? 1 : .6, life: 5, v: 0, add: true }); break;
      case 'hit': this.fxSprite(FX.spark, e.x, e.y, 34, 7); break;
      case 'melee': this.fxSprite(FX.slash, e.x, e.y - 38, e.a === 2 ? 100 : 70, 9); break;
      case 'mhit': this.fxSprite(FX.spark, e.x, e.y, 76, 10, { grow: .008 }); for (let i = 0; i < 6; i++) this.spawn(e.x, e.y, CHUNK[i % 2], { size: .8, life: 16, v: 8 }); this.zoomPunch = Math.max(this.zoomPunch, .012); if ((e.a ?? 0) >= 12) this.floatText(e.x - s.camX, e.y - 26, String(e.a), 0xffe27a, 20); break;
      case 'die': this.corpse(e); this.fxSprite(FX.spark, e.x, e.y, 60, 8); for (let i = 0; i < 8; i++) this.spawn(e.x, e.y, CHUNK[i % CHUNK.length], { size: 1, life: 30, v: 7, g: .32, vy: -3 }); break;
      case 'boom': this.boom(e.x, e.y, e.a ?? 80); break;
      case 'dust': case 'land': case 'jump': case 'jump2': case 'dash': this.fxSprite(FX.dust, e.x, e.y - 8, e.k === 'land' ? 58 : 38, 14, { vy: -.3 }); break;
      case 'parry': this.fxSprite(FX.slash, e.x, e.y, 70, 8); this.floatText(e.x - s.camX, e.y, '¡DEVUELTA!', 0x7fe8ff, 18); break;
      case 'dodge':
        this.fxSprite(FX.slash, e.x, e.y, 88, 13);
        this.spawn(e.x, e.y, 0x75e8ff, { tex: this.glow, size: 2, life: 15, v: 0, add: true });
        this.floatText(e.x - s.camX, e.y - 30, '¡NI ME ROZÓ! +25', 0x8aeaff, 20); break;
      case 'grenade': this.spawn(e.x, e.y, 0x9fffd2, { tex: this.glow, size: .6, life: 9, v: 0, add: true }); break;
      case 'frenzy':
        this.flash.tint = 0xffd23f; this.flash.alpha = .16;
        this.floatText(W / 2, 150, '¡HORAS EXTRA!', 0xffd23f, 48);
        for (let i = 0; i < 12; i++) this.spawn(s.camX + W / 2, 230, i % 2 ? 0xffd23f : 0xff775e, { size: 1.2, life: 36, v: 12, vy: -4, g: .16 });
        break;
      case 'chain': this.floatText(e.x - s.camX, e.y - 35, '¡EFECTO DOMINÓ!', 0xffba65, 24); break;
      case 'checkpoint':
        this.floatText(W / 2, 150, 'PAUSA DEL MATE · PUNTO DE CONTROL', 0x98efc4, 27);
        for (const p of s.players) if (p.joined && !p.out) this.fxSprite(FX.heal, p.x, screenY(p.y, p.z) - 30, 90, 25, { vy: -.5 });
        break;
      case 'pickblocked': this.floatText(W / 2, 420, 'ESE TURNO YA ESTÁ OCUPADO', 0xffbd72, 20); break;
      case 'clang': case 'spark': for (let i = 0; i < 4; i++) this.spawn(e.x, e.y, 0xffe27a, { size: .5, life: 12, v: 5, g: .2 }); break;
      case 'crate': for (let i = 0; i < 9; i++) this.spawn(e.x, e.y, 0xb07a3f, { size: 1.3, life: 34, v: 6, g: .35, vy: -3 }); break;
      case 'hurt': this.flash.tint = 0xff2030; this.flash.alpha = .18; this.fxSprite(FX.spark, e.x, e.y, 48, 7); break;
      case 'revive': this.fxSprite(FX.heal, e.x, e.y, 90, 34, { vy: -.6 }); break;
      case 'pickup': case 'rescue': for (let i = 0; i < 8; i++) this.spawn(e.x, e.y, 0xffe27a, { tex: this.glow, size: .35, life: 24, v: 3.2, vy: -1.5, add: true }); break;
      case 'special': this.flash.tint = CHARS[e.a ?? 0].color; this.flash.alpha = .22; this.zoomPunch = .03; this.floatText(W / 2, 145, (e.s ?? '').toUpperCase() + '!', CHARS[e.a ?? 0].color, 44); break;
      case 'bossdie': this.flash.tint = 0xffe6af; this.flash.alpha = .45; this.zoomPunch = .035; for (let i = 0; i < (this.lowFx ? 3 : 6); i++) this.boom(e.x + (Math.random() - .5) * 170, e.y + (Math.random() - .5) * 90, 90 + Math.random() * 60); break;
      case 'boss': this.floatText(W / 2, 170, e.s ?? '', 0xff5a4e, 40); this.shakeExtra = 18; break;
      case 'bosswarn': this.floatText(W / 2, 220, '¡ATENCIÓN!', 0xffd23f, 50); break;
      case 'bossphase': this.spawn(e.x, e.y, e.a === 3 ? 0xff553f : 0xffd23f, { tex: this.glow, size: 3, life: 25, v: 0, add: true }); break;
      case 'warn': this.spawn(e.x, e.y, 0xff3030, { tex: this.glow, size: 1.6, life: 16, v: 0, add: true }); break;
      case 'text': this.floatText(e.x, e.y, e.s ?? '', 0xffe27a, 26); break;
      case 'levelstart': this.floatText(W / 2, 200, LEVELS[s.levelIdx].name, 0xffffff, 44); break;
    }
  }
}
