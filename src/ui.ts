import { CHARS, ENDING, ENEMIES, STORY } from './sim/data';
import type { StoryLine } from './sim/data';
import { LEVELS } from './sim/levels';
import { MISSION_RECORDS } from './sim/records';
import { missionResult } from './sim/sim';
import type { GameState } from './sim/sim';

export type MenuView = 'main' | 'keys' | 'join' | 'creating' | 'missions' | 'settings';
export interface UiContext {
  s: GameState;
  mode: 'menu' | 'local' | 'host' | 'guest';
  menuView: MenuView;
  paused: boolean;
  netDown: boolean;
  room: string;
  guestSlot: number;
  localSlot: number;
  portraits: string[];
  error: string;
  muted: boolean;
  reducedMotion: boolean;
  lowFx: boolean;
  best: number;
  touch: boolean;
  connecting: boolean;
  medals?: readonly number[];
}

const asset = (name: string) => `${import.meta.env.BASE_URL}arte/${name}.webp`;
const scenes = ['barrio', 'puerto', 'tren', 'torre', 'nave'];
const routeNames = ['Barrio', 'Puerto', 'Tren', 'Torre', 'Nodriza'];
const routeColors = ['#ffc266', '#7ce6c9', '#ff9f76', '#b5a2ff', '#ffc073'];
const scene = (i: number) => `--scene:url('${asset(`fondo${i + 1}-${scenes[i]}`)}');--scene-accent:${routeColors[i]}`;
const points = (score: number) => score.toLocaleString('es-UY');
const number = (i: number) => String(i + 1).padStart(2, '0');
const timeAt = (ticks: number) => {
  const seconds = Math.floor(ticks / 60);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

export const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

const button = (action: string, label: string, primary = false) =>
  `<button class="m${primary ? '' : ' alt'}" data-a="${action}">${label}</button>`;

const footer = (...actions: string[]) => `<div class="row">${actions.join('')}</div>`;
const heading = (title: string, note = '') =>
  `<header class="screen-head"><h2>${title}</h2>${note ? `<p class="note">${note}</p>` : ''}</header>`;

const panel = (className: string, content: string) => `<section class="screen ${className}">${content}</section>`;
const setting = (action: string, label: string, on: boolean, onLabel: string, offLabel: string) =>
  `<button class="m alt setting" data-a="${action}" aria-pressed="${on}">
    <span>${label}</span><b>${on ? onLabel : offLabel}</b>
  </button>`;

const controls = [
  ['Mover', 'W A S D', '← ↑ ↓ →', 'Stick / Cruz'],
  ['Disparar', 'J', ',', 'X / RT'],
  ['Saltar', 'K', '.', 'A'],
  ['Golpear', 'L', '/', 'B'],
  ['Especial', 'I', 'Ñ', 'Y'],
  ['Esquivar', 'U', 'Shift der.', 'LB / LT'],
  ['Granada', 'O', 'Enter', 'RB'],
];

export const KEYS = `<div class="keys">
  <table aria-label="Controles por dispositivo">
    <thead><tr><th scope="col">Acción</th><th scope="col">Teclado 1</th><th scope="col">Teclado 2</th><th scope="col">Mando</th></tr></thead>
    <tbody>${controls.map(([action, ...keys]) => `<tr><th scope="row">${action}</th>${keys.map(key => `<td><kbd>${key}</kbd></td>`).join('')}</tr>`).join('')}</tbody>
  </table>
  <div class="combat-guide">
    <h3>Ganá espacio</h3>
    <p>Golpeá un proyectil para devolverlo. Golpeá en el aire para caer en picada.</p>
    <p>Esquivá a tiempo para potenciar tu próximo impacto. Alterná jugadores sobre el mismo enemigo para coordinar un golpe de equipo.</p>
    <h3>Cuidá a la cuadrilla</h3>
    <p>Quedate al lado de un compañero caído para levantarlo. Rescatá prisioneros para conseguir suministros.</p>
  </div>
</div>`;

function route(index: number, completed = false) {
  return `<ol class="mission-route" aria-label="Ruta de campaña">
    ${LEVELS.map((lv, i) => {
      const done = i < index || (completed && i === index);
      return `<li class="${done ? 'done' : i === index ? 'current' : ''}"${i === index && !completed ? ' aria-current="step"' : ''} title="${esc(lv.name)}">
        <b aria-hidden="true">${done ? '✓' : number(i)}</b><span>${routeNames[i]}</span>
      </li>`;
    }).join('')}
  </ol>`;
}

function tally(entries: ReadonlyArray<readonly [string, number | string]>, label: string) {
  return `<dl class="tally" aria-label="${label}">
    ${entries.map(([name, value]) => `<div><dt>${name}</dt><dd>${value}</dd></div>`).join('')}
  </dl>`;
}

function campaignTally(s: GameState) {
  return tally([
    ['Bajas', s.stats.kills], ['Rescates', s.stats.rescued], ['Mejor combo', s.stats.bestCombo],
    ['Proyectiles devueltos', s.stats.parries], ['Esquivas perfectas', s.stats.dodges], ['Tiempo activo', timeAt(s.stats.ticks)],
  ], 'Estadísticas acumuladas de campaña');
}

function title(c: UiContext) {
  return panel('title', `
    <header class="title-top">
      <span class="brand-mark" aria-label="Turno Noche"><i aria-hidden="true"></i><span>TURNO<br>NOCHE</span></span>
      <div class="title-utils">
        ${button('keys', 'Cómo jugar')}
        ${button('settings', 'Ajustes')}
        <button class="icon-btn fullscreen-btn" data-a="fullscreen" aria-label="Pantalla completa">⛶</button>
      </div>
    </header>
    <div class="cover-art" style="background-image:url('${asset('portada')}')" aria-hidden="true"></div>
    <div class="title-content">
      <h1 class="logo">Turno <span>Noche</span></h1>
      <p class="title-tag">Se robaron el sol.<br>Nos dejaron las horas extra.</p>
      <div class="main-actions">
        <button class="m primary" data-a="local"><span>Entrar de turno<small>Campaña local</small></span><b aria-hidden="true">↗</b></button>
        <div class="online-actions">${button('host', 'Crear sala online')}${button('join', 'Tengo un código')}</div>
      </div>
      <p class="err" role="alert">${esc(c.error)}</p>
    </div>
    <footer class="title-bottom">
      <span class="title-players"><i class="live-dot" aria-hidden="true"></i> 1–4 jugadores <span>· Local y online</span></span>
      <button class="text-btn" data-a="missions">Ver las 5 misiones <span aria-hidden="true">↗</span></button>
      <span class="record">Récord local <b>${points(c.best)}</b></span>
    </footer>`);
}

function menu(c: UiContext) {
  switch (c.menuView) {
    case 'keys':
      return panel('controls-screen', `${heading('Cómo jugar', 'Esc o P abre la pausa. M cambia el sonido.')}
        ${KEYS}<p class="note controls-note">Con mando, usá la cruz y A para elegir en los menús. Start abre la pausa.</p>
        ${button('back', 'Volver al inicio', true)}`);
    case 'settings':
      return panel('settings-screen', `${heading('Ajustes', 'Tus preferencias se guardan en este dispositivo.')}
        <div class="settings-list">
          ${setting('sound', 'Sonido', !c.muted, 'Encendido', 'Apagado')}
          ${setting('motion', 'Movimiento reducido', c.reducedMotion, 'Sí', 'No')}
          ${setting('quality', 'Efectos livianos', c.lowFx, 'Sí', 'No')}
          ${button('fullscreen', 'Pantalla completa <b aria-hidden="true">⛶</b>')}
        </div>${button('back', 'Listo', true)}`);
    case 'join':
      return panel('join-screen', `${heading('Entrar a una sala', 'Pedile el código de cinco letras a quien creó la partida.')}
        <div class="code-box">
          <label for="code">Código de sala</label>
          <input class="code" id="code" maxlength="5" placeholder="ABCDE" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-describedby="room-error">
        </div>
        <p class="err" id="room-error" role="alert">${esc(c.error)}</p>
        ${footer(button('back', 'Volver'), button('dojoin', 'Entrar al turno →', true))}`);
    case 'creating':
      return panel('connection-screen', `<div class="loader" aria-hidden="true"></div>
        <div role="status">${heading(c.connecting ? 'Buscando la sala…' : 'Preparando el turno…')}</div>
        ${button('cancelnet', 'Cancelar')}`);
    case 'missions':
      return panel('dossier', `${heading('La ruta del amanecer', 'Cinco misiones para recuperar el sol.')}
        <div class="missions">${LEVELS.map((lv, i) => {
          const boss = lv.arenas.find(a => a.boss)?.boss;
          const open = i === 0 || (c.medals?.[i - 1] ?? 0) > 0;
          const medal = ['', 'B', 'A', 'S'][c.medals?.[i] ?? 0];
          return `<article style="${scene(i)}"><div class="mission-card-top"><span class="mission-number">${number(i)}</span>
            ${medal ? `<b class="mission-medal" aria-label="Mejor rango ${medal}">${medal}</b>` : ''}</div><div>
            <h3>${esc(lv.name)}</h3><p>${esc(lv.objective)}</p>
            ${boss ? `<p class="mission-boss">${esc(ENEMIES[boss].name ?? '')}</p>` : ''}
            ${open ? `<button class="m alt mission-replay" data-a="replay-${i}" aria-label="Jugar ${esc(lv.name)}">Jugar misión ↗</button>`
              : '<span class="mission-replay" aria-disabled="true">Completá la anterior</span>'}
          </div></article>`;
        }).join('')}</div>
        ${footer(button('back', 'Volver'), button('local', 'Entrar de turno →', true))}`);
    default:
      return title(c);
  }
}

function selection(c: UiContext) {
  const players = c.s.players.filter(p => p.joined);
  const allReady = players.length > 0 && players.every(p => p.ready);
  const me = c.s.players[c.mode === 'guest' ? c.guestSlot : c.localSlot];
  const cards = CHARS.map((ch, i) => {
    const here = players.filter(p => p.cursor === i);
    const owner = here.find(p => p.ready);
    const locked = !!owner && owner.slot !== me?.slot;
    const status = owner ? (locked ? `J${owner.slot + 1} · Reservado` : 'Ya elegiste') : here.length ? here.map(p => `J${p.slot + 1}`).join(' · ') : '';
    const color = ch.color.toString(16).padStart(6, '0');
    return `<button class="card${here.length ? ' hot' : ''}${owner ? ' confirmed' : ''}${locked ? ' locked' : ''}"
      data-card="${i}" style="--c:#${color}" ${locked ? 'disabled' : ''} aria-label="${ch.name}${owner ? `, reservado por jugador ${owner.slot + 1}` : ', elegir personaje'}">
      <div class="portrait-wrap"><img src="${c.portraits[i] ?? ''}" alt="" width="136" height="136"><span>${status}</span></div>
      <span class="card-role">${ch.role}</span>
      <strong class="card-name">${ch.name}</strong>
      <p class="char-desc">${ch.desc}</p>
      <div class="stat" aria-label="Vida ${ch.hp}, velocidad ${ch.speed}">
        <span>Vida</span><i style="--stat:${ch.hp / 1.4}%"></i>
        <span>Velocidad</span><i style="--stat:${ch.speed / 5.1 * 100}%"></i>
      </div>
      <div class="special-info"><strong><span aria-hidden="true">✦</span> ${ch.special}</strong><p>${ch.specialDesc}</p></div>
    </button>`;
  }).join('');
  const roster = c.s.players.map(p => `<li class="roster-slot${p.joined ? ' joined' : ''}${p.ready ? ' ready' : ''}">
    <b>J${p.slot + 1}</b><span>${p.joined ? CHARS[p.cursor].name : 'Lugar libre'}</span>${p.joined ? `<i>${p.ready ? 'Listo ✓' : 'Eligiendo'}</i>` : ''}
  </li>`).join('');
  const tip = c.mode === 'guest' ? `Sos J${c.guestSlot + 1}. El anfitrión arranca cuando todos estén listos.`
    : c.mode === 'host' ? 'Compartí la invitación y arrancá cuando todos estén listos.'
    : c.touch ? 'Tocá una carta para confirmar tu personaje.' : 'Sumá jugadores con J, coma o A. En mando, apretá Start cuando todos estén listos.';
  return panel('select-screen', `<header class="selection-heading">
    <h2>Armá la cuadrilla<span>.</span></h2>
    <div class="lobby-meta">${c.room ? `<span>Sala <b class="roomcode">${esc(c.room)}</b></span>
      <button class="icon-btn" data-a="invite">Copiar invitación ↗</button>` : '<span>Cooperativo local</span>'}</div>
    </header>
    <ol class="roster" aria-label="Cuadrilla">${roster}</ol>
    <div class="cards">${cards}</div>
    <footer class="selection-footer">
      <p class="hint">${tip}</p>
      ${footer(button('reload', 'Salir'), me?.ready ? button('unready', 'Cambiar personaje') : '',
        c.mode !== 'guest' ? `<button class="m" data-a="begin" ${allReady ? '' : 'disabled'}>Arrancar turno →</button>` : '')}
    </footer>`);
}

function dialogue(c: UiContext, line: StoryLine, total: number, next: string) {
  const char = CHARS.findIndex(ch => ch.name === line.who);
  const portrait = char < 0
    ? '<div class="speaker-mark" aria-hidden="true">✦</div>'
    : `<img src="${c.portraits[char] ?? ''}" alt="" width="84" height="84">`;
  const steps = Array.from({ length: total }, (_, i) => `<i class="${i === c.s.line ? 'current' : ''}"></i>`).join('');
  return `<div class="bubble">
    ${portrait}
    <div class="speech" aria-live="polite"><b>${esc(line.who)}</b><p>${esc(line.text)}</p></div>
    <div class="dialogue-actions">
      <span class="dialogue-route" aria-label="Diálogo ${c.s.line + 1} de ${total}">${steps}</span>
      ${button('next', next, true)}
    </div>
  </div>`;
}

export function screenHtml(c: UiContext): string {
  const { s } = c;
  if (c.mode === 'menu') return menu(c);
  if (c.netDown) return panel('connection-screen', `${heading('Se cortó la conexión', 'La sala dejó de responder. Podés volver al inicio y reunir al equipo.')}
    ${button('reload', 'Volver al inicio', true)}`);
  if (c.paused) return panel('pause-screen', `${heading(c.mode === 'local' ? 'Pausa para el mate.' : 'Menú de partida',
    c.mode === 'local' ? '' : 'La partida sigue en marcha para el resto del equipo.')}
    ${KEYS}${footer(button('reload', 'Salir al inicio'), button('sound', c.muted ? 'Activar sonido' : 'Silenciar'), button('resume', 'Volver al turno →', true))}`);

  const lv = LEVELS[s.levelIdx];
  if (s.phase === 'select') return selection(c);
  if (s.phase === 'story') {
    const lines = STORY[s.levelIdx];
    const line = lines[s.line];
    if (!line) return '';
    return `<section class="screen story" style="${scene(s.levelIdx)}">
      ${route(s.levelIdx)}
      <header class="briefing">
        <p class="chapter">${number(s.levelIdx)} / ${LEVELS.length} · Misión</p>
        <h2>${esc(lv.name)}</h2>
        <p>${esc(lv.objective)}</p>
        <p class="briefing-record">${MISSION_RECORDS[s.levelIdx].name} · ${MISSION_RECORDS[s.levelIdx].positions.length} para encontrar</p>
      </header>
      ${dialogue(c, line, lines.length, s.line === lines.length - 1 ? 'Empezar →' : 'Seguir →')}
      <p class="more">${c.touch ? 'Tocá el botón para seguir.' : 'Salto o disparo para seguir'}</p>
    </section>`;
  }
  if (s.phase === 'clear') {
    const { rank, records, ticks, falls } = missionResult(s);
    const recordGoal = MISSION_RECORDS[s.levelIdx];
    return `<section class="screen results" style="${scene(s.levelIdx)}">
      ${route(s.levelIdx, true)}
      <div class="result-heading"><span class="rank" aria-label="Rango ${rank}">${rank}</span>
        <div><p class="chapter">Misión ${number(s.levelIdx)} completada</p><h2>${esc(lv.name)}</h2>
        <p class="bignum">${points(s.score)} <small>PTS DE CAMPAÑA</small></p></div>
      </div>
      ${tally([[recordGoal.name, `${records} / ${recordGoal.positions.length}`], ['Caídas', falls], ['Tiempo de misión', timeAt(ticks)]], 'Resultado de la misión')}
      ${s.replay ? button('reload', 'Volver al inicio', true)
        : button('next', s.levelIdx === LEVELS.length - 1 ? 'Devolvé el amanecer →' : 'Siguiente misión →', true)}
    </section>`;
  }
  if (s.phase === 'gameover') {
    const retry = s.atBoss ? 'El jefe conserva el daño recibido.'
      : s.checkpoint ? 'Volvés al último punto de control.' : 'Volvés al comienzo de la misión.';
    return panel('results gameover', `${heading('Nos vemos en cinco.', `${retry} Continuar cuesta la mitad del puntaje.`)}
      <p class="bignum">${points(s.score)} <small>PTS</small></p>${campaignTally(s)}
      ${footer(button('reload', 'Cerrar el turno'), button('next', 'Continuar →', true))}`);
  }
  if (s.phase === 'ending') {
    const line = ENDING[s.line];
    return panel('dawn', line
      ? `${heading('Al fin salió el sol.')}${dialogue(c, line, ENDING.length, 'Seguir →')}`
      : `${route(LEVELS.length - 1, true)}${heading('Fin del turno')}
        <p class="bignum">${points(s.score)} <small>PTS FINALES</small></p>
        ${campaignTally(s)}<p class="note">Un juego de Nahuel Benítez.</p>
        ${button('next', 'Otra noche más →', true)}`);
  }
  return `<div class="play-tools">
    <span id="net-status"></span>
    <button class="icon-btn" data-a="sound" aria-label="Sonido" aria-pressed="${!c.muted}">${c.muted ? 'SONIDO OFF' : 'SONIDO ON'}</button>
    <button class="icon-btn" data-a="pause" aria-label="${c.mode === 'local' ? 'Pausa' : 'Menú de partida'}">Ⅱ</button>
  </div>`;
}
