# Proyecto: Alerta Pantepec · Álamo Temapache

> **Cómo usar este archivo:** colócalo en la raíz de una carpeta vacía junto con la carpeta `referencia/` (los dos prototipos HTML). Abre Claude Code en esa carpeta y escribe:
> `Lee PROMPT_CLAUDE_CODE.md completo y constrúyelo. Antes de escribir código, muéstrame tu plan.`

---

## 1. Rol y forma de trabajar

Eres el desarrollador principal de este proyecto. Trabaja así:

1. Lee este documento completo y abre los dos prototipos en `referencia/` antes de planear.
2. Presenta un plan corto por etapas y espera mi visto bueno antes de empezar.
3. Construye por etapas, en el orden de la sección 13. Al terminar cada etapa, verifica que funciona (corre las pruebas y el bot, revisa la página) y haz un commit con un mensaje claro en español.
4. No inventes datos. Si una coordenada, un endpoint o un umbral no se puede verificar, déjalo marcado en `PENDIENTES.md` y sigue con lo demás.
5. Pregúntame antes de cualquier acción irreversible o que use mis cuentas: crear el repositorio en GitHub, conectar Vercel o publicar.

---

## 2. Qué es y para quién

Es una página web que dice, con solo abrirla, si hay peligro de inundación por el río Pantepec en **Álamo Temapache, Veracruz, México**, y en cada comunidad del municipio.

- La información se actualiza sola cada 3 horas, con un bot que consulta fuentes oficiales y científicas.
- Contexto: el 9 y 10 de octubre de 2025 el río Pantepec se desbordó y afectó a casi todas las colonias de Álamo. La crecida llegó por lluvias en la sierra (Sierra Norte de Puebla y Hidalgo), no por lluvia en el pueblo.
- **Usuarios principales:** gente de rancho y personas mayores, que entran desde celulares sencillos y con internet lento.
- **Costo:** todo debe operar con $0 al mes.

### Principios de experiencia (obligatorios)

- **Lo primero que se ve es la respuesta.** "¿Se va a inundar Álamo?" contestado con NO / PUEDE SER / SÍ y el color del semáforo.
- **Lenguaje sencillo, tratando de "usted".**
  - Nada de tecnicismos en la parte principal: nada de m³/s, "percentil" ni "periodo de retorno".
  - Los datos técnicos van en una sección plegable al final.
- **Letra grande.** Base de 19 px, con botones A− / A+ (tamaños 17, 19, 22 y 25 px) que se recuerdan en `localStorage`.
- **Botones fáciles de tocar,** de 48 px de alto como mínimo.
- **Contraste alto,** nivel WCAG AA como mínimo.
- **Botón "Escuchar".** Lee en voz alta el aviso, la comunidad de la persona y qué hacer (Web Speech API, voz es-MX, velocidad 0.9). Se oculta si el navegador no lo soporta.
- **Color y forma a la vez.** El color nunca va solo: siempre lleva una palabra o un ícono.
- **Página ligera:**
  - Una sola página.
  - Sin frameworks pesados.
  - Menos de 150 KB comprimida, sin contar el mapa con calles opcional.
  - Debe abrir bien con 3G lento.
- **Móvil primero.** Debe verse bien de 360 px de ancho en adelante, sin scroll horizontal.
- **Modo claro y oscuro.**
- **La página nunca muestra datos viejos como si fueran actuales.** Ver la sección 9.

---

## 3. Stack

| Parte | Tecnología |
|---|---|
| Página | HTML + CSS + JavaScript vanilla (ES2020), sin framework ni bundler. Fuentes de Google Fonts con alternativas del sistema. |
| Mapa | SVG dibujado con JS propio (ya hecho en el prototipo). Opcional: Leaflet 1.9.4 desde cdnjs + teselas de OpenStreetMap, detrás del botón "Ver mapa con calles". |
| Bot | Python 3.12 **solo con la biblioteca estándar**: urllib, json, gzip, math, datetime. |
| Pruebas | `unittest` de Python, más una prueba de la página con Playwright (opcional, solo en CI). |
| Programación del bot | GitHub Actions, cada 3 horas. |
| Hospedaje | Vercel, plan Hobby. Sitio estático desde la carpeta `public/`. |
| Datos | Archivos JSON dentro del repositorio. Sin base de datos. |

