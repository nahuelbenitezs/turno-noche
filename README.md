# Turno Noche

Acción arcade 2D cooperativa para 1 a 4 personas en el navegador. Se robaron el amanecer: una repartidora, un panadero, una enfermera y un sereno salen a recuperarlo en cinco misiones con cinco jefes. El combate conserva el movimiento por carriles de profundidad del beat 'em up, con disparos, golpes y explosiones.

## Entrar de turno

- **Local:** elegí *Entrar de turno*. Sumá hasta dos jugadores con teclado y completá el equipo con mandos; también podés elegir una carta con mouse o tocarla. Cuando todos confirmen, apretá **Arrancar turno**.
- **Online:** *Crear sala online* genera un código de cinco letras. Compartí el código o usá *Copiar invitación*: el enlace abre el ingreso con el código cargado. Los demás eligen *Tengo un código*, entran y confirman su personaje. El anfitrión aprieta **Arrancar turno** cuando esté el equipo. El límite es cuatro personas en total, contando jugadores locales del anfitrión.
- **Personajes únicos:** una carta confirmada queda reservada; dos personas nunca pueden usar el mismo personaje. *Cambiar personaje* libera tu elección antes de empezar. Se puede entrar durante la partida: una plaza nueva recibe un personaje disponible y una plaza reutilizada conserva su personaje anterior.
- **Celular:** usá el teléfono en horizontal. Los controles admiten mover, disparar y saltar con varios dedos a la vez. Cada invitado puede jugar desde su propio celular. La pantalla completa y el bloqueo de orientación dependen del navegador.

## Controles

| Acción | Teclado 1 | Teclado 2 | Mando estándar |
|---|---|---|---|
| Mover y cambiar de carril | `W A S D` | Flechas | Stick izquierdo o cruz |
| Disparar | `J` | `,` / `Numpad 1` | `X` / `RT` |
| Saltar | `K` | `.` / `Numpad 2` | `A` |
| Golpe | `L` | `/` / `Numpad 3` | `B` |
| Especial | `I` | `Ñ` / `Numpad 5` | `Y` |
| Dash | `U` | `Shift` derecho / `Numpad 0` | `LB` / `LT` |
| Granada | `O` | `Enter` / `Numpad 4` | `RB` |

`Esc` o `P` abre la pausa; `M` cambia el sonido. En local la pausa detiene el juego. Online abre tu menú y deja la partida en marcha para el resto del equipo.

## Mecánicas

- **Granadas:** tres al comenzar cada nivel; rebotan y explotan después de una mecha. Los rescates y puntos de control reponen unidades hasta ese máximo.
- **Dash ofensivo y esquiva perfecta:** atravesá enemigos para golpearlos. Esquivar una bala que se acerca carga el especial y el frenesí del equipo.
- **Frenesí / ¡Horas extra!:** bajas, rescates, parries y cadenas cargan una barra compartida. Al llenarse, mejora temporalmente el daño y la cadencia y duplica los puntos de las bajas.
- **Golpes y parry:** encadená tres golpes; golpear una bala la devuelve. Un golpe en el aire hace una picada con impacto al aterrizar.
- **Rescates y explosiones en cadena:** liberá compañeros para conseguir armas y suministros; encadená barriles para sumar puntos y frenesí.
- **Peligros por carril:** vapor, descargas y láseres tienen avisos visuales. Saltá, esquivá o cambiá de carril; los desvíos ofrecen suministros.
- **Cooperación y puntos de control:** quedate junto a un compañero caído para levantarlo. Limpiar una emboscada guarda un punto de control y repone salud y granadas. Al continuar tras perder, volvés al último control; si llegaste al jefe, conserva el daño recibido. Continuar cuesta la mitad del puntaje.
- **Zorra Blindada:** golpeá junto al vehículo para subirte; abajo + salto te baja.

## Personajes

| Personaje | Estilo | Especial |
|---|---|---|
| **Yoli**, repartidora | Rápida, doble salto y dash frecuente | *Moto a fondo*: atraviesa la pantalla atropellando enemigos |
| **Don Tito**, panadero | Mucha vida, harina y golpes fuertes | *Gran amasada*: explosión y ondas de choque |
| **Mirta**, enfermera | Jeringas que buscan enemigos | *Guardia de emergencia*: cura y levanta al equipo |
| **Beto**, sereno | Linterna penetrante y bastón largo | *Apagón*: aturde enemigos y elimina sus disparos |

## Ajustes y presentación

El menú incluye sonido, efectos livianos y movimiento reducido. En celulares se seleccionan efectos livianos por defecto; también se respeta la preferencia de movimiento reducido del sistema. Las preferencias y el récord se guardan en el navegador de ese dispositivo cuando hay almacenamiento disponible. El récord es local, sin tabla global ni sincronización de cuenta.

El HUD muestra vida, especial, munición, granadas, objetivo, progreso, combos, frenesí y fase del jefe. Cada misión tiene ambientación, cartelería y peligros propios.

## Desarrollo

Requiere Node.js y npm.

```bash
npm ci
npm run dev
npm test
npm run build
npm run preview
```

Abrí la dirección que indique Vite. `build` comprueba TypeScript y genera `dist/`; `preview` permite revisar esa compilación. Para publicar, serví `dist/` mediante HTTPS. Un enlace a `localhost` solo funciona en el equipo que lo abrió.

La simulación determinista a 60 Hz vive en `src/sim`; PixiJS dibuja desde `src/render`. `src/input.ts` reúne teclado, mandos y multitoque; `src/ui.ts` contiene las pantallas. Las pruebas cubren simulación, campaña con bots, selección única, controles y sesiones de red. No sustituyen una prueba con personas y dispositivos reales.

Parámetros útiles para desarrollo: `?bot=4` muestra cuatro jugadores automáticos, `?mute` inicia sin sonido y `?touch` fuerza los controles táctiles. `?room=ABCDE` precarga un código de sala.

## Online y límites actuales

El anfitrión ejecuta la simulación y envía estados; los invitados mandan controles mediante WebRTC/PeerJS. Hay validación de botones y estados, preservación de toques breves, medición de RTT y limpieza de plazas al desconectar. El anfitrión debe mantener la partida abierta y en primer plano: los navegadores móviles pueden suspender pestañas en segundo plano o al bloquear el teléfono. No hay migración automática de host ni servidor dedicado.

Por defecto se utilizan la señalización y los servidores públicos STUN/TURN de PeerJS. Su disponibilidad no tiene un SLA propio del juego. Esta implementación todavía requiere validación WAN con cuatro celulares físicos, incluyendo redes móviles y distintas condiciones de conexión.

`hostRoom(onLink, { iceServers })` y `joinRoom(code, { iceServers })`, en `src/net/net.ts`, aceptan una lista `RTCIceServer[]` para usar infraestructura ICE propia. La interfaz actual no pide esa configuración. Para producción, obtené credenciales TURN temporales desde un backend; no guardes secretos permanentes en el repositorio ni en el bundle del navegador. Cambiar ICE no cambia el servidor de señalización.

El camino hacia una edición comercial está en [ROADMAP.md](ROADMAP.md).

## Créditos

El arte se creó con herramientas de IA y el sonido se sintetiza para este juego. Fuentes y licencias en [CREDITS.md](CREDITS.md). El código tiene licencia MIT.
