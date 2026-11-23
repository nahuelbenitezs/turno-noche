// Tramos, suministros y formaciones de la campaña. Las coordenadas de cada tramo son locales.
import { BossType, EnemyType, H, W, WeaponId } from './data';

export interface Rect { x: number; y: number; w: number; h: number }
export type SpawnKind = { k: 'e'; type: EnemyType } | { k: 'crate' } | { k: 'barrel' } | { k: 'prisoner'; drop: WeaponId | 'food' } | { k: 'vehicle' } | { k: 'pickup'; drop: WeaponId | 'food' };
export type Spawn = SpawnKind & { x: number; y?: number; z?: number };
export interface WaveEnemy { type: EnemyType; side: -1 | 1; z: number; y?: number }
export interface Arena { x: number; waves: WaveEnemy[][]; boss?: BossType; label: string; waveLabels?: string[] }
export type HazardKind = 'steam' | 'electric' | 'obstacle' | 'signal' | 'laser';
export interface Hazard {
  kind: HazardKind; x: number; z: number; w: number; depth: number;
  period: number; on: number; warn: number; offset: number;
  dmg: number; height: number; label: string; alternate: boolean;
}
export interface Section { x: number; label: string }
export interface Level {
  name: string; sub: string; objective: string; theme: number; width: number; solids: Rect[]; plats: Rect[];
  spawns: Spawn[]; arenas: Arena[]; hazards: Hazard[]; sections: Section[]; autoScroll: number;
}

export function hazardZone(h: Hazard, tick: number): { z: number; depth: number } {
  // El ciclo empieza con el aviso para que la zona activa coincida con lo anticipado.
  const cycle = Math.floor((tick + h.offset + h.warn) / h.period);
  return { z: h.alternate && cycle % 2 ? 130 - h.z : h.z, depth: h.depth };
}

const DANGER = {
  steam: { depth: 54, period: 250, on: 48, warn: 55, dmg: 14, height: 35 },
  electric: { depth: 62, period: 235, on: 36, warn: 58, dmg: 16, height: 26 },
  obstacle: { depth: 72, period: 224, on: 30, warn: 62, dmg: 16, height: 54 },
  signal: { depth: 76, period: 240, on: 56, warn: 60, dmg: 18, height: 43 },
  laser: { depth: 62, period: 208, on: 40, warn: 60, dmg: 20, height: 48 },
} satisfies Record<HazardKind, Pick<Hazard, 'depth' | 'period' | 'on' | 'warn' | 'dmg' | 'height'>>;

const GROUND = 460;
class Route {
  private end = 0;
  private start = 0;
  private readonly spawns: Spawn[] = [];
  private readonly arenas: Arena[] = [];
  private readonly hazards: Hazard[] = [];
  private readonly sections: Section[] = [];

  section(label: string, length: number) {
    this.start = this.end;
    this.end += length;
    this.sections.push({ x: this.start, label });
    return this;
  }

  enemy(x: number, type: EnemyType, z: number, y?: number) {
    return this.put(x, { k: 'e', type }, z, y);
  }

  crate(x: number, z: number) { return this.put(x, { k: 'crate' }, z); }
  barrel(x: number, z: number) { return this.put(x, { k: 'barrel' }, z); }
  rescue(x: number, z: number, drop: WeaponId | 'food') { return this.put(x, { k: 'prisoner', drop }, z); }
  supply(x: number, z: number, drop: WeaponId | 'food') { return this.put(x, { k: 'pickup', drop }, z); }
  vehicle(x: number, z: number) { return this.put(x, { k: 'vehicle' }, z); }

  private put(x: number, kind: SpawnKind, z: number, y?: number) {
    this.spawns.push({ ...kind, x: this.start + x, z, y });
    return this;
  }

  danger(x: number, w: number, z: number, kind: HazardKind, label: string, offset: number, alternate = false) {
    this.hazards.push({ ...DANGER[kind], kind, x: this.start + x, w, z, label, offset, alternate });
    return this;
  }

  arena(x: number, label: string, waves: { label: string; foes: WaveEnemy[] }[]) {
    this.arenas.push({
      x: this.start + x,
      label,
      waves: waves.map(wave => wave.foes),
      waveLabels: waves.map(wave => wave.label),
    });
    return this;
  }

  boss(type: BossType, label: string) {
    this.section(label, W);
    this.arenas.push({ x: this.start, waves: [], boss: type, label });
    return this;
  }

  done(name: string, sub: string, objective: string, theme: number, autoScroll = 0): Level {
    return {
      name, sub, objective, theme, autoScroll, width: this.end,
      solids: [{ x: 0, y: GROUND, w: this.end, h: H + 200 - GROUND }],
      plats: [],
      spawns: this.spawns.sort((a, b) => a.x - b.x),
      arenas: this.arenas,
      hazards: this.hazards,
      sections: this.sections,
    };
  }
}

