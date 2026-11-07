// Datos del juego: personajes, armas, enemigos e historia. Sin dependencias de navegador.
export const W = 960, H = 540;
export const BTN = { L: 1, R: 2, U: 4, D: 8, J: 16, S: 32, M: 64, X: 128, DASH: 256 } as const;
export const pickBits = (card: number) => (card + 1) << 16;
export const pickOf = (input: number) => (input >> 16) - 1;

export interface CharDef {
  id: string; name: string; role: string; desc: string; speed: number; jump: number; jumps: number;
  hp: number; meleeDmg: number; meleeRange: number; weapon: WeaponId; special: string; specialDesc: string; color: number;
}
export type WeaponId = 'pistola' | 'harina' | 'jeringa' | 'linterna' | 'metra' | 'escopeta' | 'cohete' | 'fuego' | 'laser' | 'canon';
export const CHARS: CharDef[] = [
  { id: 'yoli', name: 'Yoli', role: 'Repartidora', desc: 'La más rápida. Tiene doble salto y un dash que recarga enseguida.', speed: 5.1, jump: 12.4, jumps: 2, hp: 80, meleeDmg: 14, meleeRange: 54, weapon: 'pistola', special: 'Moto a fondo', specialDesc: 'Cruza la pantalla atropellando todo, sin recibir daño.', color: 0xff5a4e },
  { id: 'tito', name: 'Don Tito', role: 'Panadero', desc: 'Lento y durísimo. Dispara harina de cerca y pega como una amasadora.', speed: 3.9, jump: 11.9, jumps: 1, hp: 140, meleeDmg: 28, meleeRange: 68, weapon: 'harina', special: 'Gran amasada', specialDesc: 'Golpe al piso con explosión y dos ondas de choque.', color: 0xf2c14e },
  { id: 'mirta', name: 'Mirta', role: 'Enfermera', desc: 'Sus jeringas buscan al enemigo. Es quien salva al equipo.', speed: 4.4, jump: 12.2, jumps: 1, hp: 100, meleeDmg: 13, meleeRange: 52, weapon: 'jeringa', special: 'Guardia de emergencia', specialDesc: 'Cura y levanta a todo el equipo, y suelta jeringas.', color: 0x4ed6c1 },
  { id: 'beto', name: 'Beto', role: 'Sereno', desc: 'Pelea con linterna y bastón largo. Hace más daño a los aturdidos.', speed: 4.5, jump: 12.2, jumps: 1, hp: 100, meleeDmg: 22, meleeRange: 84, weapon: 'linterna', special: 'Apagón', specialDesc: 'Aturde a todos los enemigos y borra sus disparos.', color: 0x7f8cff },
];

export interface WeaponDef { name: string; cd: number; dmg: number; speed: number; spread: number; count: number; ammo: number; life: number; kind: 'bala' | 'cohete' | 'fuego' | 'laser' | 'jeringa' | 'harina'; pierce?: boolean; shake: number; recoil: number }
export const WEAPONS: Record<WeaponId, WeaponDef> = {
  pistola: { name: 'Pistola', cd: 10, dmg: 8, speed: 13, spread: .03, count: 1, ammo: 0, life: 70, kind: 'bala', shake: 1, recoil: .3 },
  harina: { name: 'Harina', cd: 24, dmg: 7, speed: 11, spread: .17, count: 4, ammo: 0, life: 24, kind: 'harina', shake: 3, recoil: 1 },
  jeringa: { name: 'Jeringa', cd: 13, dmg: 8, speed: 9, spread: .02, count: 1, ammo: 0, life: 90, kind: 'jeringa', shake: 0, recoil: .2 },
  linterna: { name: 'Linterna', cd: 12, dmg: 8, speed: 16, spread: 0, count: 1, ammo: 0, life: 30, kind: 'laser', pierce: true, shake: 0, recoil: .1 },
  metra: { name: 'Metralleta', cd: 5, dmg: 7, speed: 15, spread: .07, count: 1, ammo: 150, life: 70, kind: 'bala', shake: 1.5, recoil: .3 },
  escopeta: { name: 'Escopeta', cd: 28, dmg: 11, speed: 14, spread: .14, count: 6, ammo: 30, life: 26, kind: 'bala', shake: 6, recoil: 2.5 },
  cohete: { name: 'Cohetes', cd: 34, dmg: 45, speed: 9, spread: 0, count: 1, ammo: 18, life: 90, kind: 'cohete', shake: 3, recoil: 2 },
  fuego: { name: 'Lanzallamas', cd: 3, dmg: 4, speed: 8, spread: .13, count: 1, ammo: 220, life: 28, kind: 'fuego', pierce: true, shake: .5, recoil: 0 },
  laser: { name: 'Láser', cd: 16, dmg: 26, speed: 24, spread: 0, count: 1, ammo: 45, life: 50, kind: 'laser', pierce: true, shake: 2, recoil: .6 },
  canon: { name: 'Cañón', cd: 22, dmg: 40, speed: 12, spread: 0, count: 1, ammo: 0, life: 80, kind: 'cohete', shake: 5, recoil: 1 },
};
export const PICKUP_WEAPONS: WeaponId[] = ['metra', 'escopeta', 'cohete', 'fuego', 'laser'];

