"""Arma public/geo.json: comunidades del INEGI, río Pantepec, río Cazones, costa y pueblos vecinos.

Se corre una sola vez (o cuando cambie alguna fuente):

    python scripts/generar_geo.py

Las descargas se guardan en cache/ para no repetirlas.
"""

import csv
import html
import io
import json
import re
import sys
import unicodedata
import urllib.request
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
CACHE = RAIZ / "cache"
SALIDA = RAIZ / "public" / "geo.json"

URL_INEGI = ("https://raw.githubusercontent.com/eduardoarandah/"
             "coordenadas-estados-municipios-localidades-de-mexico-json/master/data.csv")
URL_POBLACION = "https://mexico.pueblosamerica.com/veracruz-de-ignacio-de-la-llave/temapache/"
URL_NE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/"
URL_RIOS = URL_NE + "ne_10m_rivers_north_america.geojson"
URL_COSTA = URL_NE + "ne_10m_coastline.geojson"

# Área del mapa (lon0, lat0, lon1, lat1), un poco más grande que lo que se ve.
CAJA = (-98.5, 20.3, -96.8, 21.45)

# Cabeceras vecinas: (CVE_ENT, NOM_MUN en el INEGI, etiqueta). Se toma la localidad 0001.
PUEBLOS = [
    ("13", "Huehuetla", "Huehuetla, Hgo."),
    ("21", "Francisco Z. Mena", "Metlaltoyuca (Fco. Z. Mena)"),
    ("21", "Pantepec", "Pantepec, Pue."),
    ("21", "Venustiano Carranza", "Venustiano Carranza"),
    ("30", "Benito Juárez", "Benito Juárez"),
    ("30", "Cazones de Herrera", "Cazones"),
    ("30", "Coatzintla", "Coatzintla"),
    ("30", "Chicontepec", "Chicontepec"),
    ("30", "Ixhuatlán de Madero", "Ixhuatlán de Madero"),
    ("30", "Poza Rica de Hidalgo", "Poza Rica"),
    ("30", "Castillo de Teayo", "Castillo de Teayo"),
    ("30", "Tihuatlán", "Tihuatlán"),
    ("30", "Tlachichilco", "Tlachichilco"),
    ("30", "Tuxpan", "Tuxpan"),
]

CUANTAS_PRI = 40   # comunidades con prioridad para etiquetas (por población)


def descargar(url, nombre):
    CACHE.mkdir(exist_ok=True)
    f = CACHE / nombre
    if not f.exists():
        print("Descargando", url)
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (AlertaPantepec)"})
        with urllib.request.urlopen(req, timeout=180) as r:
            f.write_bytes(r.read())
    return f.read_bytes()


def norm(s):
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", s.lower()).strip()


def leer_inegi():
    texto = descargar(URL_INEGI, "inegi.csv").decode("utf-8")
    filas = list(csv.DictReader(io.StringIO(texto)))
    return filas


def localidades(filas):
    locs = []
    for f in filas:
        if f["CVE_ENT"] == "30" and f["CVE_MUN"] == "160":
            locs.append({
                "cve": f["CVE_LOC"],
                "n": f["NOM_LOC"],
                "lat": round(float(f["LAT_DEC"]), 4),
                "lon": round(float(f["LON_DEC"]), 4),
                "alt": int(f["ALTITUD"]),
            })
    return locs


def pueblos_vecinos(filas):
    idx = {(f["CVE_ENT"], f["NOM_MUN"]): f for f in filas if f["CVE_LOC"] == "0001"}
    out = []
    for ent, mun, etiqueta in PUEBLOS:
        f = idx.get((ent, mun))
        if not f:
            sys.exit(f"No encontré la cabecera de {mun} (estado {ent}) en el INEGI")
        out.append([etiqueta, round(float(f["LAT_DEC"]), 4), round(float(f["LON_DEC"]), 4)])
        print(f"  pueblo {etiqueta:30s} = {f['NOM_LOC']} ({f['NOM_MUN']})")
    return out


def poblacion():
    """Lista (nombre, habitantes) del Censo 2020, de mayor a menor, según PueblosAmerica."""
    s = descargar(URL_POBLACION, "poblacion.html").decode("utf-8", errors="replace")
    pares = re.findall(r'<a href=[^>]*>([^<]+)</a>\s*<span class="numpub">\(([\d,]+) habitantes\)', s)
    return [(html.unescape(n).strip(), int(p.replace(",", ""))) for n, p in pares]


# Nombres que PueblosAmerica escribe distinto al INEGI
ALIAS = {
    "heroes del 47 (otatal)": "heroes del cuarenta y siete (otatal)",
}


def asignar_prioridad(locs, pob):
    """Pone pri=1..N a las comunidades más pobladas. Si un nombre se repite, gana la de clave menor
    (en el INEGI las claves bajas son las localidades más antiguas y grandes)."""
    por_nombre = {}
    for l in locs:
        por_nombre.setdefault(norm(l["n"]), []).append(l)
    pri, usados, sin = 0, set(), []
    for nombre, hab in pob:
        if pri >= CUANTAS_PRI:
            break
        k = ALIAS.get(norm(nombre), norm(nombre))
        cands = [l for l in por_nombre.get(k, []) if l["cve"] not in usados]
        if not cands:
            sin.append(nombre)
            continue
        l = min(cands, key=lambda c: c["cve"])
        usados.add(l["cve"])
        pri += 1
        l["pri"] = pri
        l["hab"] = hab
    return sin