const right = (type: EnemyType, z: number, y?: number): WaveEnemy => ({ type, side: 1, y, z });
const left = (type: EnemyType, z: number, y?: number): WaveEnemy => ({ type, side: -1, y, z });
const wave = (label: string, ...foes: WaveEnemy[]) => ({ label, foes });

function barrio() {
  return new Route()
    .section('Panadería de guardia', 1040)
    .crate(355, 38).enemy(560, 'grunt', 36).enemy(775, 'rusher', 96)
    .danger(635, 142, 25, 'steam', 'Vapor de los hornos', 46)
    .supply(692, 109, 'food').rescue(920, 106, 'metra')
    .section('Callejón del reparto', 970)
    .enemy(105, 'grunt', 80).enemy(235, 'flyer', 32, 235).enemy(410, 'shield', 92)
    .barrel(475, 78).barrel(555, 78).danger(675, 156, 102, 'steam', 'Cañería a presión', 128)
    .supply(740, 19, 'metra')
    .section('Plaza de las entregas', 1000)
    .arena(10, 'Emboscada en la plaza', [
      wave('De frente y por el fondo', right('rusher', 24), right('grunt', 93), left('rusher', 108)),
      wave('Escudo al frente, drones arriba', right('shield', 58), left('flyer', 35, 230), right('flyer', 102, 262)),
      wave('¡Que no llegue el correo bomba!', left('exploder', 72), right('lobber', 17), right('grunt', 108)),
    ])
    .crate(225, 37).rescue(495, 107, 'food').barrel(650, 38)
    .section('Salida al puerto', 820)
    .enemy(245, 'lobber', 94).enemy(420, 'rusher', 26).enemy(615, 'shield', 85)
    .danger(292, 169, 30, 'steam', 'Última purga de la caldera', 185, true)
    .vehicle(465, 100).rescue(660, 15, 'metra')
    .boss('camion', 'Dársena de recolección')
    .done('El Barrio, 3 AM', 'Nivel 1 · Sin sol y sin colectivo', 'Rescatá al barrio y frená el camión que se llevó el amanecer.', 0);
}

function puerto() {
  return new Route()
    .section('Muelle de carga', 1020)
    .enemy(415, 'grunt', 31).enemy(595, 'lobber', 104).enemy(880, 'exploder', 63)
    .danger(610, 178, 104, 'electric', 'Cable de grúa pelado', 32)
    .crate(385, 68).barrel(545, 102).rescue(795, 18, 'escopeta')
    .section('Inspección de contenedores', 1050)
    .arena(30, 'Cerraron el muelle', [
      wave('Corredores de carga', left('exploder', 39), right('exploder', 91), right('lobber', 108)),
      wave('Custodia del contenedor solar', right('shield', 21), left('grunt', 101), right('turret', 68, 285)),
    ])
    .barrel(492, 70).barrel(570, 70).supply(800, 19, 'food')
    .section('La playa de maniobras', 880)
    .enemy(72, 'turret', 29, 350).enemy(390, 'heavy', 81).enemy(660, 'flyer', 20, 210)
    .danger(252, 220, 26, 'electric', 'Baterías en cortocircuito', 102, true)
    .rescue(470, 107, 'cohete').crate(734, 34)
    .section('Andén de izaje', 960)
    .arena(5, 'Último control de carga', [
      wave('Cubrí los dos lados del andén', right('flyer', 105, 205), left('rusher', 24), left('grunt', 110)),
      wave('El capataz no se baja del muelle', right('heavy', 76), left('exploder', 72), right('turret', 29, 320)),
    ])
    .danger(528, 155, 100, 'electric', 'Contenedor fuera de servicio', 170)
    .supply(580, 17, 'escopeta').rescue(735, 20, 'food')
    .boss('grua', 'Pórtico de la Grúa Madre')
    .done('El Puerto', 'Nivel 2 · Contenedores de sol robado', 'Abrí paso entre los contenedores de sol y desmantelá la Grúa Madre.', 1);
}

function tren() {
  return new Route()
    .section('Zona de embarque', 810)
    .crate(360, 42).enemy(560, 'grunt', 105).rescue(678, 22, 'metra')
    .section('Techo del primer coche', 800)
    .danger(40, 190, 30, 'obstacle', 'Puente bajo: ¡saltá!', 155)
    .supply(115, 109, 'food').enemy(272, 'flyer', 106, 218).enemy(492, 'rusher', 36).enemy(656, 'grunt', 89)
    .section('Vagón blindado', 1110)
    .arena(30, 'El vagón entró en emergencia', [
      wave('Subieron por el enganche', left('rusher', 26), left('rusher', 108), right('flyer', 65, 200)),
      wave('Custodia del vagón blindado', right('shield', 60), left('lobber', 103), right('exploder', 45)),
    ])
    .barrel(380, 50).rescue(660, 102, 'laser')
    .section('Túnel de mantenimiento', 1000)
    .danger(120, 244, 103, 'obstacle', 'Viga del túnel: ¡saltá!', 24, true)
    .enemy(238, 'flyer', 17, 210).enemy(466, 'exploder', 94).enemy(606, 'lobber', 56)
    .supply(510, 106, 'food').barrel(546, 72)
    .section('Acople de la locomotora', 800)
    .enemy(144, 'rusher', 26).enemy(310, 'shield', 92).enemy(574, 'flyer', 48, 217)
    .danger(287, 178, 23, 'steam', 'Purga de la locomotora', 122)
    .rescue(586, 108, 'laser')
    .boss('loco', 'Cabina sin maquinista')
    .done('Último Tren', 'Nivel 3 · La cámara no espera a nadie', 'Tomá el último tren y esquivá los puentes bajos antes de llegar a la locomotora.', 2, 2.1);
}

