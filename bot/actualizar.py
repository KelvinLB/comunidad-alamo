"""Programa principal del bot: consulta las fuentes, calcula el riesgo y escribe public/data.json.

    python bot/actualizar.py

Reglas:
  - Si una fuente falla, se conserva su parte de la lectura anterior y se marca con ok: false.
  - Si fallan todas las fuentes de internet, no se toca data.json y se sale con código 1
    (así GitHub manda el correo de falla).
  - El archivo nuevo se valida y se escribe de forma atómica (data.json.tmp → data.json).
"""

import json
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import config as C
import esquema
import fuentes as F
import riesgo

RAIZ = Path(__file__).resolve().parent.parent
RUTA_DATOS = RAIZ / "public" / "data.json"
RUTA_UMBRALES = RAIZ / "public" / "umbrales.json"
RUTA_AVISOS = RAIZ / "avisos_manuales.json"

MX = timezone(timedelta(hours=-6))  # México centro no usa horario de verano desde 2022

# Fuentes de internet: clave → (metadatos, descarga)
DESCARGAS = {
    "glofas": F.descargar_glofas,
    "lluvia": F.descargar_lluvia,
    "smn": F.descargar_smn,
    "nhc": F.descargar_nhc,
}
META = {"glofas": F.GLOFAS, "lluvia": F.LLUVIA, "smn": F.SMN, "nhc": F.NHC, "manual": F.MANUAL}


def log(*a):
    print(*a, file=sys.stderr)


def leer_json(ruta, defecto=None):
    """Lee un JSON. Si el archivo no existe o está en blanco, devuelve `defecto`."""
    try:
        texto = Path(ruta).read_text(encoding="utf-8")
    except FileNotFoundError:
        return defecto
    return json.loads(texto) if texto.strip() else defecto


def anterior(ruta):
    """La lectura anterior, solo si es válida."""
    try:
        d = leer_json(ruta)
        if d is not None:
            esquema.validar(d)
        return d
    except (json.JSONDecodeError, esquema.EsquemaInvalido) as e:
        log("Aviso: el data.json anterior no es válido y no se usará:", e)
        return None


def cargar_umbrales(ruta, previo):
    u = leer_json(ruta)
    if u and all(k in u for k in ("rp2", "rp5", "rp20")):
        return {k: u[k] for k in ("rp2", "rp5", "rp20")}
    if previo and previo["rio"].get("umbrales"):
        log("Aviso: no hay umbrales.json; se usan los de la lectura anterior")
        return previo["rio"]["umbrales"]
    log("Aviso: no hay umbrales; el caudal no entra al índice")
    return None


def vigente(aviso, ahora):
    try:
        return ahora - F.parse_fecha(aviso["fecha"]) <= timedelta(hours=C.AVISOS_HORAS_VIGENCIA)
    except (KeyError, ValueError):
        return False


def ejecutar(ruta_datos=RUTA_DATOS, ruta_umbrales=RUTA_UMBRALES, ruta_avisos=RUTA_AVISOS,
             descargas=None, ahora=None):
    descargas = DESCARGAS if descargas is None else descargas
    ahora = ahora or datetime.now(timezone.utc).replace(microsecond=0)
    hoy = ahora.astimezone(MX).date().isoformat()
    previo = anterior(ruta_datos)

    # 1. Consultar cada fuente
    leido, ok = {}, {}
    lectores = {
        "glofas": lambda crudo: F.leer_glofas(crudo, hoy),
        "lluvia": F.leer_lluvia,
        "smn": lambda crudo: F.leer_smn(crudo, ahora),
        "nhc": lambda crudo: F.leer_nhc(crudo, ahora),
    }
    for clave, descargar in descargas.items():
        try:
            leido[clave] = lectores[clave](descargar())
            ok[clave] = True
            log(f"✓ {META[clave]['nombre']}")
        except Exception as e:
            ok[clave] = False
            log(f"✗ {META[clave]['nombre']}: {type(e).__name__}: {e}")

    if not any(ok.values()):
        log("Fallaron todas las fuentes: no se modifica data.json.")
        return 1

    try:
        manuales, malos = F.leer_avisos_manuales(leer_json(ruta_avisos, []), ahora)
        ok["manual"] = True
        if malos:
            log(f"Aviso: {malos} aviso(s) manual(es) mal escritos se ignoraron")
    except (json.JSONDecodeError, OSError) as e:
        log("✗ avisos_manuales.json no se pudo leer:", e)
        manuales, ok["manual"] = [], False

    # 2. Armar cada sección: lo nuevo, o lo anterior si la fuente falló
    def previa(seccion, defecto):
        return previo[seccion] if previo else defecto

    serie = leido["glofas"] if ok.get("glofas") else previa("rio", {}).get("serie", [])
    lluvia = leido["lluvia"] if ok.get("lluvia") else previa("lluvia", [])

    avisos_previos = previa("avisos", [])
    avisos = []
    for clave in ("smn", "nhc"):
        if ok.get(clave):
            avisos += leido[clave]
        else:
            avisos += [a for a in avisos_previos if a["fuente"] == META[clave]["nombre"] and vigente(a, ahora)]
    avisos += manuales
    avisos.sort(key=lambda a: (-a["nivel"], a["fecha"]))

    fechas_previas = {f["nombre"]: f["fecha"] for f in previa("fuentes", [])}
    lista_fuentes = []
    for clave in ("glofas", "lluvia", "smn", "nhc", "manual"):
        m = META[clave]
        bien = ok.get(clave, False)
        lista_fuentes.append({
            "nombre": m["nombre"], "aporta": m["aporta"], "url": m["url"], "ok": bien,
            "fecha": ahora.isoformat(timespec="seconds") if bien else fechas_previas.get(m["nombre"]),
        })

    umbrales = cargar_umbrales(ruta_umbrales, previo)

    # 3. Calcular y escribir
    datos = {
        "version": 1,
        "actualizado": ahora.isoformat(timespec="seconds"),
        "lugar": C.LUGAR,
        "riesgo": riesgo.calcular(serie, umbrales, lluvia, avisos, hoy),
        "rio": {"umbrales": umbrales, "serie": serie},
        "lluvia": lluvia,
        "avisos": avisos,
        "fuentes": lista_fuentes,
    }
    try:
        esquema.validar(datos)
    except esquema.EsquemaInvalido as e:
        log("El resultado no cumple el esquema; no se modifica data.json:", e)
        return 2

    ruta_datos = Path(ruta_datos)
    tmp = ruta_datos.with_name(ruta_datos.name + ".tmp")
    tmp.write_text(json.dumps(datos, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    os.replace(tmp, ruta_datos)

    r = datos["riesgo"]
    caidas = [META[k]["nombre"] for k, v in ok.items() if not v]
    log(f"Nivel {r['nivel']} ({riesgo.NOMBRES_NIVEL[r['nivel']]}), probabilidad {r['probabilidad']}.")
    log("Resumen:", r["resumen"])
    if caidas:
        log("Fuentes caídas (se usó la lectura anterior):", ", ".join(caidas))
    return 0


if __name__ == "__main__":
    sys.exit(ejecutar())