**Por qué el bot no corre en Vercel:** el plan Hobby solo permite cron una vez al día y con hasta 59 minutos de variación. Por eso el bot corre en GitHub Actions, hace commit de `public/data.json`, y Vercel publica cada commit automáticamente.

---

## 4. Estructura del repositorio

```
.
├── public/
│   ├── index.html          # la página (todo el CSS y JS en línea o en 1-2 archivos)
│   ├── app.js              # opcional, si separas el JS
│   ├── data.json           # lo escribe el bot (no editar a mano)
│   ├── geo.json            # comunidades INEGI + ríos + costa (se genera una vez)
│   └── umbrales.json       # crecidas de 2, 5 y 20 años (se genera una vez)
├── bot/
│   ├── actualizar.py       # programa principal del bot
│   ├── fuentes.py          # una función por fuente
│   ├── riesgo.py           # cálculo del índice (funciones puras)
│   └── config.py           # coordenadas, umbrales de lluvia, pesos
├── scripts/
│   ├── generar_geo.py      # arma public/geo.json desde INEGI y Natural Earth
│   └── calibrar.py         # reproduce octubre de 2025 para ajustar pesos
├── tests/
│   ├── test_riesgo.py
│   └── fixtures/           # respuestas de ejemplo de cada fuente
├── avisos_manuales.json    # avisos de Protección Civil capturados a mano (opcional)
├── .github/workflows/
│   ├── actualizar.yml
│   └── pruebas.yml
├── vercel.json
├── PENDIENTES.md
└── README.md               # en español, para alguien no técnico
```

---

## 5. Fuentes de datos

Para cada fuente, primero verifica que el endpoint responde y guarda una respuesta real en `tests/fixtures/`. Si un endpoint no existe o cambió, anótalo en `PENDIENTES.md`.

### 5.1 Caudal del río: GloFAS v4 (Copernicus) vía Open-Meteo Flood API

Gratis para uso no comercial; incluye atribución.

- **Pronóstico** (punto del río en Álamo, `lat 20.92`, `lon -97.68`):
  ```
  https://flood-api.open-meteo.com/v1/flood?latitude=20.92&longitude=-97.68&daily=river_discharge,river_discharge_median,river_discharge_max,river_discharge_min&past_days=14&forecast_days=10
  ```
- **Histórico para umbrales** (se calcula una sola vez y se guarda en `public/umbrales.json`):
  ```
  ...&daily=river_discharge&start_date=1984-01-01&end_date=2022-07-31
  ```
- **Cómo calcular los umbrales:** toma el máximo de cada año. Las crecidas son cuantiles empíricos de esos máximos:
  - 2 años = 0.5
  - 5 años = 0.8
  - 20 años = 0.95
- La malla es de ~5 km y toma el río más grande cercano. Comprueba que el punto caiga sobre el Pantepec y no sobre otro cauce: prueba moviéndolo ±0.05° y compara caudales. Documenta en `PENDIENTES.md` el punto elegido y por qué.

### 5.2 Lluvia: Open-Meteo Forecast API

```
https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&daily=precipitation_sum,precipitation_probability_max&forecast_days=7&timezone=America/Mexico_City
```

| Punto | Coordenadas | Uso |
|---|---|---|
| Álamo (local) | 20.917, -97.675 | Lluvia en el pueblo |
| Cuenca alta 1 | 20.51, -97.89 | Sierra Norte de Puebla, zona de Pantepec |
| Cuenca alta 2 | 20.73, -97.83 | Francisco Z. Mena |
| Cuenca alta 3 | 20.69, -98.01 | Zona del Vinazco, Ixhuatlán de Madero |
| Cuenca alta 4 | 20.47, -98.08 | Zona de Huehuetla, Hidalgo |

Para "lluvia en la sierra" usa el máximo entre los puntos de la cuenca alta.

### 5.3 Pronóstico oficial por municipio: SMN, Conagua

