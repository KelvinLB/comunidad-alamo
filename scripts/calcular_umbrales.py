"""Calcula las crecidas de 2, 5 y 20 años del Pantepec en Álamo y las guarda en public/umbrales.json.

    python scripts/calcular_umbrales.py

Método: caudal diario de GloFAS v4 (reanálisis) → máximo de cada año completo → cuantiles empíricos
(interpolación lineal) 0.5, 0.8 y 0.95. Se corre una sola vez.
"""

import json
import sys
import urllib.request
from collections import defaultdict
from datetime import date
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ / "bot"))
import config as C  # noqa: E402

INICIO, FIN = "1984-01-01", "2022-07-31"
CUANTILES = {"rp2": 0.5, "rp5": 0.8, "rp20": 0.95}


def cuantil(valores, p):
    """Cuantil empírico con interpolación lineal (tipo 7 de Hyndman y Fan)."""
    v = sorted(valores)
    h = (len(v) - 1) * p
    i = int(h)
    return v[i] + (h - i) * (v[min(i + 1, len(v) - 1)] - v[i])


def main():
    lat, lon = C.PUNTO_RIO
    url = (f"https://flood-api.open-meteo.com/v1/flood?latitude={lat}&longitude={lon}"
           f"&daily=river_discharge&start_date={INICIO}&end_date={FIN}")
    with urllib.request.urlopen(url, timeout=120) as r:
        d = json.load(r)["daily"]

    por_anio = defaultdict(list)
    for fecha, q in zip(d["time"], d["river_discharge"]):
        if q is not None:
            por_anio[int(fecha[:4])].append(q)

    # Solo años completos (sin días faltantes)
    maximos = {}
    for anio, qs in sorted(por_anio.items()):
        dias = (date(anio + 1, 1, 1) - date(anio, 1, 1)).days
        if len(qs) == dias:
            maximos[anio] = max(qs)
        else:
            print(f"  {anio}: incompleto ({len(qs)} de {dias} días), no se usa")

    if len(maximos) < 15:
        sys.exit(f"Muy pocos años completos ({len(maximos)}) para calcular umbrales")

    u = {k: round(cuantil(list(maximos.values()), p)) for k, p in CUANTILES.items()}
    salida = {
        **u,
        "punto": {"lat": lat, "lon": lon},
        "periodo": f"{min(maximos)}-{max(maximos)}",
        "anios": len(maximos),
        "metodo": "Cuantiles empíricos (0.5, 0.8, 0.95) de los máximos anuales del caudal diario de GloFAS v4.",
        "maximos_anuales": {str(a): round(q, 1) for a, q in maximos.items()},
    }
    (RAIZ / "public" / "umbrales.json").write_text(
        json.dumps(salida, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"Años completos: {len(maximos)} ({salida['periodo']})")
    print(f"Crecida de 2 años: {u['rp2']} m³/s · 5 años: {u['rp5']} m³/s · 20 años: {u['rp20']} m³/s")


if __name__ == "__main__":
    main()
