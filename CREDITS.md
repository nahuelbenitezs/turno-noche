# Créditos

| Recurso | Origen | Licencia |
|---|---|---|
| Personajes, enemigos, jefes, fondos, efectos, coleccionables y portada (`arte/`, `public/arte/`) | Generados con herramientas de IA de OpenAI a pedido de Nahuel Benítez, con prompts de `ART_PROMPTS.md` | Sujetos a las condiciones de uso de OpenAI; no se incluyen en la licencia MIT del código |
| Música y efectos de sonido (`src/audio.ts`) | Sintetizados en vivo con Web Audio para este juego | MIT, igual que el proyecto |
| Historia, nombres y textos | Originales de este juego | MIT, igual que el proyecto |
| Barlow y Barlow Condensed | The Barlow Project Authors; cargadas desde Google Fonts | SIL Open Font License 1.1: [Barlow](https://github.com/google/fonts/blob/main/ofl/barlow/OFL.txt), [Barlow Condensed](https://github.com/google/fonts/blob/main/ofl/barlowcondensed/OFL.txt) |

No se usan imágenes, sonidos ni música tomados de otros juegos. `tools/arte.mjs` genera las versiones web.

`src/style.css` solicita las tipografías a `fonts.googleapis.com`; los archivos de fuente no están incluidos en el repositorio. La carga externa es opcional: si falla, la interfaz utiliza las fuentes de sistema declaradas como alternativa en CSS.

## Bibliotecas

| Biblioteca | Uso | Licencia | Fuente |
|---|---|---|---|
| PixiJS 8 | Dibujo con WebGL | MIT | [PixiJS](https://github.com/pixijs/pixijs) |
| PeerJS 1.5 | Salas online con WebRTC | MIT | [PeerJS](https://github.com/peers/peerjs) |
| Vite y Vitest | Desarrollo y tests | MIT | [Vite](https://github.com/vitejs/vite), [Vitest](https://github.com/vitest-dev/vitest) |
| TypeScript | Comprobación de tipos | Apache-2.0 | [TypeScript](https://github.com/microsoft/TypeScript) |

El online usa por defecto señalización pública de PeerJS y sus servidores STUN/TURN. Los datos de partida viajan por WebRTC entre los navegadores, directamente cuando es posible o mediante un relay TURN cuando la conexión lo requiere. Estos servicios externos no ofrecen un SLA propio del proyecto; se pueden configurar servidores ICE propios desde `hostRoom` y `joinRoom`.

## Inspiración

El género se inspira en los juegos de acción arcade cooperativos. No se copiaron personajes, nombres, sprites ni música de ningún juego.