- Endpoint: `https://smn.conagua.gob.mx/tools/GUI/webservices/?method=1`. Devuelve un JSON comprimido con gzip, con todos los municipios.
- Filtra donde `nmun` contenga "Temapache" y `nes` contenga "Veracruz".
- Puede rechazar conexiones desde servidores fuera de México. Si falla, se marca la fuente como caída y se sigue con las demás.
- Si el pronóstico oficial del día es de 50 mm o más, genera un aviso de nivel 1.

### 5.4 Huracanes: National Hurricane Center (NOAA)

- Endpoint: `https://www.nhc.noaa.gov/CurrentStorms.json`.
- Considera tormentas del Atlántico a menos de 900 km de Álamo y del Pacífico Este a menos de 450 km.
- Nivel del aviso:
  - Huracán a menos de 500 km: nivel 3.
  - Otro sistema a menos de 500 km: nivel 2.
  - Más lejos, pero dentro del radio: nivel 1.

### 5.5 Comunidades: catálogo de localidades del INEGI

- **Fuente:** `data.csv` del repositorio `github.com/eduardoarandah/coordenadas-estados-municipios-localidades-de-mexico-json`. Es una extracción del catálogo del INEGI.
- **Filtro:** `CVE_ENT=30` y `CVE_MUN=160`. Son 460 localidades, con nombre, latitud, longitud y altitud.
- **Pueblos de referencia** (cabeceras dentro del área del mapa): Tuxpan, Poza Rica, Castillo de Teayo, Tihuatlán, Ixhuatlán de Madero, Metlaltoyuca (Francisco Z. Mena), Pantepec (Puebla), Chicontepec, Cazones, Venustiano Carranza, Huehuetla, Tlachichilco, Benito Juárez, Coatzintla.
- **Población para priorizar etiquetas:** de `mexico.pueblosamerica.com/veracruz-de-ignacio-de-la-llave/temapache/`. Toma las ~40 más pobladas y guárdalas en `geo.json` con un campo `pri` (orden por población). Si no puedes descargarla, usa la lista del prototipo A, que ya trae los nombres priorizados.

### 5.6 Ríos y costa: Natural Earth

- Repositorio `nvkelso/natural-earth-vector`, archivo `geojson/ne_10m_rivers_north_america.geojson`:
  - Une las features "Chiflón" y "Pantepec", ordenadas de oeste a este. Es el trazo que pasa por Álamo y llega al mar.
  - Agrega "Cazones" como referencia.
- Costa: `ne_10m_coastline.geojson`, recortada al área.
- **Nota honesta:** el trazo es simplificado y no se ha verificado dónde se une el Vinazco con el Pantepec. No dibujes el Vinazco por separado hasta confirmarlo. En el mapa, etiqueta como "Río Pantepec" el tramo cerca de Álamo y como "Río Tuxpan" el tramo cerca de Tuxpan. Anota esto en `PENDIENTES.md`.

### 5.7 Avisos de Protección Civil de Veracruz

- No hay datos abiertos. Es opcional: el archivo `avisos_manuales.json` se edita desde la web de GitHub.
- Formato de cada aviso: `{fuente, titulo, nivel 0-3, fecha ISO, url}`.
- Solo se muestran los avisos de menos de 48 horas.
- **El sistema debe funcionar perfectamente aunque este archivo esté vacío.**

---

## 6. Cálculo del riesgo (`bot/riesgo.py`, funciones puras con pruebas)

### Entradas

- `serie`: caudal diario, con días pasados y pronóstico.
- `umbrales`: `{rp2, rp5, rp20}`.
- Lluvia diaria de 7 días en Álamo y en cada punto de la sierra.
- `avisos`: lista con `nivel` de 0 a 3.

### Factores

Cada factor va de 0 a 1 y usa interpolación lineal por tramos con `interp(x, puntos)`.

**Caudal (`r_q`)**
- Caudal efectivo: `q_ef = 0.7 × (pico de la mediana en los próximos 7 días) + 0.3 × (pico del máximo del ensamble)`.
- Puntos: `(0,0)`, `(0.5·rp2, 0.1)`, `(rp2, 0.35)`, `(rp5, 0.75)`, `(rp20, 1)`.

**Lluvia en la sierra (`r_s`)**
- Se usa el máximo acumulado en cualquier ventana de 72 h.
- Puntos: `(0,0)`, `(40, 0.1)`, `(80, 0.35)`, `(150, 0.7)`, `(250, 1)`.

