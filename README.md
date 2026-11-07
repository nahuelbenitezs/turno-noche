# Turno Noche

Beat 'em up 2D cooperativo para 1 a 4 personas, en el navegador. Se robaron el amanecer: una repartidora, un panadero, una enfermera y un sereno salen a recuperarlo a través de cinco niveles y cinco jefes.

## Cómo se juega

- **Misma pantalla:** hasta 4 personas, con mandos y hasta 2 en un teclado. Cada una se suma apretando disparar en la selección de personajes.
- **Online:** quien elige *Crear sala* recibe un código de 5 letras; las demás personas entran con *Unirse*. Hasta 4 en total.
- **Celular:** tiene controles táctiles; se juega mejor en horizontal.

## Controles

| Acción | Teclado 1 | Teclado 2 | Mando |
|---|---|---|---|
| Mover | `W` `A` `S` `D` | Flechas | Stick o cruz |
| Disparar | `J` | `,` o `Numpad 1` | `X` o `RT` |
| Saltar | `K` | `.` o `Numpad 2` | `A` |
| Golpe | `L` | `/` o `Numpad 3` | `B` |
| Especial | `I` | `Ñ` o `Numpad 5` | `Y` |
| Esquivar | `U` | `Shift` derecho o `Numpad 0` | `LB` o `RB` |

`Esc` o `P` pausa la partida local. `M` silencia.

Trucos: golpear una bala la devuelve, golpe en el aire hace una picada, golpe sobre la Zorra Blindada te sube, abajo + saltar te baja, y parate al lado de quien cayó para levantarle.

## Personajes

| Personaje | Estilo | Especial |
|---|---|---|
| **Yoli**, repartidora | Rápida, doble salto, esquiva seguido | *Moto a fondo*: cruza la pantalla atropellando todo |
| **Don Tito**, panadero | Mucha vida, harina de cerca, golpe fuerte | *Gran amasada*: explosión y ondas de choque |
| **Mirta**, enfermera | Jeringas que buscan al enemigo | *Guardia de emergencia*: cura y levanta al equipo |
| **Beto**, sereno | Linterna que atraviesa y bastón largo | *Apagón*: aturde a todos y borra sus disparos |

## Desarrollo

```bash
npm install
npm run dev
npm test
npm run build
```

La simulación (`src/sim`) es TypeScript puro, determinista y sin navegador; `src/render` la dibuja con PixiJS. Esa separación permite probar la historia completa sin pantalla y mandar el mismo estado por red: quien crea la sala simula, y los demás mandan botones y reciben el estado. Agregar `?bot=4` a la dirección hace jugar a cuatro jugadores automáticos, y `?mute` lo silencia.

## Créditos

El arte se creó con herramientas de IA y el sonido se sintetiza para este juego. Fuentes y licencias en [CREDITS.md](CREDITS.md). El código tiene licencia MIT.
