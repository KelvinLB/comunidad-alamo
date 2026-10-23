# Pendientes y cosas sin verificar

Lista de lo que no se pudo confirmar o que queda para después. Si algo de aquí se resuelve, bórrelo de la lista.

## Datos sin verificar

- **Trazo del río (Natural Earth 10m).** Es simplificado: une las líneas "Chiflón" y "Pantepec" de oeste a este. No se ha verificado dónde se une el Vinazco con el Pantepec, por eso el Vinazco no se dibuja aparte. En el mapa se rotula "Río Pantepec" cerca de Álamo y "Río Tuxpan" cerca de Tuxpan. La distancia al río de cada comunidad depende de este trazo y puede tener error de algunos cientos de metros.
- **Altitud de las comunidades.** Viene del catálogo del INEGI (un solo punto por localidad). En comunidades grandes, unas calles están más bajas que el punto oficial.
- **Prioridad por población.** Sale del Censo 2020 según PueblosAmerica.com (no es fuente oficial). Cuando un nombre se repite, se asigna a la localidad con clave INEGI más baja. Desde el lugar 23 el orden difiere un poco del prototipo, porque se reconoció "Héroes del 47 (Otatal)" con su nombre del INEGI.
- **Botones de comunidades.** Se muestran las 8 más pobladas (como dice la especificación). El prototipo tenía Buenos Aires y Las Cañas de Abajo en lugar de Temapache y La Concepción.

## Umbrales de crecida (`public/umbrales.json`)

- **El histórico de GloFAS solo tiene datos desde 1997** en este punto (1984-1996 vienen vacíos) y 2022 está incompleto (termina en julio). Se usaron los 25 años completos 1997-2021: crecida de 2 años = 1,124 m³/s, de 5 años = 1,687 m³/s y de 20 años = 2,205 m³/s.
- Con 25 años, el cuantil 0.95 (20 años) es poco preciso: depende de los 2 o 3 años más altos (2019, 2020).
- **Open-Meteo redondea el caudal a escalones**, por eso se repiten valores exactos (por ejemplo, 1,635.82 m³/s en septiembre de 2003 y en octubre de 2025). No es error, pero la precisión es de algunos por ciento.
- En octubre de 2025 GloFAS da un pico de 1,636 m³/s, menor que la crecida de 5 años, aunque fue la peor inundación en décadas. Es probable que GloFAS subestime los picos de este río; ver la calibración.

## Fuentes

Todas se probaron el 23 de octubre de 2026 y sus respuestas reales están en `tests/fixtures/`.

- **Punto del río en GloFAS: 20.92, -97.68** (celda 20.925, -97.675). Se comparó con las 8 celdas vecinas (±0.05°) en septiembre-octubre de 2025: la fila de latitud 20.925 es el cauce grande y el caudal crece aguas abajo (pico de 1,482 / 1,636 / 1,662 m³/s de oeste a este). Las celdas de 20.875 y 20.975 dan de 7 a 120 m³/s, son arroyos. Se queda el punto de la especificación.
- **GloFAS se atrasa un poco.** En octubre de 2025 el pico simulado cae el 11 de octubre; el río se desbordó el 9 y 10. Ver la calibración.
- **SMN · Conagua** responde desde México (archivo gzip con 9,852 filas; Álamo Temapache trae 4 días). Falta comprobar que responda desde los servidores de GitHub Actions (están en EE. UU.). Si no responde, el bot lo marca como caído y sigue.
- **NHC.** Las claves de tipo de sistema (`HU`, `TS`, `TD`, `STS`, `PTC`, `PC`…) se tradujeron según la documentación del NHC; si aparece una desconocida se muestra como "Sistema tropical". La cuenca se lee del `id` (`al` = Atlántico, `ep` = Pacífico Este; el Pacífico Central se ignora).
- **Lluvia en la sierra.** Para cada día se toma el punto de la cuenca alta con más lluvia, y sobre esa serie se busca el máximo de 72 h. Es un poco más conservador que calcular las 72 h de cada punto por separado.

## Página

- **Imagen para WhatsApp.** `og:image` apunta a `og.png` con ruta relativa; WhatsApp necesita la dirección completa (`https://…/og.png`). Cambiarla en `public/index.html` cuando exista el dominio de Vercel.
- **Botón Escuchar.** Se probó que aparece y no da errores, pero no se ha escuchado en un celular real. Las voces en español dependen del teléfono; en algunos Android viejos no hay voz es-MX y se usa otra voz en español.
- **Colores ajustados por contraste (WCAG AA).** Sobre el naranja el texto va oscuro (`#14110A`) porque con blanco el contraste es 4.0:1. En modo oscuro el verde pasó de `#2E9E55` a `#1F8044` y el rojo de `#E5413C` a `#D2302B`, porque con texto blanco no llegaban a 4.5:1.
- **Leaflet** (mapa con calles) se carga de cdnjs sin verificación de integridad (SRI). Agregar el `integrity` oficial de cdnjs para la versión 1.9.4.
- **Revisado en**: Chrome de escritorio y WebKit (motor de Safari) con Playwright, a 360 y 390 px, claro y oscuro. Falta probar en un Android sencillo real y en un iPhone real.

## Para después