**Lluvia en Álamo (`r_l`)**
- También con el máximo acumulado en 72 h.
- Puntos: `(0,0)`, `(50, 0.1)`, `(100, 0.4)`, `(200, 0.8)`, `(300, 1)`.

**Avisos (`r_a`)**
- `r_a = nivel máximo de los avisos / 3`.

### Combinación y nivel

- Fórmula: `score = 1 − (1 − 0.85·r_q)(1 − 0.45·r_s)(1 − 0.25·r_l)(1 − 0.5·r_a)`.
- Probabilidad: `probabilidad = round(100 · score)`.
- Nivel según la probabilidad:

| Probabilidad | Nivel |
|---|---|
| Menos de 25 | 0, "Sin peligro" |
| 25 a 49 | 1, "Esté atento" |
| 50 a 74 | 2, "Peligro" |
| 75 o más | 3, "Peligro muy alto" |

- **Regla fija:** `nivel = max(nivel, nivel máximo de los avisos oficiales)`. Un aviso oficial nunca se rebaja.

Todos los pesos y puntos van en `config.py`, para que se puedan ajustar.

### Resumen en palabras sencillas (lo escribe el bot)

Son 2 a 4 frases cortas, en este orden.

1. **Cómo está el río:**
   - "El río está normal."
   - "El río va a subir, pero se espera que siga dentro de su cauce." (desde 0.5·rp2)
   - "El río puede llegar a la orilla y salirse en las partes bajas." (desde rp2)
   - "El río puede salirse de su cauce y meterse a las calles." (desde rp5)
2. **Lluvia** (solo la primera que aplique):
   - Sierra con 150 mm o más: "Va a llover muchísimo en la sierra, de donde baja el agua."
   - Sierra con 80 mm o más: "Va a llover fuerte en la sierra, de donde baja el agua."
   - Álamo con 50 mm o más: "Va a llover fuerte en Álamo."
   - Si nada de lo anterior aplica: "No se espera lluvia fuerte esta semana."
3. **Avisos**, solo si hay alguno: "Hay avisos de las autoridades; léalos más abajo."
4. **Cierre:**
   - Nivel 3: "Si vive cerca del río, salga a un lugar alto."
   - Nivel 1 o 2: "Esté pendiente."

### Riesgo por comunidad (lo calcula la página)

- Distancia al trazo del río en km, con proyección equirectangular a latitud 20.95°.
- Altitud según el INEGI.

| Zona | Condición | Nivel de la comunidad |
|---|---|---|
| Junto al río | Distancia de 1.5 km o menos **y** altitud de 45 m o menos | El nivel del día |
| Cerca del río | Distancia de 4 km o menos **y** altitud de 80 m o menos | Un nivel menos (mínimo 0) |
| Lejos del río | Todo lo demás | Dos niveles menos (mínimo 0) |

Cada zona lleva la frase del prototipo. La ficha debe aclarar: "Riesgo estimado con la distancia al río y la altura. No toma en cuenta los arroyos."

---

## 7. Formato de `public/data.json`

```json
{
  "version": 1,
  "actualizado": "2026-10-23T16:17:00+00:00",
  "lugar": "Álamo Temapache, Veracruz",
  "riesgo": {
    "nivel": 1,
    "probabilidad": 46,
    "resumen": "El río va a subir… Esté pendiente.",
    "factores": [
      {"nombre": "Caudal pronosticado", "detalle": "Pico de 780 m³/s; crecida de 2 años: 900 m³/s", "valor": 0.32}
    ]
  },
  "rio": {
    "umbrales": {"rp2": 900, "rp5": 1500, "rp20": 2600},
    "serie": [{"fecha": "2026-10-23", "caudal": 240, "min": null, "max": null, "pron": false}]
  },
  "lluvia": [{"fecha": "2026-10-23", "mm": 12, "cuenca_mm": 20, "prob": 70}],
  "avisos": [{"fuente": "SMN · Conagua", "titulo": "…", "nivel": 1, "fecha": "…", "url": "…"}],
  "fuentes": [{"nombre": "…", "aporta": "…", "url": "…", "ok": true, "fecha": "…"}]
}
```