def en_caja(lon, lat, m=0.0):
    return CAJA[0] - m <= lon <= CAJA[2] + m and CAJA[1] - m <= lat <= CAJA[3] + m


def lineas(geom):
    if geom["type"] == "LineString":
        return [geom["coordinates"]]
    if geom["type"] == "MultiLineString":
        return geom["coordinates"]
    return []


def rios():
    gj = json.loads(descargar(URL_RIOS, "rios.geojson"))
    feats = {}
    for f in gj["features"]:
        nombre = f["properties"].get("name") or ""
        if nombre in ("Chiflón", "Pantepec", "Cazones"):
            for ln in lineas(f["geometry"]):
                if any(en_caja(x, y) for x, y in ln):
                    feats.setdefault(nombre, []).append(ln)
    for k in ("Chiflón", "Pantepec", "Cazones"):
        if k not in feats:
            sys.exit(f"No encontré el río {k} en Natural Earth")
        print(f"  río {k}: {len(feats[k])} tramo(s), {sum(map(len, feats[k]))} puntos")

    # Pantepec = Chiflón + Pantepec, cada tramo orientado de oeste a este y ordenados por longitud.
    tramos = []
    for ln in feats["Chiflón"] + feats["Pantepec"]:
        if ln[0][0] > ln[-1][0]:
            ln = ln[::-1]
        tramos.append(ln)
    tramos.sort(key=lambda ln: ln[0][0])
    pantepec = []
    for ln in tramos:
        for p in ln:
            if not pantepec or pantepec[-1] != p:
                pantepec.append(p)
    cazones = max(feats["Cazones"], key=len)
    return redondear(pantepec), redondear(cazones)


def costa():
    gj = json.loads(descargar(URL_COSTA, "costa.geojson"))
    mejor = []
    for f in gj["features"]:
        for ln in lineas(f["geometry"]):
            dentro = [p for p in ln if en_caja(p[0], p[1])]
            if len(dentro) > len(mejor):
                # conservar el tramo contiguo dentro de la caja
                tramo, act = [], []
                for p in ln:
                    if en_caja(p[0], p[1]):
                        act.append(p)
                    else:
                        if len(act) > len(tramo):
                            tramo = act
                        act = []
                if len(act) > len(tramo):
                    tramo = act
                if len(tramo) > len(mejor):
                    mejor = tramo
    # de sur a norte
    if mejor and mejor[0][1] > mejor[-1][1]:
        mejor = mejor[::-1]
    print(f"  costa: {len(mejor)} puntos")
    return redondear(mejor)


def redondear(ln):
    return [[round(x, 4), round(y, 4)] for x, y in ln]


def main():
    filas = leer_inegi()
    locs = localidades(filas)
    print(f"Localidades de Álamo Temapache: {len(locs)}")
    alamo = next(l for l in locs if l["cve"] == "0001")
    print(f"  cabecera: {alamo['n']} {alamo['lat']}, {alamo['lon']}, {alamo['alt']} m")

    try:
        pob = poblacion()
        sin = asignar_prioridad(locs, pob)
        print(f"Población: {len(pob)} localidades leídas; prioridad asignada a "
              f"{sum(1 for l in locs if 'pri' in l)}")
        if sin:
            print("  sin pareja en el INEGI:", ", ".join(sin))
    except Exception as e:  # la página puede cambiar; seguimos sin prioridades
        print("No se pudo leer la población:", e)

    print("Pueblos vecinos:")
    towns = pueblos_vecinos(filas)
    print("Ríos y costa (Natural Earth):")
    river, cazones = rios()
    coast = costa()

    geo = {
        "fuente": {
            "locs": "INEGI, catálogo de localidades (extracción de eduardoarandah). [nombre, lat, lon, altitud m, prioridad]",
            "pri": "Orden por población, Censo 2020 según PueblosAmerica.com; 0 = sin prioridad",
            "river": "Natural Earth 10m: Chiflón + Pantepec, de oeste a este. [lon, lat]",
            "cazones": "Natural Earth 10m: Cazones. [lon, lat]",
            "coast": "Natural Earth 10m, costa recortada. [lon, lat]",
            "towns": "Cabeceras vecinas, INEGI. [nombre, lat, lon]",
        },
        "locs": [[l["n"], l["lat"], l["lon"], l["alt"], l.get("pri", 0)] for l in locs],
        "river": river,
        "cazones": cazones,
        "coast": coast,
        "towns": towns,
    }
    SALIDA.write_text(json.dumps(geo, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Escrito {SALIDA.relative_to(RAIZ)} ({SALIDA.stat().st_size / 1024:.1f} KB)")


if __name__ == "__main__":
    main()
