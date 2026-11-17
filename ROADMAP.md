# Turno Noche: camino hacia una edición comercial

La versión actual es una base arcade jugable con cinco misiones, cuatro personajes distintos y cooperativo local/online. Una producción de alcance AAA requiere un equipo, presupuesto, contenido y validación sostenidos. Este documento ordena el trabajo pendiente sin asignar fechas ni costos que todavía no fueron estimados.

## 1. Validar la experiencia con cuatro celulares

**Entregable:** matriz de pruebas y registro reproducible de fallos con cuatro dispositivos físicos, Android e iOS, navegadores soportados y combinaciones de Wi-Fi/datos móviles. Probar confirmaciones simultáneas, ingreso tardío, desconexión, retorno de segundo plano, orientación, multitoque y partidas completas.

**Criterio de salida:** sesiones completas reproducibles en las configuraciones declaradas; perfiles de rendimiento, latencia, tráfico, memoria y temperatura medidos en dispositivos elegidos como objetivo. Corregir los problemas detectados antes de ampliar contenido. Las pruebas automáticas existentes no verifican por sí mismas la red WAN ni el comportamiento de un teléfono.

## 2. Definir la infraestructura online de producción

**Entregable:** decidir entre mantener anfitrión de jugador o llevar la simulación a servidores dedicados. Evaluar costos de operación, regiones, salas, señalización propia, TURN con credenciales temporales, reconexión con identidad y recuperación de partida. Si se conserva el anfitrión, diseñar explícitamente su migración o la recuperación ante su salida.

**Criterio de salida:** pruebas de carga y fallos sobre infraestructura con responsabilidades operativas claras. Para competitivo o rankings públicos, autoridad de servidor, validación de acciones, límites de mensajes y estrategia contra trampas. El cliente anfitrión actual puede alterar su propia simulación; validar paquetes no ofrece autoridad independiente.

## 3. Cerrar la dirección jugable y una misión de referencia

**Entregable:** prototipo comparativo para decidir cuánto conservar del beat 'em up por carriles y cuánto acercarse al run and gun de las referencias. Probar apuntado, salto, lectura de balas, destrucción y cooperación con jugadores nuevos. Diseñar una misión de referencia completa, con inicio, giros, descanso, encuentro especial y jefe.

**Criterio de salida:** una dirección aprobada por pruebas de juego y una misión que defina el estándar de calidad para las demás. Si se eligen plataformas reales, rehacer el authoring de geometría, colisiones, cámara, rutas y navegación de enemigos/bots: hoy el constructor mantiene piso continuo y sus llamadas `p()`/`gap()` no crean plataformas ni huecos físicos. No basta con activar esos métodos sin rediseñar los niveles.

## 4. Presupuestar arte, animación y audio

**Entregable:** guía visual, inventario de animaciones, efectos, escenarios y elementos interactivos; lista de música, voces, chistes, sonidos y mezcla. Estimar costos con el equipo que vaya a producirlos y revisar derechos de uso de cada recurso para la distribución prevista.

**Criterio de salida:** la misión de referencia usa un conjunto coherente de recursos terminados, con lectura clara en pantallas pequeñas y rendimiento comprobado. El presupuesto debe contemplar iteraciones y mantenimiento de contenido. Doblaje, nueva música, arte adicional y animaciones deben producirse y verificarse; no están incluidos por describirlos en este plan.

## 5. Producir campaña, herramientas y rejugabilidad

**Entregable:** herramientas de edición y validación de niveles, encuentros hechos a mano, jefes con anticipación legible, variantes de enemigos y objetivos cooperativos. Evaluar misiones secundarias, desafíos, dificultades y progresión con el criterio de aportar decisiones y diversión, evitando acumular mecánicas sin probarlas.

**Criterio de salida:** cada misión aporta situaciones propias y supera pruebas de accesibilidad, balance, cooperación y recuperación después de perder. Separar el récord local actual de cualquier futura progresión persistente o tabla online, que necesita backend e integridad de resultados.

## 6. Preparar distribución y soporte

**Entregable:** definir plataformas y requisitos mínimos, alojamiento HTTPS, formatos de distribución móvil y proceso de actualizaciones. Completar opciones de controles y accesibilidad, localización, gestión de partidas, analítica acordada y canal de reporte de problemas. Revisar requisitos de las tiendas y servicios elegidos al preparar la publicación.

**Criterio de salida:** build candidata probada en la matriz de dispositivos, documentación de operación y soporte, plan de corrección y reversión de versiones, y revisión de licencias y políticas aplicables. La publicación comercial se decide con esa evidencia y un presupuesto de operación aprobado.