function torre() {
  return new Route()
    .section('Planta de transmisión', 1010)
    .enemy(390, 'shield', 97).rescue(475, 22, 'cohete').enemy(640, 'turret', 63, 295).enemy(875, 'grunt', 24)
    .danger(660, 190, 102, 'signal', 'Interferencia de la antena', 48)
    .supply(750, 17, 'food')
    .section('Puente de repetidoras', 1080)
    .arena(15, 'Interrumpí la transmisión', [
      wave('Señal aérea detectada', left('flyer', 30, 195), right('flyer', 80, 215), right('grunt', 107)),
      wave('El técnico trajo refuerzos', right('heavy', 76), left('rusher', 23), right('turret', 96, 265)),
    ])
    .vehicle(418, 103).crate(568, 28).rescue(705, 24, 'fuego')
    .section('Relés de emergencia', 910)
    .enemy(185, 'turret', 22, 234).enemy(390, 'exploder', 105).enemy(534, 'lobber', 23).enemy(750, 'flyer', 67, 210)
    .danger(287, 226, 28, 'signal', 'Relé sin blindaje', 116, true)
    .barrel(525, 86).barrel(606, 86).supply(740, 112, 'food')
    .section('Nido de drones', 1030)
    .arena(15, 'Despejá el nido', [
      wave('Drones de ambos lados', right('flyer', 32, 185), left('flyer', 105, 248), left('rusher', 70)),
      wave('La colmena defiende la subida', right('shield', 47), left('lobber', 101), right('heavy', 84)),
    ])
    .danger(580, 180, 101, 'signal', 'Rebote de la señal', 181, true)
    .rescue(700, 16, 'cohete')
    .boss('colmena', 'Antena central')
    .done('La Torre de Antenas', 'Nivel 4 · Mala señal, mucha colmena', 'Liberá a los técnicos y cortá la señal de la Antena Colmena.', 3);
}

function nave() {
  return new Route()
    .section('Control de acceso', 1070)
    .rescue(260, 28, 'laser').enemy(510, 'shield', 67).enemy(720, 'turret', 105, 320).enemy(900, 'grunt', 29)
    .danger(640, 190, 105, 'laser', 'Escáner de credenciales', 70)
    .supply(740, 15, 'food')
    .section('Área de personal', 1020)
    .arena(30, 'Se activó el protocolo de seguridad', [
      wave('Personal de seguridad', right('grunt', 28), left('grunt', 93), right('flyer', 66, 192)),
      wave('Inspección de turno', right('heavy', 92), left('shield', 29), right('exploder', 54)),
    ])
    .barrel(401, 83).barrel(485, 83).rescue(728, 18, 'cohete')
    .section('Pasillo de desvinculación', 930)
    .enemy(120, 'heavy', 91).enemy(333, 'exploder', 31).enemy(490, 'turret', 32, 303).enemy(685, 'flyer', 100, 178)
    .danger(261, 272, 27, 'laser', 'Láser de desvinculación', 131, true)
    .crate(610, 103).supply(785, 106, 'fuego')
    .section('Antesala de Gerencia', 1080)
    .arena(24, 'Reunión obligatoria', [
      wave('Recepción doble', right('rusher', 29), right('rusher', 108), left('flyer', 62, 222)),
      wave('El directorio toma posición', left('heavy', 26), right('shield', 88), right('lobber', 106)),
      wave('Cierre del turno', right('heavy', 64), left('exploder', 28), right('exploder', 108), left('turret', 108, 272)),
    ])
    .danger(533, 206, 104, 'laser', 'Protocolo de fin de turno', 168, true)
    .rescue(740, 22, 'food').supply(863, 100, 'laser')
    .boss('gerenta', 'Sala del amanecer')
    .done('Nave Nodriza', 'Nivel 5 · Reunión con la Gerencia', 'Recuperá el sol y renunciá personalmente ante la Gerenta.', 4);
}

export const LEVELS: Level[] = [barrio(), puerto(), tren(), torre(), nave()];
