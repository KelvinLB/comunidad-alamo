"""Una función por fuente de datos.

Cada fuente tiene dos partes:
  - descargar_*(): pide los datos a internet (falla con excepción si no responde).
  - leer_*(crudo, ...): convierte la respuesta al formato de data.json. Es pura y se prueba con
    las respuestas guardadas en tests/fixtures/.
"""

import gzip
import json
import math
import time
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

import config as C


class FuenteCaida(Exception):
    pass


def pedir(url, intentos=None):
    """GET con reintentos. Devuelve bytes (descomprimidos si venían en gzip)."""
    intentos = C.REINTENTOS if intentos is None else intentos
    ultimo = None
    for i in range(intentos + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": C.USER_AGENT, "Accept-Encoding": "gzip"})
            with urllib.request.urlopen(req, timeout=C.TIEMPO_ESPERA) as r:
                datos = r.read()
            if datos[:2] == b"\x1f\x8b":
                datos = gzip.decompress(datos)
            return datos
        except Exception as e:  # red, HTTP, gzip roto…
            ultimo = e
            if i < intentos:
                time.sleep(2 * (i + 1))
    raise FuenteCaida(f"{url}: {ultimo}")


def pedir_json(url):
    try:
        return json.loads(pedir(url))
    except json.JSONDecodeError as e:
        raise FuenteCaida(f"{url}: respuesta no es JSON ({e})")


def distancia_km(lat1, lon1, lat2, lon2):
    """Distancia sobre la Tierra (haversine)."""
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def _num(v):
    return None if v is None else round(float(v), 1)


# --- Caudal: GloFAS v4 vía Open-Meteo Flood API -------------------------

GLOFAS = {
    "nombre": "GloFAS v4 (Copernicus) vía Open-Meteo",
    "aporta": "Caudal simulado del río y pronóstico a 10 días",
    "url": "https://www.globalfloods.eu/",
}


def url_glofas(lat=C.PUNTO_RIO[0], lon=C.PUNTO_RIO[1]):
    q = {
        "latitude": lat, "longitude": lon,
        "daily": "river_discharge,river_discharge_median,river_discharge_max,river_discharge_min",
        "past_days": 14, "forecast_days": 10,
    }
    return "https://flood-api.open-meteo.com/v1/flood?" + urllib.parse.urlencode(q, safe=",")


def descargar_glofas():
    return pedir_json(url_glofas())


def leer_glofas(crudo, hoy):
    """Serie diaria. Días pasados: caudal simulado. Hoy y después: mediana del ensamble con su
    rango mínimo-máximo. `pron` es verdadero desde mañana."""
    d = crudo["daily"]
    serie = []
    for i, fecha in enumerate(d["time"]):
        futuro = fecha >= hoy
        if futuro:
            q = d["river_discharge_median"][i]
            if q is None:
                q = d["river_discharge"][i]
            mn, mx = d["river_discharge_min"][i], d["river_discharge_max"][i]
        else:
            q, mn, mx = d["river_discharge"][i], None, None
        if q is None:
            continue
        serie.append({"fecha": fecha, "caudal": _num(q), "min": _num(mn), "max": _num(mx), "pron": fecha > hoy})
    if not any(s["fecha"] >= hoy for s in serie):
        raise FuenteCaida("GloFAS no trae pronóstico")
    return serie


# --- Lluvia: Open-Meteo Forecast API ------------------------------------

LLUVIA = {
    "nombre": "Open-Meteo (modelos ECMWF, GFS, ICON y otros)",
    "aporta": "Lluvia pronosticada en Álamo y en la sierra, y temperatura en Álamo hora por hora",
    "url": "https://open-meteo.com/",
}


def url_lluvia():
    pts = [C.PUNTO_LOCAL] + C.PUNTOS_CUENCA
    q = {
        "latitude": ",".join(str(p[1]) for p in pts),
        "longitude": ",".join(str(p[2]) for p in pts),
        "daily": "precipitation_sum,precipitation_probability_max,temperature_2m_max,temperature_2m_min",
        # hora por hora: la página toma la de la hora actual, así cambia aunque el bot se atrase
        "hourly": "temperature_2m,weather_code,is_day",
        "forecast_days": 7, "past_hours": 1, "forecast_hours": C.HORAS_CLIMA, "timezone": C.ZONA_HORARIA,
    }
    return "https://api.open-meteo.com/v1/forecast?" + urllib.parse.urlencode(q, safe=",/")


def descargar_lluvia():
    return pedir_json(url_lluvia())


def _grados(diario, clave, i):
    """Temperatura redondeada a grados enteros; None si no vino o es imposible para Álamo."""
    t = (diario.get(clave) or [])[i:i + 1]
    return round(t[0]) if t and isinstance(t[0], (int, float)) and -5 <= t[0] <= 50 else None


def leer_lluvia(crudo):
    """7 días: mm en Álamo, mm en la sierra (el máximo de los puntos de la cuenca alta ese día)
    probabilidad de lluvia y temperatura máxima y mínima en Álamo (en °C, None si no vino)."""
    if not isinstance(crudo, list) or len(crudo) != 1 + len(C.PUNTOS_CUENCA):
        raise FuenteCaida("Open-Meteo no devolvió todos los puntos")
    local, cuenca = crudo[0]["daily"], [c["daily"] for c in crudo[1:]]
    dias = []
    for i, fecha in enumerate(local["time"]):
        mm = local["precipitation_sum"][i]
        sierra = [c["precipitation_sum"][i] for c in cuenca if c["precipitation_sum"][i] is not None]
        prob = local["precipitation_probability_max"][i]
        dias.append({
            "fecha": fecha,
            "mm": _num(mm or 0),
            "cuenca_mm": _num(max(sierra) if sierra else 0),
            "prob": None if prob is None else int(prob),
            "tmax": _grados(local, "temperature_2m_max", i),
            "tmin": _grados(local, "temperature_2m_min", i),
        })
    return dias


def leer_horas(crudo):
    """Temperatura, cielo (código WMO) y si es de día en Álamo, hora por hora (hora local de Álamo).
    Las horas sin temperatura válida se saltan; si Open-Meteo no mandó nada, la lista queda vacía."""
    h = (crudo[0].get("hourly") or {}) if isinstance(crudo, list) and crudo else {}
    horas = []
    for i, hora in enumerate(h.get("time") or []):
        t = _grados(h, "temperature_2m", i)
        if t is None:
            continue
        cod, dia = (h.get("weather_code") or [])[i:i + 1], (h.get("is_day") or [])[i:i + 1]
        horas.append({
            "hora": hora,
            "t": t,
            "cod": int(cod[0]) if cod and isinstance(cod[0], (int, float)) else None,
            "dia": bool(dia[0]) if dia else 6 <= int(hora[11:13]) < 19,
        })
    return horas


# --- Pronóstico oficial: SMN, Conagua -----------------------------------

SMN = {
    "nombre": "SMN · Conagua",
    "aporta": "Pronóstico oficial para Álamo Temapache",
    "url": "https://smn.conagua.gob.mx/es/pronostico-del-tiempo-por-municipios",
}
URL_SMN = "https://smn.conagua.gob.mx/tools/GUI/webservices/?method=1"


def descargar_smn():
    return pedir_json(URL_SMN)


def leer_smn(crudo, ahora):
    """Avisos a partir del pronóstico oficial por municipio. Aviso de nivel 1 si para hoy se
    pronostican SMN_MM_AVISO mm o más."""
    filas = [x for x in crudo
             if "temapache" in x.get("nmun", "").lower() and "veracruz" in x.get("nes", "").lower()]
    if not filas:
        raise FuenteCaida("SMN no trae a Álamo Temapache")
    avisos = []
    hoy = next((x for x in filas if str(x.get("ndia")) == "0"), None)
    if hoy is not None:
        mm = float(hoy.get("prec") or 0)
        if mm >= C.SMN_MM_AVISO:
            avisos.append({
                "fuente": SMN["nombre"],
                "titulo": f"El pronóstico oficial para hoy en Álamo Temapache es de lluvia fuerte ({round(mm)} mm).",
                "nivel": 1,
                "fecha": ahora.isoformat(timespec="seconds"),
                "url": SMN["url"],
            })
    return avisos


# --- Huracanes: National Hurricane Center (NOAA) ------------------------

NHC = {
    "nombre": "Centro Nacional de Huracanes (NHC · NOAA)",
    "aporta": "Huracanes y tormentas cerca de Veracruz",
    "url": "https://www.nhc.noaa.gov/",
}
URL_NHC = "https://www.nhc.noaa.gov/CurrentStorms.json"

TIPOS_NHC = {
    "HU": "Huracán", "TS": "Tormenta tropical", "TD": "Depresión tropical",
    "STS": "Tormenta subtropical", "SD": "Depresión subtropical", "STD": "Depresión subtropical",
    "PTC": "Ciclón postropical", "PC": "Posible ciclón tropical",
}


def descargar_nhc():
    return pedir_json(URL_NHC)


def leer_nhc(crudo, ahora):
    avisos = []
    for s in crudo.get("activeStorms") or []:
        cuenca = (s.get("id") or s.get("binNumber") or "")[:2].lower()
        radio = {"al": C.NHC_RADIO_ATLANTICO, "ep": C.NHC_RADIO_PACIFICO}.get(cuenca)
        lat, lon = s.get("latitudeNumeric"), s.get("longitudeNumeric")
        if radio is None or lat is None or lon is None:
            continue
        d = distancia_km(C.ALAMO[0], C.ALAMO[1], float(lat), float(lon))
        if d > radio:
            continue
        clase = (s.get("classification") or "").upper()
        if d <= C.NHC_RADIO_CERCA:
            nivel = 3 if clase == "HU" else 2
        else:
            nivel = 1
        tipo = TIPOS_NHC.get(clase, "Sistema tropical")
        mar = "en el Golfo de México o el Atlántico" if cuenca == "al" else "en el Pacífico"
        avisos.append({
            "fuente": NHC["nombre"],
            "titulo": f"{tipo} {s.get('name', '')} {mar}, a unos {round(d, -1):.0f} km de Álamo.".replace("  ", " "),
            "nivel": nivel,
            "fecha": (parse_fecha(s["lastUpdate"]) if s.get("lastUpdate") else ahora).isoformat(timespec="seconds"),
            "url": (s.get("publicAdvisory") or {}).get("url") or NHC["url"],
        })
    return avisos


# --- Avisos de Protección Civil capturados a mano -----------------------

MANUAL = {
    "nombre": "Protección Civil Veracruz",
    "aporta": "Alertas y refugios (captura manual)",
    "url": "https://www.veracruz.gob.mx/proteccioncivil/",
}


def parse_fecha(s):
    f = datetime.fromisoformat(str(s).replace("Z", "+00:00"))
    if f.tzinfo is None:  # sin zona: se toma como hora de México (UTC−6)
        f = f.replace(tzinfo=timezone(timedelta(hours=-6)))
    return f


def leer_avisos_manuales(crudo, ahora):
    """Solo avisos válidos de menos de 48 horas. Los mal escritos se ignoran sin tumbar el bot."""
    avisos, malos = [], 0
    for a in crudo if isinstance(crudo, list) else []:
        try:
            nivel = int(a["nivel"])
            fecha = parse_fecha(a["fecha"])
            titulo = str(a["titulo"]).strip()
            if not (0 <= nivel <= 3) or not titulo:
                raise ValueError
        except (KeyError, TypeError, ValueError):
            malos += 1
            continue
        if ahora - fecha > timedelta(hours=C.AVISOS_HORAS_VIGENCIA) or fecha - ahora > timedelta(hours=1):
            continue
        avisos.append({
            "fuente": str(a.get("fuente") or MANUAL["nombre"]),
            "titulo": titulo,
            "nivel": nivel,
            "fecha": fecha.isoformat(timespec="seconds"),
            "url": a.get("url") or "",
        })
    return avisos, malos
