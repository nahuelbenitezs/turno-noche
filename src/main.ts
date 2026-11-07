// Une todo: bucle de juego, pantallas (DOM), modos local / host / invitado.
import './style.css';
import { Audio2 } from './audio';
import { Inputs, setupTouch } from './input';
import { HostSession, decodeSnapshot, encodeSnapshot, hostRoom, joinRoom, normalizeCode } from './net/net';
import { Renderer } from './render/renderer';
import { botInput } from './sim/bot';
import { BTN, CHARS, ENDING, ENEMIES, H, STORY, W, WEAPONS, pickBits } from './sim/data';
import { LEVELS } from './sim/levels';
import { Ev, GameState, active, createGame, step } from './sim/sim';

const $ = <T extends HTMLElement>(q: string) => document.querySelector<T>(q)!;
const stage = $('#stage'), ui = $('#ui'), hud = $('#hud'), touch = $('#touch');
const q = new URLSearchParams(location.search);
type Mode = 'menu' | 'local' | 'host' | 'guest';
let mode: Mode = 'menu', s: GameState = createGame((Math.random() * 1e9) | 0), paused = false, menuView: 'main' | 'keys' | 'join' | 'creating' = 'main', errorMsg = '';
const r = new Renderer(), audio = new Audio2(), inp = new Inputs();
let session: HostSession | null = null, roomCode = '', closeNet: (() => void) | null = null, guestLink: any = null, guestSlot = -1, lastSnapT = 0, netDown = false;
const botOn = q.has('bot'); const portraits: string[] = [];
const touchDevice = q.has('touch') || matchMedia('(pointer:coarse)').matches;

function fit() {
  const vw = innerWidth, vh = innerHeight, k = Math.min(vw / W, vh / H);
  stage.style.transform = `scale(${k})`; stage.style.left = `${(vw - W * k) / 2}px`; stage.style.top = `${Math.max(0, (vh - H * k) / 2)}px`;
}
addEventListener('resize', fit); fit();

