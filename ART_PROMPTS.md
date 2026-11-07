# Prompts de arte para Turno Noche

Pedí una imagen por mensaje, siempre en el mismo chat, para que el estilo se mantenga. Empezá con la hoja de estilo y pegá el **bloque de estilo** al comienzo de cada pedido.

Guardá cada imagen con el nombre indicado, en una carpeta `arte/`.

## Bloque de estilo

```text
Original 2D pixel art for a side-view co-op beat 'em up video game. Chunky, readable sprites with dark outlines, 3/4 side view, high contrast, limited palette, night atmosphere, warm torch light against cold shadows, comedic tone. Original designs only: do not imitate or reference any existing game, character or franchise. Crisp hard pixel edges, no anti-aliasing, no blur, no text, no watermark.
```

Para personajes, enemigos y objetos, agregá también:

```text
Fully transparent background, no floor and no shadow. Every frame shows the same character at the same scale and palette, facing right, feet on the same baseline, evenly spaced in a grid, with no overlap between frames.
```

## 1. Hoja de estilo: `estilo.png`

```text
Style sheet showing four characters standing side by side, plus a small color palette. They are the night-shift workers described below. This sheet defines the style for the whole game.
Yoli, a young delivery rider: yellow helmet, red jacket, big yellow delivery backpack, dark jeans, white sneakers.
Don Tito, a big older baker: tall white baker's hat, gray mustache, white shirt, mustard apron, rolling pin.
Mirta, a nurse: turquoise scrubs, white cap with a red cross, brown ponytail, syringe.
Beto, a night watchman: navy uniform, cap with a gold badge, flashlight, long baton.
```

## 2. Personajes jugables

Usá este pedido una vez por personaje y reemplazá `[PERSONAJE]` por su descripción de arriba. Archivos: `yoli.png`, `tito.png`, `mirta.png` y `beto.png`.

```text
Sprite sheet of [PERSONAJE], consistent with the style sheet. 6 columns, 6 rows, equal cells:
Row 1: idle, 6 frames.
Row 2: run, 6 frames.
Row 3: jump up, jump peak, fall, land, dash, dash end.
Row 4: three-hit melee combo, 2 frames per hit, with big bright white-blue slash arcs.
Row 5: shoot, 2 frames; hurt, 2 frames; knocked down, 2 frames.
Row 6: special move, 6 frames.
```

Especiales para la fila 6:

- **Yoli:** se sube a una moto de reparto y embiste.
- **Don Tito:** golpea el piso con el palote y levanta una nube de harina.
- **Mirta:** extiende los brazos y suelta un aura verde de curación.
- **Beto:** levanta la linterna y lanza un destello enceguecedor.

## 3. Enemigos: `enemigos.png`

```text
Sprite sheet of comedic alien invaders dressed like corporate employees: green skin, red eyes. 8 rows, one enemy per row, 6 columns: 2 walk, 2 attack, 1 hurt, 1 defeated.
1 Cadet: purple uniform, ray gun.
2 Biter: red four-legged beast with big teeth.
3 Drone: flying gray robot with an eye.
4 Shield bearer: green uniform, tall riot shield.
5 Thrower: chubby, orange vest, lobs green bombs.
6 Turret: small floor-mounted cannon with an eye.
7 Firecracker: round red creature with a lit fuse.
8 Supervisor: huge purple brute with a rocket launcher and a clipboard.
```

## 4. Jefes

Una imagen por jefe, cada una con 4 columnas y 2 filas: 2 de reposo, 2 de ataque, 2 de golpeado y 2 de derrota. Agregá esta línea a cada pedido: `Very large sprite, each cell about 3 times the height of a player character.`

- `jefe1-camion.png`: `A possessed green garbage truck, driven by an alien, with trash spilling out.`
- `jefe2-grua.png`: `A giant orange harbor crane claw with an alien operator in its cabin.`
- `jefe3-tren.png`: `A floating blue subway car with a monstrous yellow alien face at the front.`
- `jefe4-colmena.png`: `A steel antenna tower topped by a purple alien hive with one giant eye.`
- `jefe5-gerenta.png`: `The Night Manager, an elegant floating green alien executive in a dark suit and red tie, holding a spreadsheet.`

## 5. Escenarios

Para cada escenario agregá: `Side view, no characters, 16:9. The back wall takes the top 55% of the image; the floor takes the bottom 45%, seen slightly from above, with no raised platforms or gaps. Must tile seamlessly left to right. Decorated with wall torches or lamps.`

- `fondo1-barrio.png`: `Back alley of a South American city at 3 AM: old brick walls, closed shutters, a bakery sign.`
- `fondo2-puerto.png`: `Inside a port warehouse at night: stone walls, rusty containers, ropes, lamps with a teal tint.`
- `fondo3-tren.png`: `Inside an empty moving subway train: seats, poles, dark windows, flickering pink lights.`
- `fondo4-torre.png`: `Interior of an antenna tower: concrete, cables, green-lit machinery, alien hive growths.`
- `fondo5-nave.png`: `Interior of an alien mothership styled like a corporate office: purple metal, cubicles, a giant sun trapped in a bag visible through a window.`

## 6. Objetos y efectos: `objetos.png`

```text
Sprite sheet of game items in a grid, equal cells: wooden crate, red explosive barrel, tied-up civilian hostage, armored yellow forklift vehicle, fried dough food item, weapon crate, submachine gun, shotgun, rocket launcher, flamethrower, laser gun, bullet, syringe, rocket, flour puff, pink energy orb, green bomb.
```

Efectos, en otra imagen (`efectos.png`), con 6 cuadros por fila: `white-blue slash arc, hit spark, explosion, dust puff, fire burst, healing sparkles.`

## 7. Portada: `portada.png`

```text
Key art for the game, 16:9: the four night-shift workers charging forward through an alley full of aliens, with a giant sun trapped in a garbage bag on a spaceship above them. Leave empty dark space at the top center for the logo. No text.
```

## Al revisar lo que genere

- Si el fondo sale con cuadritos grises y blancos, pedí: `Real transparent PNG background, not a drawn checkerboard.`
- Si un personaje cambia entre cuadros, pedí: `Redo it keeping exactly the same design, colors and proportions as the style sheet.`
- Antes de publicar, confirmá que las condiciones de uso de tu cuenta permitan usar las imágenes en un proyecto público. Después anotamos el origen en `CREDITS.md`.
