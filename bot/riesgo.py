"""Cálculo del índice de riesgo de inundación. Solo funciones puras: sin red ni archivos."""

import math

import config as C

NOMBRES_NIVEL = ["Sin peligro", "Esté atento", "Peligro", "Peligro muy alto"]


def interp(x, puntos):
    """Interpolación lineal por tramos. Fuera de rango devuelve el valor del extremo."""
    if x <= puntos[0][0]:
        return puntos[0][1]
    for (x0, y0), (x1, y1) in zip(puntos, puntos[1:]):
        if x <= x1:
            return y1 if x1 == x0 else y0 + (y1 - y0) * (x - x0) / (x1 - x0)
    return puntos[-1][1]


def max_acumulado(valores, ventana=3):
    """Máximo de la suma en cualquier ventana de `ventana` días seguidos (72 h = 3 días)."""
    v = [x or 0 for x in valores]
    if not v:
        return 0.0
    if len(v) <= ventana:
        return float(sum(v))
    return float(max(sum(v[i:i + ventana]) for i in range(len(v) - ventana + 1)))


def pronostico(serie, hoy, dias=C.DIAS_PRONOSTICO):
    """Los `dias` valores de la serie desde hoy (incluido)."""
    return [s for s in serie if s["fecha"] >= hoy][:dias]


def caudal_efectivo(serie, hoy):
    """0.7 × pico de la mediana + 0.3 × pico del máximo del ensamble, en los próximos 7 días."""
    fut = pronostico(serie, hoy)
    if not fut:
        return None, None, None
    pico_med = max(s["caudal"] for s in fut)
    pico_max = max((s["max"] if s.get("max") is not None else s["caudal"]) for s in fut)
    return C.PESO_MEDIANA * pico_med + C.PESO_MAXIMO * pico_max, pico_med, pico_max


def nivel_de(probabilidad):
    return sum(1 for corte in C.CORTES_NIVEL if probabilidad >= corte)


def calcular(serie, umbrales, lluvia, avisos, hoy):
    """Devuelve la sección `riesgo` de data.json.

    serie: [{fecha, caudal, min, max, pron}]; umbrales: {rp2, rp5, rp20};
    lluvia: [{fecha, mm, cuenca_mm, prob}]; avisos: [{nivel, …}]; hoy: 'AAAA-MM-DD'.
    """
    q_ef, pico_med, pico_max = caudal_efectivo(serie or [], hoy) if umbrales else (None, None, None)
    r_q = interp(q_ef, C.puntos_caudal(umbrales)) if q_ef is not None else 0.0

    dias = [d for d in (lluvia or []) if d["fecha"] >= hoy][:7]
    mm_sierra = max_acumulado([d.get("cuenca_mm") for d in dias])
    mm_local = max_acumulado([d.get("mm") for d in dias])
    r_s = interp(mm_sierra, C.PUNTOS_SIERRA)
    r_l = interp(mm_local, C.PUNTOS_LOCAL)

    nivel_avisos = max((int(a["nivel"]) for a in avisos or []), default=0)
    r_a = nivel_avisos / 3

    P = C.PESOS
    score = 1 - ((1 - P["caudal"] * r_q) * (1 - P["sierra"] * r_s)
                 * (1 - P["local"] * r_l) * (1 - P["avisos"] * r_a))
    probabilidad = int(math.floor(100 * score + 0.5))
    nivel = max(nivel_de(probabilidad), nivel_avisos)  # un aviso oficial nunca se rebaja

    if q_ef is None:
        det_q = "Sin pronóstico de caudal disponible"
    else:
        det_q = (f"Pico de {fmt(pico_med)} m³/s (máximo del ensamble {fmt(pico_max)}); "
                 f"crecida de 2 años: {fmt(umbrales['rp2'])} m³/s")
    factores = [
        {"nombre": "Caudal pronosticado", "detalle": det_q, "valor": round(r_q, 3)},
        {"nombre": "Lluvia en la sierra (72 h)", "detalle": f"Hasta {fmt(mm_sierra)} mm en 3 días seguidos",
         "valor": round(r_s, 3)},
        {"nombre": "Lluvia en Álamo (72 h)", "detalle": f"Hasta {fmt(mm_local)} mm en 3 días seguidos",
         "valor": round(r_l, 3)},
        {"nombre": "Avisos oficiales", "detalle": (f"{len(avisos)} aviso(s); el más alto es de nivel {nivel_avisos}"
                                                   if avisos else "Sin avisos vigentes"),
         "valor": round(r_a, 3)},
    ]
    return {
        "nivel": nivel,
        "probabilidad": probabilidad,
        "resumen": resumen(q_ef, umbrales, mm_sierra, mm_local, nivel_avisos >= 1, nivel),
        "factores": factores,
    }


def resumen(q_ef, umbrales, mm_sierra, mm_local, hay_avisos, nivel):
    """De 2 a 4 frases cortas, sin tecnicismos."""
    frases = []
    if q_ef is None or not umbrales:
        frases.append("No tenemos el pronóstico del río en este momento.")
    elif q_ef >= umbrales["rp5"]:
        frases.append("El río puede salirse de su cauce y meterse a las calles.")
    elif q_ef >= umbrales["rp2"]:
        frases.append("El río puede llegar a la orilla y salirse en las partes bajas.")
    elif q_ef >= 0.5 * umbrales["rp2"]:
        frases.append("El río va a subir, pero se espera que siga dentro de su cauce.")
    else:
        frases.append("El río está normal.")

    if mm_sierra >= C.LLUVIA_SIERRA_MUCHISIMA:
        frases.append("Va a llover muchísimo en la sierra, de donde baja el agua.")
    elif mm_sierra >= C.LLUVIA_SIERRA_FUERTE:
        frases.append("Va a llover fuerte en la sierra, de donde baja el agua.")
    elif mm_local >= C.LLUVIA_LOCAL_FUERTE:
        frases.append("Va a llover fuerte en Álamo.")
    else:
        frases.append("No se espera lluvia fuerte esta semana.")

    if hay_avisos:
        frases.append("Hay avisos de las autoridades; léalos más abajo.")

    if nivel == 3:
        frases.append("Si vive cerca del río, salga a un lugar alto.")
    elif nivel in (1, 2):
        frases.append("Esté pendiente.")
    return " ".join(frases)


def fmt(n):
    return f"{round(n):,}"


# --- Riesgo por comunidad (lo calcula la página; aquí se replica para las pruebas) ---

COS_LAT = math.cos(math.radians(20.95))
KM_GRADO = 111.2


def _dist_segmento(lat, lon, a, b):
    px, py = lon * COS_LAT, lat
    ax, ay, bx, by = a[0] * COS_LAT, a[1], b[0] * COS_LAT, b[1]
    dx, dy = bx - ax, by - ay
    t = ((px - ax) * dx + (py - ay) * dy) / ((dx * dx + dy * dy) or 1)
    t = max(0.0, min(1.0, t))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy)) * KM_GRADO


def distancia_rio(lat, lon, rio):
    """km al trazo del río (lista de [lon, lat]), con proyección equirectangular a 20.95°."""
    return min(_dist_segmento(lat, lon, rio[i - 1], rio[i]) for i in range(1, len(rio)))


def zona(dist_km, altitud):
    if dist_km <= 1.5 and altitud <= 45:
        return "junto"
    if dist_km <= 4 and altitud <= 80:
        return "cerca"
    return "lejos"


def nivel_comunidad(nivel_dia, z):
    return max(0, nivel_dia - {"junto": 0, "cerca": 1, "lejos": 2}[z])
