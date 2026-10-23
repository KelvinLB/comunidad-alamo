# Pendientes y cosas sin verificar

Lista de lo que no se pudo confirmar o que queda para después. Si algo de aquí se resuelve, bórrelo de la lista.

## Datos sin verificar

- **Trazo del río (Natural Earth 10m).** Es simplificado: une las líneas "Chiflón" y "Pantepec" de oeste a este. No se ha verificado dónde se une el Vinazco con el Pantepec, por eso el Vinazco no se dibuja aparte. En el mapa se rotula "Río Pantepec" cerca de Álamo y "Río Tuxpan" cerca de Tuxpan. La distancia al río de cada comunidad depende de este trazo y puede tener error de algunos cientos de metros.
- **Altitud de las comunidades.** Viene del catálogo del INEGI (un solo punto por localidad). En comunidades grandes, unas calles están más bajas que el punto oficial.
- **Prioridad por población.** Sale del Censo 2020 según PueblosAmerica.com (no es fuente oficial). Cuando un nombre se repite, se asigna a la localidad con clave INEGI más baja. Desde el lugar 23 el orden difiere un poco del prototipo, porque se reconoció "Héroes del 47 (Otatal)" con su nombre del INEGI.
- **Botones de comunidades.** Se muestran las 8 más pobladas (como dice la especificación). El prototipo tenía Buenos Aires y Las Cañas de Abajo en lugar de Temapache y La Concepción.

## Fuentes

Todas se probaron el 23 de octubre de 2026 y sus respuestas reales están en `tests/fixtures/`.

- **Punto del río en GloFAS: 20.92, -97.68** (celda 20.925, -97.675). Se comparó con las 8 celdas vecinas (±0.05°) en septiembre-octubre de 2025: la fila de latitud 20.925 es el cauce grande y el caudal crece aguas abajo (pico de 1,482 / 1,636 / 1,662 m³/s de oeste a este). Las celdas de 20.875 y 20.975 dan de 7 a 120 m³/s, son arroyos. Se queda el punto de la especificación.
- **GloFAS se atrasa un poco.** En octubre de 2025 el pico simulado cae el 11 de octubre; el río se desbordó el 9 y 10. Ver la calibración.
- **SMN · Conagua** responde desde México (archivo gzip con 9,852 filas; Álamo Temapache trae 4 días). Falta comprobar que responda desde los servidores de GitHub Actions (están en EE. UU.). Si no responde, el bot lo marca como caído y sigue.
- **NHC.** Las claves de tipo de sistema (`HU`, `TS`, `TD`, `STS`, `PTC`, `PC`…) se tradujeron según la documentación del NHC; si aparece una desconocida se muestra como "Sistema tropical". La cuenca se lee del `id` (`al` = Atlántico, `ep` = Pacífico Este; el Pacífico Central se ignora).
- **Lluvia en la sierra.** Para cada día se toma el punto de la cuenca alta con más lluvia, y sobre esa serie se busca el máximo de 72 h. Es un poco más conservador que calcular las 72 h de cada punto por separado.

## Para después