Reglas del bot al escribir este archivo:
- Escritura atómica: escribe en `data.json.tmp` y luego renómbralo.
- Si una fuente falla, conserva su sección de la lectura anterior y márcala con `ok: false`.
- Si **todas** las fuentes fallan, no toques el archivo y termina con código de error, para que GitHub mande el correo de falla.
- Valida que el JSON resultante cumpla este esquema antes de reemplazar el anterior.

---

## 8. La página (`public/index.html`)

### Referencias visuales

- Las referencias están en `referencia/propuesta-a.html` y `referencia/propuesta-b.html`. Ábrelas en el navegador y estúdialas.
- **Diseño a implementar: PROPUESTA B.** (Si prefiero la A, cambiaré esta línea.)
- Reutiliza de los prototipos todo lo que sirva: textos, íconos SVG, el mapa, la búsqueda, la escena del puente y las frases. Están probados, pero refactorízalos para que el código quede limpio y mantenible.

### Secciones, en este orden

1. **Barra superior:** "Álamo Temapache", fecha de hoy y los botones Escuchar, A− y A+.
2. **Respuesta principal.** Bloque de color del nivel con:
   - La pregunta "¿Se va a inundar Álamo?".
   - Respuesta gigante: NO / PUEDE SER / SÍ / SÍ.
   - Subtítulo: "Hoy no hay peligro" / "Esté atento" / "Peligro: prepárese" / "Peligro muy alto".
   - El resumen del bot.
   - La línea "Su comunidad, X: …" si la persona ya eligió su comunidad.
3. **Escena del puente** (SVG). Muestra:
   - El río, el puente y la regla de colores en la pila. Bandas: verde hasta la orilla, amarillo, naranja y rojo.
   - El agua sube animada hasta el nivel de hoy y marca "HOY".
   - Una línea punteada en el pico pronosticado ("MAÑANA" o "EN N DÍAS"), solo si sube de forma notable.
   - Un cielo que cambia según el nivel: sol, nubes o lluvia.
   - Debajo, "Posibilidad de inundación: N de cada 100" y "Revisado hace X".
4. **"¿Dónde vive usted?"**
   - Botones con las 8 comunidades más pobladas, cada uno con un punto del color de su riesgo.
   - Buscador sin importar acentos: muestra hasta 8 resultados con "a X km del centro de Álamo · Y m de altura".
   - Ficha de la comunidad: nombre, nivel, frase, distancia al río, altura y distancia a Álamo.
   - La comunidad elegida se guarda en `localStorage` (`mi_comunidad`).
5. **Mapa** con las 460 comunidades:
   - Puntos del color de su riesgo, río con corriente animada, costa, pueblos vecinos, escala en km y etiquetas sin encimarse.
   - Controles: arrastrar, pellizcar, rueda del ratón, botones +, − y "ver todo", y tocar un punto para seleccionarlo.
   - Botón "Ver mapa con calles", solo en producción: carga Leaflet y OpenStreetMap con atribución.
6. **"El río esta semana":** 7 tubos tipo regla, con lluvia del día (ícono) y una palabra: Normal / Alto / Se sale / Inunda.
7. **"Qué hacer hoy":** 3 o 4 acciones con ícono, según el nivel. Usa los textos del prototipo.
8. **911** en un recuadro rojo, con el texto "Esta página no reemplaza los avisos de Protección Civil".
9. **Avisos de las autoridades:** con etiqueta del nivel, fuente y hora.
10. **"Datos técnicos y fuentes"** (plegable):
    - Gráfica del caudal de 14 días más el pronóstico, con su rango y las líneas de crecida de 2, 5 y 20 años.
    - Factores del índice.
    - Tabla de fuentes con su estado y última lectura.
    - Metodología en 3 líneas.
11. **Pie:** atribuciones a Copernicus GloFAS, Open-Meteo, SMN, NHC, INEGI, Natural Earth y OpenStreetMap.

### Comportamiento