export type EnemyType = 'grunt' | 'rusher' | 'flyer' | 'shield' | 'lobber' | 'turret' | 'exploder' | 'heavy' | BossType;
export type BossType = 'camion' | 'grua' | 'loco' | 'colmena' | 'gerenta';
export const ENEMIES: Record<EnemyType, { hp: number; w: number; h: number; score: number; fly?: boolean; name?: string; contact: number }> = {
  grunt: { hp: 24, w: 30, h: 50, score: 100, contact: 6 },
  rusher: { hp: 18, w: 34, h: 36, score: 120, contact: 10 },
  flyer: { hp: 16, w: 40, h: 28, score: 130, fly: true, contact: 6 },
  shield: { hp: 44, w: 36, h: 54, score: 200, contact: 8 },
  lobber: { hp: 28, w: 34, h: 46, score: 150, contact: 6 },
  turret: { hp: 50, w: 40, h: 40, score: 200, fly: true, contact: 0 },
  exploder: { hp: 12, w: 28, h: 34, score: 140, contact: 0 },
  heavy: { hp: 130, w: 60, h: 80, score: 500, contact: 14 },
  camion: { hp: 900, w: 180, h: 110, score: 5000, name: 'Camión Basurero Poseído', contact: 16 },
  grua: { hp: 1100, w: 140, h: 80, score: 6000, fly: true, name: 'La Grúa Madre', contact: 16 },
  loco: { hp: 1200, w: 180, h: 100, score: 7000, fly: true, name: 'Último Tren', contact: 14 },
  colmena: { hp: 1500, w: 120, h: 300, score: 8000, fly: true, name: 'La Antena Colmena', contact: 12 },
  gerenta: { hp: 2300, w: 70, h: 110, score: 20000, fly: true, name: 'La Gerenta de la Noche', contact: 14 },
};
export const isBoss = (t: EnemyType) => !!ENEMIES[t].name;

export interface StoryLine { who: string; text: string }
export const STORY: StoryLine[][] = [
  [{ who: 'Narración', text: 'Son las 3 de la mañana. El amanecer de hoy… no llegó. Una nave se lo llevó en una bolsa de consorcio.' },
   { who: 'Yoli', text: '¿Cancelaron el sol? Tengo cuarenta pedidos y la app me pide que espere “hasta que salga el día”.' },
   { who: 'Don Tito', text: 'Sin sol, el pan no sube. Y a mi pan no lo toca nadie. Vamos.' }],
  [{ who: 'Mirta', text: 'Ese camión venía lleno de alienígenas. El reciclado estuvo pésimo.' },
   { who: 'Beto', text: 'Las cámaras los marcan en el puerto. Están cargando contenedores de luz solar.' },
   { who: 'Yoli', text: 'Agarren algo que dispare. El puerto no tiene buena reseña.' }],
  [{ who: 'Beto', text: 'La Grúa cayó. En su cabina había un horario: “Último Tren, 04:44, rumbo a la torre”.' },
   { who: 'Don Tito', text: '¿Un tren en hora? Eso sí que es tecnología extraterrestre.' },
   { who: 'Mirta', text: 'Arriba del techo, entonces. Y cuidado con las cabezas: no pienso coser a nadie en movimiento.' }],
  [{ who: 'Yoli', text: 'La torre de antenas manda órdenes a todos los bichos de la ciudad.' },
   { who: 'Beto', text: 'Es una colmena. Y yo que me quejaba de mi grupo de WhatsApp.' },
   { who: 'Mirta', text: 'La tiramos, y después subimos a buscar el sol.' }],
  [{ who: 'La Gerenta', text: 'Buenas noches, colaboradores. Por decisión estratégica, de hoy en adelante será siempre de noche.' },
   { who: 'Don Tito', text: '¿Y eso quién lo decidió?' },
   { who: 'La Gerenta', text: 'Mi planilla. Turnos infinitos, sin horas extra. Firmen acá o serán desvinculados.' },
   { who: 'Yoli', text: 'Mirá… vengo con una entrega para vos.' }],
];
export const ENDING: StoryLine[] = [
  { who: 'Narración', text: 'La bolsa se rompe. El sol sale, tarde y medio arrugado, pero sale.' },
  { who: 'Don Tito', text: 'Justo a tiempo: el pan subió.' },
  { who: 'Mirta', text: 'Todos con el alta. Excepto la Gerenta, que quedó en observación… en órbita.' },
  { who: 'Beto', text: 'Bueno. Me voy a dormir. Esta noche entro a las diez.' },
  { who: 'Yoli', text: 'Y yo tengo cuarenta pedidos atrasados. Cinco estrellas, ¿eh?' },
];
export const BANTER = ['¡Eso!', '¡Dale!', '¡Vamo arriba!', '¡Fino!', '¡A la bolsa!', '¡Tremendo!', '¡Qué nivel!', '¡De locos!'];
