"""Reproduce octubre de 2025 para revisar los pesos del índice.

    python scripts/calibrar.py            # tabla del 1 al 12 de octubre + revisión de falsas alarmas
    python scripts/calibrar.py --desde 2025-10-15 --hasta 2025-12-31

Para cada día D se calcula el índice "como si hoy fuera D": la serie del río y la lluvia de D a D+6
son lo que de verdad pasó (simulación GloFAS y lluvia ERA5). Es un pronóstico perfecto: en la vida
real el pronóstico falla, sobre todo con 4 o más días de anticipación. No hay avisos históricos,
así que el factor de avisos queda en 0.
"""

import argparse
import json
import sys
import urllib.parse
import urllib.request
from datetime import date, timedelta
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ / "bot"))
import config as C  # noqa: E402
import riesgo  # noqa: E402

CACHE = RAIZ / "cache"


def bajar(url, nombre):
    CACHE.mkdir(exist_ok=True)
    f = CACHE / nombre
    if not f.exists():
        with urllib.request.urlopen(url, timeout=120) as r:
            f.write_bytes(r.read())
    return json.loads(f.read_text())


def datos(inicio, fin):
    """Caudal GloFAS y lluvia diaria observada (Álamo y máximo de la sierra) entre dos fechas."""
    lat, lon = C.PUNTO_RIO
    g = bajar(f"https://flood-api.open-meteo.com/v1/flood?latitude={lat}&longitude={lon}"
              f"&daily=river_discharge&start_date={inicio}&end_date={fin}", f"cal_glofas_{inicio}_{fin}.json")
    caudal = dict(zip(g["daily"]["time"], g["daily"]["river_discharge"]))

    pts = [C.PUNTO_LOCAL] + C.PUNTOS_CUENCA
    q = {
        "latitude": ",".join(str(p[1]) for p in pts), "longitude": ",".join(str(p[2]) for p in pts),
        "daily": "precipitation_sum", "start_date": inicio, "end_date": fin, "timezone": C.ZONA_HORARIA,
    }
    a = bajar("https://archive-api.open-meteo.com/v1/archive?" + urllib.parse.urlencode(q, safe=",/"),
              f"cal_lluvia_{inicio}_{fin}.json")
    fechas = a[0]["daily"]["time"]
    local = dict(zip(fechas, a[0]["daily"]["precipitation_sum"]))
    sierra = {f: max((c["daily"]["precipitation_sum"][i] or 0) for c in a[1:]) for i, f in enumerate(fechas)}
    return caudal, local, sierra


def dia(d, caudal, local, sierra, umbrales):
    hoy = d.isoformat()
    serie, lluvia = [], []
    for k in range(-14, 10):
        f = (d + timedelta(days=k)).isoformat()
        if caudal.get(f) is not None:
            serie.append({"fecha": f, "caudal": caudal[f], "min": None, "max": None, "pron": k > 0})
    for k in range(7):
        f = (d + timedelta(days=k)).isoformat()
        if f in local:
            lluvia.append({"fecha": f, "mm": local[f] or 0, "cuenca_mm": sierra[f], "prob": None})
    return riesgo.calcular(serie, umbrales, lluvia, [], hoy)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--desde", default="2025-10-01")
    ap.add_argument("--hasta", default="2025-10-12")
    args = ap.parse_args()
    d0, d1 = date.fromisoformat(args.desde), date.fromisoformat(args.hasta)
    umbrales = json.loads((RAIZ / "public" / "umbrales.json").read_text())
    caudal, local, sierra = datos((d0 - timedelta(days=14)).isoformat(), (d1 + timedelta(days=9)).isoformat())

    print(f"Umbrales: 2 años {umbrales['rp2']} · 5 años {umbrales['rp5']} · 20 años {umbrales['rp20']} m³/s\n")
    print("fecha       caudal  sierra  Álamo |  r_q   r_s   r_l | prob nivel")
    d, niveles = d0, {}
    while d <= d1:
        f = d.isoformat()
        r = dia(d, caudal, local, sierra, umbrales)
        v = [x["valor"] for x in r["factores"]]
        niveles[f] = r["nivel"]
        print(f"{f} {caudal.get(f) or 0:7.0f} {sierra.get(f, 0):6.0f}mm {local.get(f, 0):4.0f}mm |"
              f" {v[0]:.2f}  {v[1]:.2f}  {v[2]:.2f} | {r['probabilidad']:3d}   {r['nivel']}")
        d += timedelta(days=1)

    if args.desde == "2025-10-01":
        n8 = max(n for f, n in niveles.items() if f <= "2025-10-08")
        print(f"\nMeta: nivel 3 a más tardar el 8 de octubre → nivel máximo hasta esa fecha: {n8}",
              "✓" if n8 == 3 else "✗")
    else:
        altos = {f: n for f, n in niveles.items() if n >= 2}
        print(f"\nDías con nivel 2 o más: {len(altos)} de {len(niveles)}", altos or "")


if __name__ == "__main__":
    main()