- **Carga de datos:** `fetch('data.json', {cache: 'no-store'})`. Recarga sola cada 15 minutos si la pestaña está visible.
- **Modo demostración:** se activa con `?demo=normal|vigilancia|alerta`, o automáticamente si no hay `data.json`. Muestra los tres escenarios del prototipo y una franja que diga "Datos de ejemplo".
- **Datos atrasados:** si `actualizado` tiene más de 12 horas, muestra arriba de todo una franja gris oscura:
  "⚠ Datos atrasados: la última revisión fue hace X horas. Consulte la radio y a Protección Civil."
  - Además, apaga el color verde: con datos atrasados nunca se muestra "NO, sin peligro".
- **Sin internet:** si falla la carga, muestra el último `data.json` guardado en `localStorage` con su fecha y la franja de datos atrasados. Así nunca hay una pantalla vacía.
- **Accesibilidad:**
  - `aria-live` en la respuesta principal.
  - Foco visible.
  - `prefers-reduced-motion` desactiva las animaciones.
  - Etiquetas en todos los controles.
  - `lang="es-MX"`.
- **Metadatos para compartir por WhatsApp:**
  - Título "¿Se inunda Álamo? · Hoy: [respuesta]" e imagen Open Graph estática.
  - El título dinámico es opcional.

### Diseño (tokens de la propuesta B)

- **Fuentes:**
  - Barlow Condensed (700/800) para títulos de letrero, en mayúsculas.
  - Barlow (400–700) para el texto.
  - JetBrains Mono solo para datos técnicos.
- **Colores claros:**
  - Fondo `#E9F0F5`, superficie `#FFFFFF`, tinta `#0B1F2A`.
  - Verde `#1E7B3E`, amarillo `#F5C518` (con texto oscuro encima), naranja `#E06A10`, rojo `#C8231F`.
  - Agua `#4F7F95`, río `#2F78A8`.
- **Colores oscuros:** los mismos de la propuesta B.
- **Bordes y redondeo:** bordes gruesos de 3–4 px en color tinta y radio de 12–18 px, estilo letrero de Protección Civil.

---

## 9. Despliegue y operación sin supervisión

### GitHub Actions: `.github/workflows/actualizar.yml`

- **Disparadores:**
  - `schedule`: `cron: "17 */3 * * *"`.
  - `workflow_dispatch`.
  - `push` cuando cambie `avisos_manuales.json` o `bot/**`.
- **Configuración:**
  - `permissions: contents: write`.
  - `concurrency` para evitar ejecuciones simultáneas.
  - `timeout-minutes: 10`.
- **Pasos:**
  1. checkout.
  2. setup-python 3.12.
  3. `python -m unittest`.
  4. `python bot/actualizar.py`.
  5. Commit y push de `public/data.json` solo si cambió. El mensaje del commit es `datos: AAAA-MM-DDTHH:MMZ`.

**Regla de los 60 días:** en repositorios públicos, GitHub desactiva los workflows programados si el repositorio pasa 60 días sin actividad. Agrega una acción de keepalive mantenida, por ejemplo `gautamkrishnar/keepalive-workflow`; verifica que siga activa y documenta la elección.

### `pruebas.yml`

- Se ejecuta en cada pull request y en cada push a `main`.
- Corre las pruebas unitarias y valida `data.json` contra el esquema.
- Opcional: Playwright abre `public/index.html?demo=alerta` a 390 px de ancho, comprueba que no haya errores en consola ni scroll horizontal y guarda una captura de pantalla.

### `vercel.json`

- `outputDirectory: "public"`, sin paso de build.
- Encabezado `Cache-Control: no-cache, must-revalidate` para `/data.json`.
- Caché larga para `geo.json` y las fuentes.
- Encabezados de seguridad básicos: `X-Content-Type-Options` y `Referrer-Policy`.

### Monitoreo sin que nadie vigile

1. GitHub manda un correo cuando el workflow falla. El README debe explicar cómo activarlo.
2. La franja de "Datos atrasados" protege a los usuarios si el bot se detiene.
3. Opcional: un ping a Healthchecks.io al final de cada ejecución exitosa, con la URL guardada en el secreto `HEALTHCHECK_URL`. Si el secreto no existe, se omite sin fallar.
4. Opcional, en una fase posterior: un bot de Telegram que publique en un canal cuando el nivel suba. Déjalo diseñado en `PENDIENTES.md`, sin implementarlo.

---

## 10. Calibración con octubre de 2025 (`scripts/calibrar.py`)

