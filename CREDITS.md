# Créditos

| Recurso | Origen | Licencia |
|---|---|---|
| Personajes, enemigos, jefes, fondos, efectos y portada (`arte/`, `public/arte/`) | Generados con herramientas de IA de OpenAI a pedido de Nahuel Benítez, con prompts de `ART_PROMPTS.md` | Sujetos a las condiciones de uso de OpenAI; no se incluyen en la licencia MIT del código |
| Música y efectos de sonido (`src/audio.ts`) | Sintetizados en vivo con Web Audio para este juego | MIT, igual que el proyecto |
| Historia, nombres y textos | Originales de este juego | MIT, igual que el proyecto |

No se usan imágenes, sonidos ni música tomados de otros juegos. `tools/arte.mjs` genera las versiones web.

## Bibliotecas

| Biblioteca | Uso | Licencia | Fuente |
|---|---|---|---|
| PixiJS 8 | Dibujo con WebGL | MIT | https://github.com/pixijs/pixijs |
| PeerJS 1.5 | Salas online con WebRTC | MIT | https://github.com/peers/peerjs |
| Vite, Vitest, TypeScript | Desarrollo y tests | MIT / Apache-2.0 | https://vite.dev |

El online usa el servidor público gratuito de PeerJS solo para que los navegadores se encuentren. Durante la partida, los datos viajan entre navegadores.

## Inspiración

El género se inspira en los juegos de acción arcade cooperativos. No se copiaron personajes, nombres, sprites ni música de ningún juego.
