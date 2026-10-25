# ¿Se inunda Álamo? · Alerta Pantepec

Página web que responde, con solo abrirla, si hay peligro de inundación por el río Pantepec en **Álamo Temapache, Veracruz**, y en cada una de las 460 comunidades del municipio.

- Tiene forma de **periódico**: primero pregunta "¿Dónde vive usted?" y, al elegir la comunidad, muestra su propia edición (respuesta, qué hacer, el parte del río y el mapa). Arriba siempre se ve el aviso de todo el municipio.
- **El parte de 7 días** trae el día con su fecha ("Martes · 27 de octubre"), el dibujo de la lluvia con su probabilidad, cómo estará el río y la temperatura máxima y mínima. Cada día se toca para ver el detalle. La temperatura de hoy sale también en la cabecera.
- Se revisa **sola cada hora**, consultando fuentes científicas y oficiales: el pronóstico del río (Copernicus GloFAS), la lluvia en Álamo y en la sierra y la temperatura (Open-Meteo), el pronóstico oficial (SMN · Conagua) y los huracanes (Centro Nacional de Huracanes).
- Funciona en celulares sencillos y con internet lento. Pesa menos de 100 KB.
- Se puede **poner como ícono en el teléfono** sin descargar nada de la tienda (es una "PWA"). Así abre rápido y, si no hay señal, muestra la última revisión guardada con el aviso "Sin conexión".
- Trae un botón para **compartir el aviso por WhatsApp** y otro para **imprimir una hoja** con código QR, para pegarla en la tienda, la agencia municipal o la iglesia.
- Cuando hay **peligro** (nivel 2 o 3), al abrir la página sale primero un aviso de color a pantalla completa.
- Tiene una guía para que hijos y nietos **le dejen la página lista a sus papás**, con su comunidad ya elegida.
- Cuesta **$0 al mes**: GitHub hace las revisiones y Vercel publica la página.
- **No es una página oficial** y no reemplaza los avisos de Protección Civil.

---

## Cómo funciona, en pocas palabras

1. Cada hora, un "robot" de GitHub (se llama *GitHub Actions*) corre el programa de la carpeta `bot/`.
2. El robot consulta las fuentes, calcula la posibilidad de inundación y guarda el resultado en el archivo `public/data.json`.
3. En cuanto ese archivo cambia, Vercel publica la página nueva. No hay que hacer nada a mano.
4. Si una fuente no responde, se usa su última lectura y se marca como "sin respuesta".
5. Si el robot se detiene, la página lo nota: a las 12 horas sin revisión pone una franja gris de **"Datos atrasados"** y deja de mostrar el verde de "sin peligro".

---

## Cómo publicar la página (una sola vez)

Necesita una cuenta de GitHub y una de Vercel (las dos son gratis).

