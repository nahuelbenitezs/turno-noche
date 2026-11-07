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

interface Part { s: Sprite; vx: number; vy: number; g: number; life: number; max: number; spin: number; grow: number }
interface Rig { c: Container; body: Sprite; veh: Sprite; tag: Text; char: number; k: number }

export class Renderer {
  app = new Application(); sheets: Record<string, Sheet> = {}; bgs: Texture[] = []; glow!: Texture; chunk!: Texture; beam!: Texture;
  root = new Container(); world = new Container(); levelC = new Container(); shadows = new Graphics(); actC = new Container(); fxC = new Container(); addC = new Container(); textC = new Container();
  rigs = new Map<number, Rig>(); objs = new Map<number, Sprite>(); parts: Part[] = []; floats: { t: Text; life: number }[] = [];
  flash!: Graphics; levelDrawn = -1; smooth = 1; zoomPunch = 0; shakeExtra = 0; t = 0; camShown = 0;

  async init(host: HTMLElement) {
    await this.app.init({ width: W, height: H, background: 0x05030f, antialias: false, resolution: Math.min(window.devicePixelRatio || 1, 2), autoDensity: true, powerPreference: 'high-performance' });
    host.prepend(this.app.canvas);
    const art = await loadArt(); this.sheets = art.sheets; this.bgs = art.bgs;
    this.glow = glowTex(); this.chunk = chunkTex(); this.beam = beamTex();
    this.actC.sortableChildren = true; this.addC.blendMode = 'add';
    this.world.addChild(this.levelC, this.shadows, this.actC, this.fxC, this.addC);
    const vig = new Sprite(vignetteTex()); vig.width = W; vig.height = H;
    this.flash = new Graphics().rect(0, 0, W, H).fill(0xffffff); this.flash.alpha = 0;
    this.root.addChild(this.world, vig, this.flash, this.textC);
    this.app.stage.addChild(this.root);
  }
  /** Primer cuadro de cada personaje, para las cartas. */
  portrait(i: number) { return this.sheets[HEROES[i]][0]!; }
  private drawLevel(idx: number) {
    this.levelDrawn = idx; const lv = LEVELS[idx], tex = this.bgs[lv.theme];
    this.levelC.removeChildren().forEach(c => c.destroy({ children: true }));
    // El piso de la imagen queda alineado con la zona por donde se camina.
    const k = (380 - 44) / (tex.height * FLOOR_SRC);
    const bg = new TilingSprite({ texture: tex, width: lv.width + W, height: H + 40 }); bg.tileScale.set(Math.max(k, H / tex.height));
    this.levelC.addChild(bg);
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
    r.c.zIndex = p.z; r.tag.position.set(r.c.x, r.c.y - 112);
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
  private syncBullet(s: GameState, b: Bullet) {
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
    if (b.kind === 'cohete' && s.tick % 2 === 0) this.spawn(b.x - b.vx, screenY(b.y, b.z), 0xbbbbbb, { tex: this.glow, size: .5, life: 20, v: .3, vy: -.4 });
  }
  draw(s: GameState) {
    this.t++;
    const lvIdx = Math.min(s.levelIdx, LEVELS.length - 1);
    if (this.levelDrawn !== lvIdx) { this.drawLevel(lvIdx); this.objs.forEach(o => o.destroy()); this.objs.clear(); this.camShown = s.camX; }
    const mag = Math.min(26, s.shake + this.shakeExtra); this.shakeExtra *= .85;
    const sx = (Math.sin(this.t * 1.9) + Math.sin(this.t * 3.1)) * mag * .35, sy = (Math.cos(this.t * 2.3) + Math.sin(this.t * 2.9)) * mag * .35;
    this.camShown += (s.camX - this.camShown) * (Math.abs(s.camX - this.camShown) > 300 ? 1 : this.smooth);
    this.world.x = -this.camShown; this.root.position.set(sx, sy);
    this.zoomPunch *= .85; const z = 1 + this.zoomPunch; this.root.scale.set(z); this.root.pivot.set(W / 2 * (z - 1) / z, H / 2 * (z - 1) / z);
    this.flash.alpha *= .78;

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
    for (const b of s.bullets) { seen.add(b.id); this.syncBullet(s, b); }
    this.objs.forEach((o, id) => { if (!seen.has(id)) { o.destroy(); this.objs.delete(id); } });
    this.stepParts();
    this.floats = this.floats.filter(f => { f.life--; f.t.y -= .7; f.t.scale.set(Math.min(1, f.t.scale.x + .14)); f.t.alpha = Math.min(1, f.life / 15); if (f.life <= 0) { f.t.destroy(); return false; } return true; });
  }
  private enemyBase(type: EnemyType) { const sh = isBoss(type) ? this.sheets[BOSS_SHEET[type]][0]! : this.sheets.enemigos[ENEMY_ROW[type]! * 6]!; return ENEMY_H[type] / sh.bh; }
  // ---------- Partículas y efectos ----------
  private spawn(x: number, y: number, tint: number, o: { tex?: Texture; size?: number; life?: number; v?: number; vx?: number; vy?: number; g?: number; add?: boolean; grow?: number; spin?: number; noRot?: boolean } = {}) {
    if (this.parts.length > 300) return;
    const s = new Sprite(o.tex ?? this.chunk); s.anchor.set(.5); s.position.set(x, y); s.tint = tint; if (!o.noRot) s.rotation = Math.random() * 6; s.scale.set(o.size ?? 1);
    (o.add ? this.addC : this.fxC).addChild(s);
    const a = Math.random() * 6.28, v = (o.v ?? 2) * (.4 + Math.random() * .8);
    this.parts.push({ s, vx: (o.vx ?? 0) + Math.cos(a) * v, vy: (o.vy ?? 0) + Math.sin(a) * v, g: o.g ?? 0, life: o.life ?? 24, max: o.life ?? 24, spin: o.noRot ? 0 : o.spin ?? (Math.random() - .5) * .4, grow: o.grow ?? 0 });
  }
  private stepParts() {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i]; p.life--; p.vy += p.g; p.s.x += p.vx; p.s.y += p.vy; p.vx *= .97; p.s.rotation += p.spin; if (p.grow) p.s.scale.set(p.s.scale.x + p.grow); p.s.alpha = Math.min(1, p.life / p.max * 1.6);
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
    const t = e.s as EnemyType; if (!t) return;
    const boss = isBoss(t); const f = boss ? this.sheets[BOSS_SHEET[t]][7] : this.sheets.enemigos[ENEMY_ROW[t]! * 6 + 5]; if (!f) return;
    const k = this.enemyBase(t); const sp = new Sprite(f.tex); sp.anchor.set(.5, f.ay); sp.position.set(e.x, e.y + 30); sp.scale.set(k * (e.a === -1 ? -1 : 1), k); this.fxC.addChild(sp);
    this.parts.push({ s: sp, vx: 0, vy: 0, g: 0, life: boss ? 170 : 55, max: boss ? 170 : 55, spin: 0, grow: 0 });
  }
  floatText(x: number, y: number, str: string, color = 0xffffff, size = 26) {
    const t = new Text({ text: str, style: { fontFamily: 'Arial Black, Arial, sans-serif', fontSize: size, fontWeight: '900', fill: color, stroke: { color: 0x14101f, width: 5 } } });
    t.anchor.set(.5); t.position.set(Math.max(100, Math.min(W - 100, x)), y); t.scale.set(.3); this.textC.addChild(t);
    this.floats.push({ t, life: 62 });
    while (this.floats.length > 5) this.floats.shift()!.t.destroy();
  }
  fx(e: Ev, s: GameState) {
    switch (e.k) {
      case 'shot': this.spawn(e.x, e.y, e.s === 'fuego' ? 0xff9f1c : 0xfff1a8, { tex: this.glow, size: e.s === 'cohete' ? 1 : .6, life: 5, v: 0, add: true }); break;
      case 'hit': this.fxSprite(FX.spark, e.x, e.y, 34, 7); break;
      case 'mhit': this.fxSprite(FX.spark, e.x, e.y, 76, 10, { grow: .008 }); for (let i = 0; i < 6; i++) this.spawn(e.x, e.y, CHUNK[i % 2], { size: .8, life: 16, v: 8 }); this.zoomPunch = Math.max(this.zoomPunch, .012); if ((e.a ?? 0) >= 12) this.floatText(e.x - s.camX, e.y - 26, String(e.a), 0xffe27a, 20); break;
      case 'die': this.corpse(e); this.fxSprite(FX.spark, e.x, e.y, 60, 8); for (let i = 0; i < 8; i++) this.spawn(e.x, e.y, CHUNK[i % CHUNK.length], { size: 1, life: 30, v: 7, g: .32, vy: -3 }); break;
      case 'boom': this.boom(e.x, e.y, e.a ?? 80); break;
      case 'dust': case 'land': case 'jump': case 'jump2': case 'dash': this.fxSprite(FX.dust, e.x, e.y - 8, e.k === 'land' ? 58 : 38, 14, { vy: -.3 }); break;
      case 'parry': this.fxSprite(FX.slash, e.x, e.y, 70, 8); this.floatText(e.x - s.camX, e.y, '¡DEVUELTA!', 0x7fe8ff, 18); break;
      case 'clang': case 'spark': for (let i = 0; i < 4; i++) this.spawn(e.x, e.y, 0xffe27a, { size: .5, life: 12, v: 5, g: .2 }); break;
      case 'crate': for (let i = 0; i < 9; i++) this.spawn(e.x, e.y, 0xb07a3f, { size: 1.3, life: 34, v: 6, g: .35, vy: -3 }); break;
      case 'hurt': this.flash.tint = 0xff2030; this.flash.alpha = .18; this.fxSprite(FX.spark, e.x, e.y, 48, 7); break;
      case 'revive': this.fxSprite(FX.heal, e.x, e.y, 90, 34, { vy: -.6 }); break;
      case 'pickup': case 'rescue': for (let i = 0; i < 8; i++) this.spawn(e.x, e.y, 0xffe27a, { tex: this.glow, size: .35, life: 24, v: 3.2, vy: -1.5, add: true }); break;
      case 'special': this.flash.tint = 0xffffff; this.flash.alpha = .4; this.zoomPunch = .05; this.floatText(W / 2, 130, (e.s ?? '').toUpperCase() + '!', CHARS[e.a ?? 0].color, 44); break;
      case 'bossdie': this.flash.tint = 0xffffff; this.flash.alpha = .8; this.zoomPunch = .08; for (let i = 0; i < 6; i++) this.boom(e.x + (Math.random() - .5) * 170, e.y + (Math.random() - .5) * 90, 90 + Math.random() * 60); break;
      case 'boss': this.floatText(W / 2, 170, e.s ?? '', 0xff5a4e, 40); this.shakeExtra = 18; break;
      case 'bosswarn': this.floatText(W / 2, 220, '¡ATENCIÓN!', 0xffd23f, 50); break;
      case 'warn': this.spawn(e.x, e.y, 0xff3030, { tex: this.glow, size: 1.6, life: 16, v: 0, add: true }); break;
      case 'text': this.floatText(e.x, e.y, e.s ?? '', 0xffe27a, 26); break;
      case 'levelstart': this.floatText(W / 2, 200, LEVELS[s.levelIdx].name, 0xffffff, 44); break;
    }
  }
}
