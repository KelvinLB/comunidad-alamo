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

## Calibración con octubre de 2025 (`scripts/calibrar.py`)

- **Meta cumplida con los pesos de la especificación:** nivel 3 desde el 4 de octubre de 2025 (la meta era a más tardar el 8).
- **Limitación importante:** se usó lo que de verdad pasó como si fuera el pronóstico (pronóstico perfecto). En la vida real el pronóstico a 4-7 días falla, así que la alerta real llegaría más tarde o con menos fuerza. No hay avisos históricos, así que el factor de avisos quedó en 0. La lluvia histórica es ERA5 (malla de ~25 km), que suele quedarse corta en tormentas de montaña.
- **Problema detectado:** el 10 y 11 de octubre, con el río desbordado, el índice baja a nivel 2 (62-67), porque ya no llovía y el caudal de GloFAS (1,636 m³/s) es menor que la crecida de 5 años. **Pendiente de decisión:** subir el peso del caudal (ver la propuesta en el resumen de la etapa 8).
- **Falsas alarmas:** del 15 de octubre al 31 de diciembre de 2025, ningún día pasó de nivel 1. En las temporadas de lluvias (junio-noviembre) de 2019 a 2024, los días en nivel 2 o más fueron 8, 15, 7, 0, 4 y 15 de 183, siempre en rachas de varios días seguidos (por ejemplo, la tormenta Grace en agosto de 2021 y Alberto en junio de 2024). No se pudo comparar contra un registro de inundaciones reales.

## Página

- **Imagen para WhatsApp.** `og:image` apunta a `og.png` con ruta relativa; WhatsApp necesita la dirección completa (`https://…/og.png`). Cambiarla en `public/index.html` cuando exista el dominio de Vercel.
- **Botón Escuchar.** Se probó que aparece y no da errores, pero no se ha escuchado en un celular real. Las voces en español dependen del teléfono; en algunos Android viejos no hay voz es-MX y se usa otra voz en español.
- **Diseño de periódico aplicado** (propuesta en `referencia/propuesta-periodico.html`). La página abre preguntando "¿Dónde vive usted?" y, al elegir, despliega la edición de esa comunidad; la comunidad se recuerda en el teléfono. La franja de color con el aviso de todo el municipio se ve siempre, aunque no se haya elegido comunidad.
- **Cartas de los vecinos y noticias de la región no están en la página real.** En la propuesta salen con textos de ejemplo; en la página real serían datos inventados. Para agregarlas falta: el nombre de quien modera los reportes y el número de WhatsApp que los recibe, y decidir de qué fuentes salen las noticias y quién las captura (por ejemplo, un archivo como `avisos_manuales.json`).
- **Una comunidad lejos del río puede decir "No" mientras el municipio está en "Esté atento"** (el nivel baja 1 por estar cerca y 2 por estar lejos). En ese caso la edición muestra el recuadro "En el resto del municipio: …" y la franja de arriba sigue en amarillo. Revisar con Protección Civil si esa regla les parece bien.
- **`og.png` sigue con el diseño anterior** (letrero azul). Rehacer `scripts/og.html` con el estilo de periódico.
- **Botón "Compartir por WhatsApp".** Arma un mensaje con la respuesta de la comunidad, dos recomendaciones, la hora de la revisión, la liga y la aclaración de que no es oficial. La liga lleva las coordenadas de la comunidad (`?c=lat,lon`) porque 34 nombres se repiten en el municipio; quien la abre ve esa comunidad, pero no se le guarda como suya. Con datos atrasados el botón se oculta, para que no circulen avisos viejos. Falta probarlo en un teléfono real con WhatsApp, y la vista previa de la liga depende de arreglar `og:image` (punto anterior).
- **Colores revisados por contraste (WCAG AA).** Texto blanco sobre verde 5.3:1 (oscuro 5.0:1), sobre rojo 5.7:1 (5.0:1) y sobre gris 5.9:1; texto oscuro sobre amarillo 11.5:1 y sobre naranja 5.6:1 (6.7:1). Gris de textos secundarios sobre papel 8.0:1. El "911" rojo en modo oscuro es 3.4:1, suficiente para letra grande.
- **Leaflet** (mapa con calles) se carga de cdnjs sin verificación de integridad (SRI). Agregar el `integrity` oficial de cdnjs para la versión 1.9.4.
- **Revisado en**: Chrome de escritorio y WebKit (motor de Safari) con Playwright, a 360 y 390 px, claro y oscuro. Falta probar en un Android sencillo real y en un iPhone real.

## Operación

- **Keepalive de los 60 días.** La acción sugerida, `gautamkrishnar/keepalive-workflow`, **ya no existe**: GitHub bloqueó ese repositorio por sus términos de servicio (abril de 2025). Se usa `liskin/gh-workflow-keepalive` v1 (activo, sin archivar, última actualización en agosto de 2025), que reactiva el workflow por la API sin hacer commits falsos. Está fijado al commit `f72ff1a` para que nadie pueda cambiar su código sin que lo sepamos. Además, el bot hace un commit en cada revisión, lo que también cuenta como actividad.
- **Todavía no se ha corrido en GitHub Actions** (falta crear el repositorio). Hay que confirmar ahí: que SMN responda desde EE. UU., que el commit de `data.json` funcione y que Vercel publique cada commit.
- **`geo.json` se guarda en caché una semana.** Si se vuelve a generar, algunas personas verán la versión anterior hasta 7 días.

## Para después

### Bot de Telegram (diseño, sin implementar)

- **Qué hace:** publica un mensaje en un canal público de Telegram (por ejemplo, "Alerta Pantepec Álamo") **solo cuando el nivel sube** (de 0 a 1, de 1 a 2…) y cuando vuelve a 0 después de una alerta. Nunca en cada revisión, para no cansar a la gente.
- **Cómo:** al final de `bot/actualizar.py`, comparar `riesgo.nivel` nuevo con el del `data.json` anterior. Si cambió según la regla, llamar a `https://api.telegram.org/bot<TOKEN>/sendMessage` con `urllib` (biblioteca estándar).
- **Mensaje:** "⚠ Álamo: PELIGRO (nivel 2). El río puede llegar a la orilla y salirse en las partes bajas. Qué hacer: … Más información: <liga>". Mismo lenguaje sencillo que la página.
- **Secretos:** `TELEGRAM_TOKEN` y `TELEGRAM_CANAL` en GitHub. Si no existen, se omite sin fallar (igual que Healthchecks).
- **Cuidados:** no publicar con datos de ejemplo; no publicar si la subida se debe solo a que una fuente volvió después de estar caída (comparar con la última lectura con todas las fuentes bien); guardar la hora del último mensaje en `data.json` para no repetir en menos de 6 horas.
