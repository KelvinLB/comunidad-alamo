"""Validación del formato de public/data.json (sin dependencias externas).

Uso desde la terminal:  python bot/esquema.py public/data.json
"""

import json
import sys
from datetime import datetime


class EsquemaInvalido(ValueError):
    pass


def _tipo(valor, tipos, ruta, nulo=False):
    if valor is None and nulo:
        return
    if isinstance(valor, bool) and bool not in (tipos if isinstance(tipos, tuple) else (tipos,)):
        raise EsquemaInvalido(f"{ruta}: se esperaba {tipos}, llegó booleano")
    if not isinstance(valor, tipos):
        raise EsquemaInvalido(f"{ruta}: se esperaba {tipos}, llegó {type(valor).__name__}")


def _fecha(valor, ruta, nulo=False):
    if valor is None and nulo:
        return
    _tipo(valor, str, ruta)
    try:
        datetime.fromisoformat(valor.replace("Z", "+00:00"))
    except ValueError:
        raise EsquemaInvalido(f"{ruta}: fecha inválida {valor!r}")


def _campos(obj, campos, ruta):
    _tipo(obj, dict, ruta)
    faltan = [c for c in campos if c not in obj]
    if faltan:
        raise EsquemaInvalido(f"{ruta}: faltan {', '.join(faltan)}")


NUM = (int, float)


def validar(d):
    _campos(d, ["version", "actualizado", "lugar", "riesgo", "rio", "lluvia", "avisos", "fuentes"], "data")
    if d["version"] != 1:
        raise EsquemaInvalido("data.version debe ser 1")
    _fecha(d["actualizado"], "data.actualizado")
    _tipo(d["lugar"], str, "data.lugar")

    r = d["riesgo"]
    _campos(r, ["nivel", "probabilidad", "resumen", "factores"], "riesgo")
    _tipo(r["nivel"], int, "riesgo.nivel")
    if not 0 <= r["nivel"] <= 3:
        raise EsquemaInvalido("riesgo.nivel fuera de 0-3")
    _tipo(r["probabilidad"], NUM, "riesgo.probabilidad")
    if not 0 <= r["probabilidad"] <= 100:
        raise EsquemaInvalido("riesgo.probabilidad fuera de 0-100")
    _tipo(r["resumen"], str, "riesgo.resumen")
    if not r["resumen"].strip():
        raise EsquemaInvalido("riesgo.resumen vacío")
    _tipo(r["factores"], list, "riesgo.factores")
    for i, f in enumerate(r["factores"]):
        _campos(f, ["nombre", "detalle", "valor"], f"riesgo.factores[{i}]")
        _tipo(f["valor"], NUM, f"riesgo.factores[{i}].valor")
        if not 0 <= f["valor"] <= 1:
            raise EsquemaInvalido(f"riesgo.factores[{i}].valor fuera de 0-1")

    rio = d["rio"]
    _campos(rio, ["umbrales", "serie"], "rio")
    if rio["umbrales"] is not None:
        _campos(rio["umbrales"], ["rp2", "rp5", "rp20"], "rio.umbrales")
        u = rio["umbrales"]
        for k in ("rp2", "rp5", "rp20"):
            _tipo(u[k], NUM, f"rio.umbrales.{k}")
        if not 0 < u["rp2"] <= u["rp5"] <= u["rp20"]:
            raise EsquemaInvalido("rio.umbrales deben ir de menor a mayor")
    _tipo(rio["serie"], list, "rio.serie")
    for i, s in enumerate(rio["serie"]):
        ruta = f"rio.serie[{i}]"
        _campos(s, ["fecha", "caudal", "min", "max", "pron"], ruta)
        _fecha(s["fecha"], ruta + ".fecha")
        _tipo(s["caudal"], NUM, ruta + ".caudal")
        _tipo(s["min"], NUM, ruta + ".min", nulo=True)
        _tipo(s["max"], NUM, ruta + ".max", nulo=True)
        _tipo(s["pron"], bool, ruta + ".pron")

    _tipo(d["lluvia"], list, "lluvia")
    for i, l in enumerate(d["lluvia"]):
        ruta = f"lluvia[{i}]"
        _campos(l, ["fecha", "mm", "cuenca_mm", "prob"], ruta)
        _fecha(l["fecha"], ruta + ".fecha")
        _tipo(l["mm"], NUM, ruta + ".mm")
        _tipo(l["cuenca_mm"], NUM, ruta + ".cuenca_mm")
        _tipo(l["prob"], NUM, ruta + ".prob", nulo=True)
        for k in ("tmax", "tmin"):  # opcionales: los data.json de antes no los traen
            _tipo(l.get(k), NUM, f"{ruta}.{k}", nulo=True)

    _tipo(d["avisos"], list, "avisos")
    for i, a in enumerate(d["avisos"]):
        ruta = f"avisos[{i}]"
        _campos(a, ["fuente", "titulo", "nivel", "fecha", "url"], ruta)
        _tipo(a["nivel"], int, ruta + ".nivel")
        if not 0 <= a["nivel"] <= 3:
            raise EsquemaInvalido(ruta + ".nivel fuera de 0-3")
        _tipo(a["titulo"], str, ruta + ".titulo")
        _fecha(a["fecha"], ruta + ".fecha")

    _tipo(d["fuentes"], list, "fuentes")
    for i, f in enumerate(d["fuentes"]):
        ruta = f"fuentes[{i}]"
        _campos(f, ["nombre", "aporta", "url", "ok", "fecha"], ruta)
        _tipo(f["ok"], bool, ruta + ".ok")
        _fecha(f["fecha"], ruta + ".fecha", nulo=True)
    return True


if __name__ == "__main__":
    ruta = sys.argv[1] if len(sys.argv) > 1 else "public/data.json"
    try:
        with open(ruta, encoding="utf-8") as f:
            validar(json.load(f))
    except (OSError, json.JSONDecodeError, EsquemaInvalido) as e:
        sys.exit(f"{ruta} no es válido: {e}")
    print(f"{ruta} es válido")
