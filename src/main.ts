import './style.css';
import { Audio2 } from './audio';
import { Inputs, gamepadBits, setupTouch } from './input';
import { HostSession, Link, decodeSnapshot, encodeSnapshot, hostRoom, joinRoom, normalizeCode } from './net/net';
import { Renderer } from './render/renderer';
import { botInput } from './sim/bot';
import { BTN, CHARS, ENEMIES, H, W, WEAPONS, pickBits } from './sim/data';
import { LEVELS } from './sim/levels';
import { MISSION_RECORDS } from './sim/records';
import { Ev, GameState, bossPhase, bossVulnerable, countRecords, createGame, missionResult, step } from './sim/sim';
import { MenuView, screenHtml } from './ui';

const $ = <T extends HTMLElement>(q: string) => document.querySelector<T>(q)!;
const stage = $('#stage'), ui = $('#ui'), hud = $('#hud'), touch = $('#touch');
const q = new URLSearchParams(location.search);
type Mode = 'menu' | 'local' | 'host' | 'guest';
let mode: Mode = 'menu', s = createGame((Math.random() * 1e9) | 0), paused = false, menuView: MenuView = 'main', errorMsg = '';
const r = new Renderer(), audio = new Audio2(), inp = new Inputs();
let session: HostSession | null = null, roomCode = '', closeNet: (() => void) | null = null, guestLink: Link | null = null, guestSlot = -1, lastSnapT = 0, netDown = false;
let netAttempt = 0, connecting = false, best = 0, uiKey = '', pending: Ev[] = [], clickBits = 0, clickTo = '';
const medals = LEVELS.map(() => 0);
const botOn = q.has('bot'), portraits: string[] = [];
const touchDevice = q.has('touch') || matchMedia('(pointer:coarse)').matches;
const preference = (key: string, fallback: boolean) => { try { const value = localStorage.getItem(key); return value === null ? fallback : value === '1'; } catch { return fallback; } };
r.reducedMotion = preference('tn-motion', matchMedia('(prefers-reduced-motion:reduce)').matches);
r.lowFx = preference('tn-lowfx', touchDevice);
try { best = Number(localStorage.getItem('tn-best')) || 0; } catch { /* almacenamiento opcional */ }
try {
  const saved: unknown = JSON.parse(localStorage.getItem('tn-medals') ?? 'null');
  if (Array.isArray(saved)) saved.slice(0, medals.length).forEach((rank, i) => {
    if (rank === 1 || rank === 2 || rank === 3) medals[i] = rank;
  });
} catch { /* almacenamiento opcional */ }
function saveBest() { if (!botOn && !s.replay && s.score > best) { best = s.score; try { localStorage.setItem('tn-best', String(best)); } catch { /* almacenamiento opcional */ } } }
function saveMedal() {
  if (botOn || s.phase !== 'clear') return;
  const rank = ['B', 'A', 'S'].indexOf(missionResult(s).rank) + 1;
  if (rank <= medals[s.levelIdx]) return;
  medals[s.levelIdx] = rank;
  try { localStorage.setItem('tn-medals', JSON.stringify(medals)); } catch { /* almacenamiento opcional */ }
}
function fit() {
  const insets = getComputedStyle(document.documentElement), left = parseFloat(insets.getPropertyValue('--safe-left')) || 0, right = parseFloat(insets.getPropertyValue('--safe-right')) || 0, top = parseFloat(insets.getPropertyValue('--safe-top')) || 0, bottom = parseFloat(insets.getPropertyValue('--safe-bottom')) || 0;
  const vw = innerWidth - left - right, vh = (window.visualViewport?.height ?? innerHeight) - top - bottom, k = Math.min(vw / W, vh / H);
  stage.style.transform = `scale(${k})`; stage.style.left = `${left + (vw - W * k) / 2}px`; stage.style.top = `${top + Math.max(0, (vh - H * k) / 2)}px`;
}
addEventListener('resize', fit); window.visualViewport?.addEventListener('resize', fit); fit();
let toastTimer = 0;
function toast(message: string) { const el = $('#toast'); el.textContent = message; el.classList.add('visible'); clearTimeout(toastTimer); toastTimer = window.setTimeout(() => el.classList.remove('visible'), 2600); }
function handle(e: Ev) {
  if (e.k === 'boss') audio.boss = true;
  if (e.k === 'levelstart') { audio.boss = false; audio.level = s.levelIdx; audio.playing = true; }
  r.fx(e, s); audio.play(e, s.camX + W / 2);
  if (e.k === 'phase' && ['ending', 'select', 'gameover', 'clear'].includes(e.s ?? '')) { audio.playing = false; saveBest(); saveMedal(); }
  if (e.k === 'pickblocked' && (mode !== 'guest' || e.a === guestSlot)) toast('Ese personaje ya fichó. Elegí uno disponible.');
}
function drain() { for (const e of s.events) handle(e); if (mode === 'host') pending.push(...s.events); s.events = []; }
const freeSlots = () => [0, 1, 2, 3].filter(i => !session?.links.has(i));
function inputs(): (number | null)[] {
  const canJoin = s.phase === 'select' || s.phase === 'play';
  const local = inp.slots(() => freeSlots().filter(i => !s.players[i].connected || !s.players[i].joined), canJoin && !botOn && !paused);
  if (botOn) { const n = Math.max(1, Math.min(4, +(q.get('bot') || 1) || 1)); return [0, 1, 2, 3].map(i => i < n ? (s.phase === 'select' ? (s.players[i].ready ? 0 : pickBits(i)) : botInput(s, i)) : null); }
  if (paused) for (let i = 0; i < 4; i++) if (local[i] !== null) local[i] = 0;
  if (session) for (let i = 1; i < 4; i++) if (session.links.has(i)) local[i] = session.take(i);
  return local;
}
function tick() {
  if (mode === 'menu' || (paused && mode === 'local')) return;
  if (mode === 'guest') { const m = inp.merged(); guestLink?.send({ t: 'input', i: paused ? 0 : m }); return; }
  step(s, inputs()); drain();
  if (mode === 'host' && session && s.tick % 3 === 0) { s.events = pending; session.broadcast(s); s.events = []; pending = []; }
}
let last = performance.now(), acc = 0; const STEP = 1000 / 60, speed = Math.max(1, Math.min(20, +(q.get('speed') || 1)));
let lastRaf = 0;
function advance(now: number) {
  session?.reap(now);
  if (mode === 'guest' && lastSnapT && now - lastSnapT > 10000) netDown = true;
  acc = Math.min(acc + (now - last) * speed, 250 * speed); last = now;
  let n = 0; while (acc >= STEP && n < 16 * speed) { tick(); acc -= STEP; n++; }
}
const backgroundTimer = window.setInterval(() => { if (performance.now() - lastRaf > 120) advance(performance.now()); }, 50);
function frame(now: number) {
  lastRaf = now; handleGamepads(); advance(now);
  audio.paused = paused;
  if (mode !== 'menu') { r.draw(s); updateHud(); }
  renderUi(); updateNetwork(); requestAnimationFrame(frame);
}
const P_COL = ['#ff6656', '#55b7ff', '#53e0b9', '#ffdb69'];
const FOE: Record<string, string> = { grunt: 'Cadete', rusher: 'Mordedor', flyer: 'Dron', shield: 'Escudero', lobber: 'Tirador', turret: 'Torreta', exploder: 'Petardo', heavy: 'Supervisor' };
let hudBuilt = false;
function buildHud() {
  hudBuilt = true;
  hud.innerHTML = `<div class="team-hud">${[0, 1, 2, 3].map(i => `<div class="ph" id="ph${i}" style="--p:${P_COL[i]}" hidden><img class="hud-face" alt=""><div class="ph-data"><div class="n"><span class="nm"></span><span class="st"></span></div><div class="bar"><i class="hp"></i></div><div class="bar mt"><i class="meter"></i></div><div class="w"></div></div></div>`).join('')}</div><div class="mission-hud"><span id="mission-name"></span><span id="mission-objective"></span><div class="progress"><i id="mission-progress"></i></div><span id="mission-records"></span></div><div id="center"><small>PUNTAJE</small><b id="score"></b><span id="lives"></span></div><div id="frenzy"><span id="frenzy-label">FRENESÍ DEL EQUIPO</span><div class="bar"><i id="frenzy-fill"></i></div></div><div id="hits"><b id="combo"></b><span id="multiplier"></span><div class="combo-life"><i id="combo-life"></i></div></div><div id="foe" hidden><span id="fn"></span><div class="bar"><i id="fh"></i></div></div><div id="bossbar" hidden><div><span id="boss-attack"></span><b id="bn"></b><span id="boss-phase"></span></div><div class="bar"><i id="bh"></i></div></div>`;
}
let hudState: GameState | undefined, hudTick = -1;
function updateHud() {
  const inPlay = ['play', 'clear', 'gameover'].includes(s.phase);
  hud.hidden = !inPlay; touch.hidden = !(inPlay && touchDevice && s.phase === 'play') || paused || netDown;
  stage.classList.toggle('touch-play', touchDevice && inPlay);
  if (!inPlay || (hudState === s && hudTick === s.tick)) return;
  hudState = s; hudTick = s.tick;
  if (!hudBuilt) buildHud();
  for (const p of s.players) {
    const el = $(`#ph${p.slot}`); el.hidden = !p.joined; if (!p.joined) continue;
    const c = CHARS[p.char]; el.classList.toggle('dn', p.down || p.out);
    const img = el.querySelector<HTMLImageElement>('img')!; if (img.dataset.char !== String(p.char)) { img.src = portraits[p.char]; img.dataset.char = String(p.char); }
    el.querySelector('.nm')!.textContent = `J${p.slot + 1} ${c.name}`;
    el.querySelector('.st')!.textContent = !p.connected ? 'SIN RED' : p.out ? 'FUERA' : p.down ? `AYUDA ${Math.ceil(p.downT / 60)}s` : p.vehicle ? 'BLINDADA' : `${Math.ceil(p.hp)}`;
    el.querySelector<HTMLElement>('.hp')!.style.width = `${Math.max(0, p.vehicle ? Math.min(100, p.vehicle / 1.2) : p.hp / p.maxHp * 100)}%`;
    el.querySelector<HTMLElement>('.meter')!.style.width = `${p.meter}%`; el.querySelector('.mt')!.classList.toggle('full', p.meter >= 100);
    el.querySelector('.w')!.textContent = `${p.counterT > 0 ? '↯ ' : p.meter >= 100 ? '★ ' : ''}${WEAPONS[p.weapon].name}${p.ammo ? ` ${p.ammo}` : ''} · G ${p.grenades}`;
  }
  const lv = LEVELS[s.levelIdx];
  $('#mission-name').textContent = `0${s.levelIdx + 1} / ${lv.name}`;
  const arena = lv.arenas[s.arenaIdx];
  const sector = lv.sections.findLast(section => section.x <= s.camX + W * .5);
  $('#mission-objective').textContent = s.bossId ? 'Derrotá al jefe' : s.arenaOn ? arena?.waveLabels?.[s.wave] ?? arena?.label ?? lv.objective : sector?.label ?? lv.objective;
  $('#mission-progress').style.width = `${Math.min(100, (s.camX + W) / lv.width * 100)}%`;
  $('#mission-records').textContent = `◇ ${countRecords(s)}/${MISSION_RECORDS[s.levelIdx].positions.length} · ${MISSION_RECORDS[s.levelIdx].name}`;
  $('#score').textContent = String(s.score).padStart(7, '0'); $('#lives').textContent = `♥ ${s.lives} vidas de equipo`;
  $('#hits').hidden = s.combo < 2; $('#combo').textContent = `${s.combo} ×`; $('#multiplier').textContent = `COMBO · PUNTOS ×${Math.min(10, 1 + Math.floor(s.combo / 5)) * (s.frenzy > 0 ? 2 : 1)}`;
  $('#combo-life').style.width = `${s.comboT / 170 * 100}%`;
  $('#frenzy').classList.toggle('active', s.frenzy > 0); $('#frenzy-label').textContent = s.frenzy > 0 ? `¡HORAS EXTRA! ${Math.ceil(s.frenzy / 60)}s · PUNTOS ×2` : 'FRENESÍ DEL EQUIPO';
  $('#frenzy-fill').style.width = `${s.frenzy > 0 ? s.frenzy / 480 * 100 : s.frenzyCharge}%`;
  const foe = s.enemies.find(e => e.id === s.lastHit && e.id !== s.bossId); $('#foe').hidden = !foe;
  if (foe) { $('#fn').textContent = FOE[foe.type] ?? ''; $('#fh').style.width = `${Math.max(0, foe.hp / foe.maxHp * 100)}%`; }
  const b = s.enemies.find(e => e.id === s.bossId), bossBar = $('#bossbar'); bossBar.hidden = !b;
  if (b) {
    bossBar.classList.toggle('boss-vulnerable', bossVulnerable(b));
    $('#bn').textContent = ENEMIES[b.type].name ?? '';
    $('#bh').style.width = `${Math.max(0, b.hp / b.maxHp * 100)}%`;
    $('#boss-phase').textContent = `FASE ${bossPhase(b)} / 3`;
    $('#boss-attack').textContent = bossVulnerable(b) ? 'VULNERABLE' : b.attack?.label ?? 'JEFE DE MISIÓN';
  }
  const localP = s.players[mode === 'guest' ? guestSlot : inp.assign.values().next().value ?? 0];
  const grenade = touch.querySelector<HTMLElement>('[data-btn="G"]'); if (grenade && localP) { grenade.dataset.count = String(localP.grenades); grenade.classList.toggle('empty', !localP.grenades); }
  touch.querySelector('[data-btn="X"]')?.classList.toggle('charged', (localP?.meter ?? 0) >= 100);
}
let netUiAt = 0;
function updateNetwork() {
  if (performance.now() - netUiAt < 500) return; netUiAt = performance.now();
  const el = document.getElementById('net-status'); if (!el) return;
  const lag = mode === 'guest' ? guestLink?.latencyMs : session?.links.size ? Math.max(...[...session.links.values()].map(l => l.latencyMs ?? 0)) : 0;
  el.textContent = mode === 'local' ? 'LOCAL' : `● ${roomCode} · ${lag ? `${Math.round(lag)} ms` : 'ONLINE'}`; el.classList.toggle('weak', (lag ?? 0) > 180);
}
function renderUi() {
  stage.classList.toggle('reduced-motion', r.reducedMotion);
  const key = [mode, menuView, paused, netDown, roomCode, guestSlot, errorMsg, connecting, best, audio.muted, r.reducedMotion, r.lowFx, s.phase, s.levelIdx, s.line, s.replay, s.phase === 'select' ? s.players.map(p => `${p.joined}${p.ready}${p.cursor}`).join() : '', inp.padCount].join(':');
  if (key === uiKey) return; uiKey = key;
  const focused = ui.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.a : undefined;
  const codeValue = ui.querySelector<HTMLInputElement>('#code')?.value;
  ui.innerHTML = screenHtml({ s, mode, menuView, paused, netDown, room: roomCode, guestSlot, localSlot: inp.assign.values().next().value ?? 0, portraits, error: errorMsg, muted: audio.muted, reducedMotion: r.reducedMotion, lowFx: r.lowFx, best, touch: touchDevice, connecting, medals });
  ui.querySelectorAll<HTMLElement>('[data-a]').forEach(el => el.addEventListener('click', e => { e.stopPropagation(); action(el.dataset.a!); }));
  ui.querySelectorAll<HTMLButtonElement>('[data-card]').forEach(el => el.addEventListener('click', () => { audio.unlock(); inp.pick = pickBits(+el.dataset.card!); routeClick(); }));
  const code = document.querySelector<HTMLInputElement>('#code');
  if (code) { code.value = codeValue ?? ''; if (!touchDevice) code.focus(); code.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') action('dojoin'); }); }
  if (focused) ui.querySelector<HTMLElement>(`[data-a="${focused}"]`)?.focus({ preventScroll: true });
}
function routeClick() { const t = !touchDevice && inp.assign.size === 0 ? 'kb1' : inp.clickTarget(); if (t !== 'touch') { clickBits = inp.pick | inp.pulse; inp.pick = 0; inp.pulse = 0; clickTo = t; } }
const origRead = inp.read.bind(inp);
inp.read = () => { const m = origRead(); if (clickBits && m.has(clickTo)) { m.set(clickTo, m.get(clickTo)! | clickBits); clickBits = 0; } return m; };
async function fullscreen() {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else { await document.documentElement.requestFullscreen(); if (touchDevice) await (screen.orientation as ScreenOrientation & { lock?: (orientation: string) => Promise<void> }).lock?.('landscape'); } } catch { toast('Podés usar pantalla completa desde el menú del navegador.'); }
}
function cleanupNet() { netAttempt++; session?.close(); closeNet?.(); session = null; closeNet = null; guestLink = null; roomCode = ''; guestSlot = -1; netDown = false; lastSnapT = 0; pending = []; }
function action(a: string) {
  audio.unlock(); audio.play({ k: 'ui', x: 0, y: 0 });
  switch (a) {
    case 'local': s = createGame(); s.autoStart = false; mode = 'local'; paused = false; r.smooth = 1; inp.reset(); inp.assign.clear(); inp.claimPrimary = false; break;
    case 'host': void startHost(); break;
    case 'join': menuView = 'join'; errorMsg = ''; break;
    case 'keys': menuView = 'keys'; break;
    case 'missions': menuView = 'missions'; break;
    case 'settings': menuView = 'settings'; break;
    case 'back': menuView = 'main'; errorMsg = ''; break;
    case 'cancelnet': cleanupNet(); inp.assign.clear(); menuView = 'main'; connecting = false; break;
    case 'dojoin': void startGuest(document.querySelector<HTMLInputElement>('#code')?.value ?? ''); break;
    case 'begin': if (mode !== 'guest' && s.players.some(p => p.joined) && s.players.filter(p => p.joined).every(p => p.ready)) s.startRequested = true; break;
    case 'unready': inp.pulse = BTN.M; routeClick(); break;
    case 'next': inp.pulse = BTN.J; routeClick(); break;
    case 'pause': inp.reset(); paused = true; break;
    case 'resume': inp.reset(); paused = false; last = performance.now(); break;
    case 'sound': audio.toggle(); break;
    case 'motion': r.reducedMotion = !r.reducedMotion; try { localStorage.setItem('tn-motion', r.reducedMotion ? '1' : '0'); } catch { /* opcional */ } break;
    case 'quality': r.lowFx = !r.lowFx; try { localStorage.setItem('tn-lowfx', r.lowFx ? '1' : '0'); } catch { /* opcional */ } break;
    case 'fullscreen': void fullscreen(); break;
    case 'invite': { const url = new URL(location.pathname, location.origin); url.searchParams.set('room', roomCode); if (navigator.clipboard) void navigator.clipboard.writeText(url.href).then(() => toast('Invitación copiada. Pasásela al equipo.'), () => toast(`Código de sala: ${roomCode}`)); else toast(`Código de sala: ${roomCode}`); break; }
    case 'reload': saveBest(); cleanupNet(); inp.reset(); inp.assign.clear(); inp.claimPrimary = false; clickBits = 0; s = createGame(); mode = 'menu'; paused = false; menuView = 'main'; errorMsg = ''; hud.hidden = touch.hidden = true; audio.playing = false; r.smooth = 1; break;
  }
}
async function startHost() {
  cleanupNet(); const attempt = netAttempt; menuView = 'creating'; connecting = false; errorMsg = '';
  inp.assign.clear(); inp.assign.set(touchDevice ? 'touch' : 'kb1', 0); inp.reset(); inp.claimPrimary = true; s = createGame(); s.autoStart = false;
  try {
    const hostSession = new HostSession(() => [1, 2, 3].filter(i => !s.players[i].connected)); session = hostSession;
    const h = await hostRoom(link => { if (attempt !== netAttempt) { link.close(); return; } const slot = hostSession.add(link, performance.now()); if (slot >= 0) link.send(encodeSnapshot(s)); });
    if (attempt !== netAttempt) { h.close(); return; }
    roomCode = h.code; closeNet = h.close; mode = 'host';
  } catch { if (attempt === netAttempt) { cleanupNet(); inp.assign.clear(); menuView = 'main'; errorMsg = 'La central no respondió. Revisá la conexión y volvé a crear la sala.'; } }
}
async function startGuest(code: string) {
  const c = normalizeCode(code); if (c.length !== 5) { errorMsg = 'El código tiene 5 letras.'; return; }
  cleanupNet(); const attempt = netAttempt; menuView = 'creating'; connecting = true; errorMsg = '';
  try {
    const j = await joinRoom(c); if (attempt !== netAttempt) { j.close(); return; }
    closeNet = j.close; guestLink = j.link; roomCode = c; r.smooth = .45;
    guestLink.onClose = () => { if (attempt === netAttempt && mode === 'guest') netDown = true; };
    guestLink.onData = (d: unknown) => {
      if (attempt !== netAttempt) return;
      if (typeof d === 'string') {
        try { const next = decodeSnapshot(d); lastSnapT = performance.now(); const ev = next.events; next.events = []; s = next; for (const e of ev) handle(e); } catch { /* descartar fotos inválidas */ } return;
      }
      const msg = d as { t?: string; slot?: number };
      if (msg?.t === 'hello' && Number.isInteger(msg.slot) && msg.slot! >= 1 && msg.slot! <= 3) { guestSlot = msg.slot!; mode = 'guest'; lastSnapT = performance.now(); inp.reset(); }
      if (msg?.t === 'full') { cleanupNet(); mode = 'menu'; menuView = 'join'; errorMsg = 'La sala está llena. Hay cuatro personas de turno.'; }
    };
    setTimeout(() => { if (attempt === netAttempt && mode === 'menu') { cleanupNet(); menuView = 'join'; errorMsg = 'La sala no respondió. Pedile otro código al anfitrión.'; } }, 6000);
  } catch (e) { if (attempt === netAttempt) { cleanupNet(); menuView = 'join'; errorMsg = (e as Error).message; } }
}
addEventListener('keydown', e => {
  if (e.target instanceof HTMLInputElement) return; audio.unlock();
  if ((e.code === 'Escape' || e.code === 'KeyP') && !e.repeat && mode !== 'menu' && s.phase === 'play') action(paused ? 'resume' : 'pause');
  if (e.code === 'KeyM' && !e.repeat) audio.toggle();
});
addEventListener('pointerdown', () => audio.unlock());
addEventListener('blur', () => { inp.reset(); if (mode === 'local' && s.phase === 'play' && !botOn) paused = true; });
addEventListener('pagehide', () => { saveBest(); cleanupNet(); clearInterval(backgroundTimer); });
addEventListener('pageshow', e => { if (e.persisted) location.reload(); });
async function makePortraits() {
  for (let i = 0; i < 4; i++) {
    const f = r.portrait(i), fr = f.tex.frame, cv = document.createElement('canvas'); cv.width = cv.height = 192; const c = cv.getContext('2d')!;
    c.drawImage(f.tex.source.resource as CanvasImageSource, fr.x, fr.y, fr.width, fr.height, 0, 0, 192, 192); portraits[i] = cv.toDataURL();
  }
}
try {
  await r.init(stage); await makePortraits(); setupTouch(touch, inp); $('#loading').remove();
  if (q.get('start') === 'local' || botOn) mode = 'local';
  if (q.has('room')) { menuView = 'join'; renderUi(); const code = document.querySelector<HTMLInputElement>('#code'); if (code) code.value = normalizeCode(q.get('room')!); }
  requestAnimationFrame(t => { last = t; frame(t); });
} catch { $('#loading').innerHTML = '<h2>El juego no pudo cargar</h2><p>Revisá tu conexión y usá un navegador con WebGL.</p><button onclick="location.reload()">Volver a intentar</button>'; }
(window as any).__tn = {
  get s() { return s; }, get mode() { return mode; }, get room() { return roomCode; },
  start(m: Mode) { mode = m; }, ff(n: number, f?: (s: GameState) => (number | null)[]) { for (let i = 0; i < n; i++) { if (f) { step(s, f(s)); drain(); } else tick(); } r.draw(s); updateHud(); renderUi(); return s.phase; }, bot: botInput, pick: pickBits,
};
export { closeNet };