1. Descarga el caudal de GloFAS y la lluvia del 1 al 12 de octubre de 2025. Para la lluvia usa la API histórica de Open-Meteo (`archive-api.open-meteo.com/v1/archive`) en los mismos puntos.
2. Calcula el índice día por día como si fuera "hoy" en cada fecha. Usa los datos observados como si fueran pronóstico; anota esa limitación.
3. **Meta:** el índice debe llegar a nivel 3 a más tardar el 8 de octubre de 2025. Si no llega, propón ajustes a los pesos o a los puntos de `interp` y muéstrame la tabla antes y después.
4. Revisa también que en días normales de octubre a diciembre el índice no pase de nivel 1 sin razón. Así se evitan falsas alarmas, que destruyen la confianza de la gente.

---

## 11. Pruebas mínimas (`tests/test_riesgo.py`)

- `interp`: valores en los extremos, en medio de un tramo y fuera de rango.
- **Tres escenarios fijos** que deben dar:
  - Normal: nivel 0 y menos de 15 %.
  - Frente frío: nivel 1 o 2.
  - Huracán: nivel 3.
- Un aviso de nivel 3 con lluvia en 0 debe dar nivel 3.
- Si todas las fuentes fallan, `data.json` no se modifica y el bot sale con código distinto de 0.
- Si falla una sola fuente, se conserva su sección anterior con `ok: false`.
- El resumen nunca contiene "m³/s" ni "periodo de retorno".
- Riesgo por comunidad:
  - Álamo (19 m, ~1.3 km del río) queda como "junto al río".
  - Las Cañas de Abajo queda como "lejos del río".

---

## 12. Criterios de aceptación

- [ ] `public/index.html` abre sin errores en Chrome Android, en Safari iOS y en escritorio.
- [ ] A 360 px de ancho no hay scroll horizontal.
- [ ] Con `?demo=alerta` se ve "SÍ · Peligro muy alto" en rojo, con el agua subiendo y lluvia en la escena.
- [ ] Buscar "canas" encuentra "Las Cañas de Abajo"; la ficha muestra su riesgo y la línea aparece en la respuesta principal.
- [ ] El mapa muestra las 460 comunidades y se puede mover y acercar con el dedo.
- [ ] El botón Escuchar lee el aviso en español.
- [ ] `python bot/actualizar.py` genera un `data.json` válido con datos reales.
- [ ] El workflow corre con `workflow_dispatch` y hace commit.
- [ ] Vercel publica el commit y la página muestra "Revisado hace unos minutos".
- [ ] Si `data.json` tiene más de 12 horas, aparece la franja de datos atrasados y nunca se muestra verde.
- [ ] La página pesa menos de 150 KB comprimida, sin contar Leaflet ni las teselas.
- [ ] El README explica, sin tecnicismos, cómo publicar, cómo agregar un aviso manual y qué hacer si llega un correo de falla.
- [ ] `PENDIENTES.md` lista todo lo que no se pudo verificar.

---

## 13. Orden de trabajo sugerido

1. Estructura del repositorio y `config.py`.
2. `scripts/generar_geo.py` → `public/geo.json`. Verifica 460 localidades y que Álamo esté en 20.9171, -97.6755.
3. `bot/fuentes.py`: probar cada fuente y guardar sus fixtures.
4. `bot/riesgo.py` con sus pruebas.
5. `bot/actualizar.py` con el manejo de fallas y la escritura atómica.
6. Umbrales históricos → `public/umbrales.json`.
7. La página, primero en modo demo y luego con `data.json` real.
8. Calibración con octubre de 2025.
9. Workflows, `vercel.json` y README.
10. Revisión final contra los criterios de aceptación.
11. Pedirme permiso para crear el repositorio en GitHub y conectar Vercel.

---

## 14. Fuera de alcance (no hacer)

- Cuentas de usuario, base de datos o backend propio.
- Frameworks como React o Next.js, ni bundlers.
- Recolectar datos personales o ubicación sin un botón explícito. La geolocalización solo se usa si la persona toca "Usar mi ubicación"; es opcional.
- Afirmar que la página es oficial o que sustituye a Protección Civil.
- Inventar coordenadas, umbrales o avisos.