1. **Suba el proyecto a GitHub.** Cree un repositorio **público** nuevo (por ejemplo, `alerta-pantepec`) y suba esta carpeta.
2. **Permita que el robot guarde cambios.** En GitHub, vaya a *Settings → Actions → General → Workflow permissions* y elija **Read and write permissions**. Guarde.
3. **Conecte Vercel.** En [vercel.com](https://vercel.com), elija *Add New → Project*, escoja el repositorio y oprima *Deploy*. No cambie nada: el archivo `vercel.json` ya le dice a Vercel qué publicar.
4. **Pruebe el robot.** En GitHub, vaya a la pestaña *Actions → Actualizar datos → Run workflow*. En un par de minutos debe aparecer un cambio nuevo llamado `datos: …` y, poco después, la página dirá "Revisado hace unos minutos".
5. **Ponga la dirección de la imagen para WhatsApp.** Cuando Vercel le dé la dirección de la página (por ejemplo, `https://alerta-pantepec.vercel.app`), abra `public/index.html` y cambie `content="og.png"` por `content="https://alerta-pantepec.vercel.app/og.png"`.

---

## Cómo poner la página en el teléfono

Abajo de la pantalla siempre está el botón negro **"Instalar en mi teléfono"** (se quita solo cuando la página ya está instalada). Al tocarlo:

- **Android (Chrome):** sale la ventana del teléfono para instalar; se toca **"Instalar"** y listo.
- **iPhone:** Apple no deja que una página se instale sola, así que sale una guía de 3 pasos: **Compartir** → **"Agregar a inicio"** → **"Agregar"**.
- **Dentro de Facebook, Instagram u otra app:** la guía pide abrir la página en Safari o en Chrome y trae un botón para copiar la dirección.
- **En computadora:** sale un código QR para abrir la página en el celular.

Funciona solo cuando la página ya está publicada (con `https://`); en `localhost` se puede probar en la computadora.

---

## Cómo agregar un aviso de Protección Civil

Los avisos de Protección Civil de Veracruz no se publican en un formato que el robot pueda leer. Si usted ve un aviso oficial (en sus redes o en la radio), puede capturarlo a mano:

1. En GitHub, abra el archivo `avisos_manuales.json` y oprima el lápiz (*Edit this file*).
2. Escriba el aviso entre los corchetes `[ ]`, así:

   ```json
   [
     {
       "fuente": "Protección Civil Veracruz",
       "titulo": "Alerta roja en Álamo Temapache. Refugios temporales abiertos.",
       "nivel": 3,
       "fecha": "2026-10-23T09:30:00-06:00",
       "url": "https://www.facebook.com/ProteccionCivilVer"
     }
   ]
   ```

   - **nivel:** `0` información, `1` esté atento, `2` alerta, `3` emergencia. Un aviso de nivel 3 pone toda la página en "Peligro muy alto".
   - **fecha:** cuándo se publicó el aviso, con la hora de México (`-06:00` al final).
   - Para poner dos avisos, sepárelos con una coma: `[ {…}, {…} ]`.
3. Oprima *Commit changes*. El robot se corre solo en ese momento y la página cambia en unos minutos.
4. Los avisos **desaparecen solos después de 48 horas**. Si el archivo queda vacío (`[]`) o con un error, la página sigue funcionando sin él.

---

## Si le llega un correo de falla

GitHub manda un correo cuando el robot falla. Para recibirlos, en GitHub entre a su foto → *Settings → Notifications → Actions* y active **"Send notifications for failed workflows only"**.

Qué hacer:

- **Una falla aislada** casi siempre es porque alguna fuente no respondió esa vez. Si el siguiente correo no llega (la siguiente revisión salió bien), no hay que hacer nada.
- **Varias fallas seguidas** quieren decir que todas las fuentes fallaron o que algo cambió. Entre a *Actions*, abra la ejecución con la ❌ y lea el último mensaje. Pídale ayuda a alguien con conocimientos técnicos y muéstrele ese mensaje y el archivo `PENDIENTES.md`.
- **Mientras tanto la gente está protegida:** si pasan 12 horas sin revisión, la página lo avisa con la franja de "Datos atrasados" y deja de decir "sin peligro".

### Vigilancia extra (opcional)

[Healthchecks.io](https://healthchecks.io) es gratis y le avisa si el robot **deja de correr** (no solo si falla). Cree un "check" con periodo de 1 hora y 2 horas de tolerancia (GitHub a veces retrasa las corridas), copie su dirección y guárdela en GitHub en *Settings → Secrets and variables → Actions → New repository secret* con el nombre `HEALTHCHECK_URL`.

---

## Para probar la página

- `?demo=normal`, `?demo=vigilancia` o `?demo=alerta` al final de la dirección muestra datos de ejemplo (con una franja que lo dice).
- Para correrla en su computadora: `python3 -m http.server 8000 --directory public` y abra `http://localhost:8000`.

## Para quien le dé mantenimiento

| Qué | Dónde |
|---|---|
| Pesos y umbrales del índice | `bot/config.py` |
| Cálculo del riesgo y frases del resumen | `bot/riesgo.py` |
| Fuentes de datos | `bot/fuentes.py` |
| Programa del robot | `bot/actualizar.py` (lo corre `.github/workflows/actualizar.yml`) |
| Formato de `data.json` | `bot/esquema.py` |
| Pruebas | `python -m unittest` (y `node tests/pagina.mjs` para la página) |
| Comunidades, río y costa | `python scripts/generar_geo.py` → `public/geo.json` |
| Crecidas de 2, 5 y 20 años | `python scripts/calcular_umbrales.py` → `public/umbrales.json` |
| Revisión con octubre de 2025 | `python scripts/calibrar.py` |
| Abrir sin señal (PWA) | `public/sw.js` y `public/manifest.webmanifest`. Si cambia `app.js`, suba el número de `app.js?v=` en `index.html` y en la lista `BASE` de `sw.js` |
| Íconos del teléfono | `node scripts/iconos.mjs` → `public/icono-*.png` |
| Lo que falta verificar | `PENDIENTES.md` |

El bot solo usa la biblioteca estándar de Python 3.12: no hay que instalar nada.

## Créditos de los datos

Copernicus Global Flood Awareness System (GloFAS) · Open-Meteo (CC BY 4.0) · Servicio Meteorológico Nacional, Conagua · National Hurricane Center, NOAA · INEGI, catálogo de localidades · Natural Earth · OpenStreetMap y sus colaboradores. Población por localidad: Censo 2020 vía PueblosAmerica.com.