// ---------- Eventos de juego ----------
function drain() {
  for (const e of s.events) handle(e);
  if (mode === 'host') pending.push(...s.events);
  s.events = [];
}
let pending: Ev[] = [];
function handle(e: Ev) {
  r.fx(e, s); audio.play(e);
  if (e.k === 'boss') audio.boss = true;
  if (e.k === 'levelstart') { audio.boss = false; audio.level = s.levelIdx; audio.playing = true; }
  if (e.k === 'phase' && e.s === 'ending') audio.playing = false;
  if (e.k === 'phase' && (e.s === 'select')) { audio.playing = false; }
}
const freeSlots = () => [0, 1, 2, 3].filter(i => !session?.links.has(i));
function inputs(): (number | null)[] {
  const canJoin = s.phase === 'select' || s.phase === 'play';
  const local = inp.slots(() => freeSlots().filter(i => !s.players[i].connected || !s.players[i].joined), canJoin && !botOn);
  if (botOn) { const n = Math.max(1, Math.min(4, +(q.get('bot') || 1) || 1)); return [0, 1, 2, 3].map(i => i < n ? (s.phase === 'select' ? (s.players[i].ready ? 0 : pickBits(i)) : botInput(s, i)) : null); }
  if (session) for (let i = 0; i < 4; i++) if (session.links.has(i)) local[i] = session.inputs[i];
  return local;
}
function tick() {
  if (mode === 'menu' || paused) return;
  if (mode === 'guest') { const m = inp.merged(); if (guestLink) guestLink.send({ t: 'input', i: m }); return; }
  step(s, inputs()); drain();
  if (mode === 'host' && session && s.tick % 3 === 0) { const ev = s.events; s.events = pending; session.broadcast(s); s.events = ev; pending = []; }
}
// ---------- Bucle ----------
let last = performance.now(), acc = 0; const STEP = 1000 / 60; const speed = Math.max(1, +(q.get('speed') || 1));
let lastRaf = 0;
function advance(now: number) {
  acc = Math.min(acc + (now - last) * speed, 400 * speed); last = now;
  let n = 0; while (acc >= STEP && n < 30 * speed) { tick(); acc -= STEP; n++; }
}
// Con la pestaña en segundo plano el navegador frena la animación: la sala online no debe trabarse por eso.
setInterval(() => { if (performance.now() - lastRaf > 120) advance(performance.now()); }, 50);
function frame(now: number) {
  lastRaf = performance.now(); advance(lastRaf);
  if (mode !== 'menu') { r.draw(s); updateHud(); }
  renderUi();
  requestAnimationFrame(frame);
}
// ---------- Barra de estado ----------
const FOE: Record<string, string> = { grunt: 'Cadete', rusher: 'Mordedor', flyer: 'Dron', shield: 'Escudero', lobber: 'Tirador', turret: 'Torreta', exploder: 'Petardo', heavy: 'Supervisor' };
const P_COL = ['#ff5a4e', '#4ea8ff', '#7dff6a', '#ffd23f'];
let hudBuilt = false;
function buildHud() {
  hudBuilt = true;
  hud.innerHTML = [0, 1, 2, 3].map(i => `<div class="ph" id="ph${i}" style="--p:${P_COL[i]};left:${6 + i * 238}px" hidden><div class="n"><span class="nm"></span><span class="st"></span></div><div class="bar"><i class="hp"></i></div><div class="bar mt"><i class="me"></i></div><div class="w"></div></div>`).join('') + `<div id="center"><span id="score"></span> · <span id="lives"></span><br><span id="combo"></span></div><div id="hits"></div><div id="foe" hidden><div id="fn"></div><div class="bar"><i id="fh"></i></div></div><div id="bossbar" hidden><div id="bn"></div><div class="bar"><i id="bh"></i></div></div>`;
}
function updateHud() {
  const inPlay = s.phase === 'play' || s.phase === 'clear' || s.phase === 'gameover';
  hud.hidden = !inPlay; touch.hidden = !(inPlay && touchDevice && s.phase === 'play') || paused;
  if (!inPlay) return; if (!hudBuilt) buildHud();
  for (const p of s.players) {
    const el = $(`#ph${p.slot}`); el.hidden = !p.joined; if (!p.joined) continue;
    const c = CHARS[p.char]; el.classList.toggle('dn', p.down || p.out);
    el.querySelector('.nm')!.textContent = `J${p.slot + 1} ${c.name}`;
    el.querySelector('.st')!.textContent = p.out ? 'FUERA' : p.down ? 'CAÍDO' : p.vehicle ? 'BLINDADA' : '';
    (el.querySelector('.hp') as HTMLElement).style.width = `${(p.vehicle ? Math.min(100, p.vehicle / 1.2) : p.hp / p.maxHp * 100)}%`;
    (el.querySelector('.me') as HTMLElement).style.width = `${p.meter}%`; el.querySelector('.mt')!.classList.toggle('full', p.meter >= 100);
    el.querySelector('.w')!.textContent = (p.meter >= 100 ? '★ ESPECIAL · ' : '') + WEAPONS[p.weapon].name + (p.ammo ? ` ${p.ammo}` : '');
  }
  $('#score').textContent = String(s.score).padStart(7, '0'); $('#lives').textContent = `♥ ${s.lives}`;
  $('#combo').textContent = ''; $('#hits').textContent = s.combo >= 2 ? `${s.combo} Golpes` : '';
  const foe = s.enemies.find(e => e.id === s.lastHit && e.id !== s.bossId); $('#foe').hidden = !foe; if (foe) { $('#fn').textContent = FOE[foe.type] ?? ''; $('#fh').style.width = `${foe.hp / foe.maxHp * 100}%`; }
  const b = s.enemies.find(e => e.id === s.bossId); const bb = $('#bossbar'); bb.hidden = !b;
  if (b) { $('#bn').textContent = ENEMIES[b.type].name ?? ''; $('#bh').style.width = `${b.hp / b.maxHp * 100}%`; }
}
// ---------- Pantallas ----------
let uiKey = '';
const safe = (x: string) => x.replace(/[<>&]/g, '');
function renderUi() {
  const key = screenKey(); if (key === uiKey) return; uiKey = key;
  const html = screenHtml(); ui.innerHTML = html; bindUi();
}
function screenKey() {
  if (mode === 'menu') return `menu:${menuView}:${errorMsg}`;
  if (paused) return 'paused';
  if (netDown) return 'netdown';
  switch (s.phase) {
    case 'select': return 'sel:' + roomCode + ':' + s.players.map(p => [p.joined, p.ready, p.cursor]).join('|') + inp.padCount + guestSlot;
    case 'story': return `story:${s.levelIdx}:${s.line}`;
    case 'ending': return `end:${s.line}`;
    case 'clear': case 'gameover': return `${s.phase}:${s.levelIdx}`;
    default: return 'play';
  }
}
const KEYS = `<div class="keys"><div><h3>Teclado jugador 1</h3>Mover <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><br>Disparar <kbd>J</kbd> · Saltar <kbd>K</kbd><br>Golpe <kbd>L</kbd> · Especial <kbd>I</kbd> · Esquivar <kbd>U</kbd></div><div><h3>Teclado jugador 2</h3>Mover <kbd>←↑↓→</kbd><br>Disparar <kbd>,</kbd> · Saltar <kbd>.</kbd><br>Golpe <kbd>/</kbd> · Especial <kbd>Ñ</kbd> · Esquivar <kbd>Shift der.</kbd></div><div><h3>Mandos 1 a 4</h3>Stick o cruz · <kbd>A</kbd> saltar<br><kbd>X</kbd> o <kbd>RT</kbd> disparar · <kbd>B</kbd> golpe<br><kbd>Y</kbd> especial · <kbd>LB</kbd> <kbd>RB</kbd> esquivar</div></div><p class="note">Golpe en el aire: picada · Golpear una bala la devuelve · Golpe sobre la Zorra Blindada te subís · Abajo + saltar te bajás · Parate al lado de un caído para levantarlo.</p>`;
function screenHtml(): string {
  if (mode === 'menu') {
    if (menuView === 'keys') return `<div class="screen"><h2>Controles</h2>${KEYS}<button class="m" data-a="back">Volver</button></div>`;
    if (menuView === 'join') return `<div class="screen"><h2>Unirse a una sala</h2><input class="code" id="code" maxlength="5" placeholder="ABCDE" autocomplete="off" aria-label="Código de sala"><p class="err">${safe(errorMsg)}</p><div class="row"><button class="m" data-a="dojoin">Entrar</button><button class="m alt" data-a="back">Volver</button></div></div>`;
    if (menuView === 'creating') return `<div class="screen"><h2>Creando sala…</h2></div>`;
    return `<div class="screen title" style="background-image:url(${import.meta.env.BASE_URL}arte/menu-principal.gif)"><h1 class="logo">TURNO <span>NOCHE</span></h1><div class="row menu2"><button class="m" data-a="local">Jugar en esta pantalla</button><button class="m alt" data-a="host">Crear sala</button><button class="m alt" data-a="join">Unirse</button><button class="m alt" data-a="keys">Controles</button></div><p class="err">${safe(errorMsg)}</p><p class="rotate">Se juega mejor con el celular acostado.</p></div>`;
  }
  if (netDown) return `<div class="screen"><h2>Se cortó la sala</h2><p class="note">Se perdió la conexión con quien creó la partida.</p><button class="m" data-a="reload">Volver al inicio</button></div>`;
  if (paused) return `<div class="screen"><h2>Pausa</h2>${KEYS}<div class="row"><button class="m" data-a="resume">Seguir</button><button class="m alt" data-a="sound">${audio.muted ? 'Activar sonido' : 'Silenciar'}</button><button class="m alt" data-a="reload">Salir</button></div></div>`;
  switch (s.phase) {
    case 'select': {
      const cards = CHARS.map((c, i) => { const here = s.players.filter(p => p.joined && p.cursor === i); const col = `#${c.color.toString(16).padStart(6, '0')}`; return `<button class="card ${here.length ? 'hot' : ''}" data-card="${i}" style="--c:${col}"><div class="tags">${here.map(p => `<span class="ptag ${p.ready ? 'ok' : ''}" style="--p:${P_COL[p.slot]}">J${p.slot + 1}</span>`).join('')}</div><img src="${portraits[i]}" alt="" width="96" height="96" style="align-self:center"><b>${c.name}</b><small>${c.role}</small><div class="stat"><span>Vida</span><i style="width:${c.hp / 1.4}%"></i><span>Velocidad</span><i style="width:${c.speed * 19}%"></i><span>Golpe</span><i style="width:${c.meleeDmg * 3.5}%"></i></div><p>${c.desc}</p><div class="sp">★ ${c.special}</div><p>${c.specialDesc}</p></button>`; }).join('');
      const n = active(s).length, ready = s.players.filter(p => p.joined && p.ready).length;
      const hint = mode === 'guest' ? `Sos el jugador ${guestSlot + 1}. Elegí con ← → y confirmá con disparar o tocá una carta.` : n === 0 ? (touchDevice ? 'Tocá una carta para empezar' : 'Sumate: <kbd>J</kbd> teclado 1 · <kbd>,</kbd> teclado 2 · <kbd>A</kbd> en un mando · o clic en una carta') : ready < n ? `Jugadores: ${n}/4 · Elegí con izquierda/derecha y confirmá con disparar. Se puede sumar alguien más.` : '¡A trabajar!';
      return `<div class="screen" style="justify-content:flex-start;padding-top:22px"><h2>¿Quién entra de turno?</h2>${roomCode ? `<p class="note">Sala <span class="roomcode">${roomCode}</span> · pasá el código: hasta 3 personas más</p>` : ''}<div class="cards" style="margin-top:10px">${cards}</div><p class="hint">${hint}</p></div>`;
    }
    case 'story': { const l = STORY[s.levelIdx][s.line]; if (!l) return ''; return `<div class="screen story" data-a="next" style="background:radial-gradient(ellipse at 50% 110%,rgba(255,110,70,.3),rgba(11,16,48,.97) 60%)"><h2 style="margin-bottom:auto;margin-top:60px">${LEVELS[s.levelIdx].name}<br><small style="font:600 17px var(--body);color:var(--dim);text-shadow:none">${LEVELS[s.levelIdx].sub}</small></h2><div class="bubble"><b>${l.who}</b><p>${l.text}</p></div><div class="more">Disparar o tocar para seguir ▸</div></div>`; }
    case 'clear': return `<div class="screen" data-a="next"><h2>¡Nivel limpio!</h2><p class="bignum">${s.score.toLocaleString('es-UY')}</p><div class="tally">${stats()}</div><button class="m" data-a="next">${s.levelIdx + 1 >= LEVELS.length ? 'Ver el amanecer' : 'Seguir'}</button></div>`;
    case 'gameover': return `<div class="screen" data-a="next"><h2 style="color:var(--hot)">Fin del turno</h2><p class="tag">El jefe conserva el daño que le hiciste. Continuar te cuesta la mitad del puntaje.</p><button class="m" data-a="next">Continuar</button></div>`;
    case 'ending': { const l = ENDING[s.line]; if (l) return `<div class="screen story" data-a="next" style="background:linear-gradient(#2a1b55,#e0556b 45%,#ffd23f 100%)"><h2 style="margin-bottom:auto;margin-top:42px;font-size:44px;color:#fff">¡Amaneció!</h2><div class="bubble"><b>${l.who}</b><p>${l.text}</p></div><div class="more" style="color:#14101f">Disparar o tocar para seguir ▸</div></div>`; return `<div class="screen" data-a="next" style="background:linear-gradient(#ff9a5a,#ffd23f)"><h1 class="logo" style="font-size:60px">FIN<span>DEL TURNO</span></h1><p class="bignum" style="color:#14101f;text-shadow:none">${s.score.toLocaleString('es-UY')}</p><div class="tally" style="color:#2a1b55">${stats()}</div><p class="note" style="color:#2a1b55">Hecho por Nahuel Benítez. Arte creado con herramientas de IA; sonido sintetizado para este juego.</p><button class="m" data-a="next">Volver a elegir personajes</button></div>`; }
    default: return `<button class="topbtn" data-a="pause" aria-label="Pausa">⏸</button>`;
  }
}
const stats = () => [['Bajas', s.stats.kills], ['Rescatados', s.stats.rescued], ['Mejor combo', s.stats.bestCombo], ['Caídas', s.stats.deaths]].map(([a, b]) => `<div><b>${b}</b>${a}</div>`).join('');
function bindUi() {
  ui.querySelectorAll<HTMLElement>('[data-a]').forEach(el => el.addEventListener('click', e => { e.stopPropagation(); action(el.dataset.a!); }));
  ui.querySelectorAll<HTMLElement>('[data-card]').forEach(el => el.addEventListener('click', () => { audio.unlock(); inp.pick = pickBits(+el.dataset.card!); routeClick(); }));
  const c = document.querySelector<HTMLInputElement>('#code'); if (c) { c.focus(); c.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') action('dojoin'); }); }
}
/** Un clic con mouse no debe crear otro jugador si ya hay alguien con teclado. */
function routeClick() { const t = inp.clickTarget(); if (t !== 'touch') { const bits = inp.pick | inp.pulse; inp.pick = 0; inp.pulse = 0; clickBits = bits; clickTo = t; } }
let clickBits = 0, clickTo = '';
const origRead = inp.read.bind(inp);
inp.read = () => { const m = origRead(); if (clickBits && m.has(clickTo)) { m.set(clickTo, m.get(clickTo)! | clickBits); clickBits = 0; } return m; };
function action(a: string) {
  audio.unlock();
  switch (a) {
    case 'local': mode = 'local'; break;
    case 'host': void startHost(); break;
    case 'join': menuView = 'join'; errorMsg = ''; break;
    case 'keys': menuView = 'keys'; break;
    case 'back': menuView = 'main'; errorMsg = ''; break;
    case 'dojoin': void startGuest(document.querySelector<HTMLInputElement>('#code')?.value ?? ''); break;
    case 'next': inp.pulse = BTN.J; routeClick(); setTimeout(() => { uiKey = ''; }, 900); break;
    case 'pause': paused = true; break;
    case 'resume': paused = false; last = performance.now(); break;
    case 'sound': audio.toggle(); uiKey = ''; break;
    case 'reload': location.href = location.pathname; break;
  }
}
async function startHost() {
  menuView = 'creating';
  try {
    session = new HostSession(() => freeSlots().filter(i => !s.players[i].joined));
    const h = await hostRoom(link => { const slot = session!.add(link); if (slot >= 0) link.send(encodeSnapshot(s)); });
    roomCode = h.code; closeNet = h.close; mode = 'host';
  } catch { session = null; menuView = 'main'; errorMsg = 'No se pudo crear la sala. Revisá la conexión o jugá en esta pantalla.'; }
}
async function startGuest(code: string) {
  const c = normalizeCode(code); if (c.length !== 5) { errorMsg = 'El código tiene 5 letras.'; return; }
  menuView = 'creating';
  try {
    const j = await joinRoom(c); closeNet = j.close; guestLink = j.link; roomCode = c; r.smooth = .45;
    guestLink.onData = (d: any) => {
      if (typeof d === 'string') {
        const next = decodeSnapshot(d); lastSnapT = performance.now(); const ev = next.events; next.events = []; s = next; for (const e of ev) handle(e); return;
      }
      if (d?.t === 'hello') { guestSlot = d.slot; mode = 'guest'; }
      if (d?.t === 'full') { errorMsg = 'La sala está llena.'; menuView = 'main'; mode = 'menu'; }
    };
    guestLink.onClose = () => { netDown = true; };
    setTimeout(() => { if (mode === 'menu') { errorMsg = 'La sala no respondió.'; menuView = 'join'; } }, 6000);
  } catch (e) { menuView = 'join'; errorMsg = (e as Error).message; }
}
addEventListener('keydown', e => {
  audio.unlock();
  if ((e.code === 'Escape' || e.code === 'KeyP') && mode !== 'menu' && s.phase === 'play' && mode === 'local') { paused = !paused; last = performance.now(); }
  if (e.code === 'KeyM' && !(e.target instanceof HTMLInputElement)) audio.toggle();
});
addEventListener('pointerdown', () => audio.unlock());
// Portadas de las cartas, armadas con las mismas texturas del juego
async function makePortraits() {
  for (let i = 0; i < 4; i++) {
    const f = r.portrait(i), fr = f.tex.frame, cv = document.createElement('canvas'); cv.width = cv.height = 192; const c = cv.getContext('2d')!;
    c.drawImage(f.tex.source.resource as CanvasImageSource, fr.x, fr.y, fr.width, fr.height, 0, 0, 192, 192);
    portraits[i] = cv.toDataURL();
  }
}
await r.init(stage);
await makePortraits();
setupTouch(touch, inp);
void H;
// Ganchos de prueba: permiten simular partidas sin depender de que el navegador pinte en primer plano.
(window as any).__tn = {
  get s() { return s; }, get mode() { return mode; }, get room() { return roomCode; },
  start(m: Mode) { mode = m; }, ff(n: number, f?: (s: GameState) => (number | null)[]) { for (let i = 0; i < n; i++) { if (f) { step(s, f(s)); drain(); } else tick(); } r.draw(s); updateHud(); renderUi(); return s.phase; }, bot: botInput, pick: pickBits,
};
if (q.get('start') === 'local' || botOn) mode = 'local';
if (q.has('touch')) touch.dataset.forced = '1';
requestAnimationFrame(t => { last = t; frame(t); });
export { closeNet };
