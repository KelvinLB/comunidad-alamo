"""Ajustes del bot: puntos de consulta, umbrales de lluvia y pesos del índice.

Todo lo que se pueda querer calibrar vive aquí; riesgo.py solo hace cuentas.
"""

LUGAR = "Álamo Temapache, Veracruz"
ZONA_HORARIA = "America/Mexico_City"

# Centro de Álamo (cabecera, catálogo INEGI)
ALAMO = (20.9171, -97.6755)

# Punto de GloFAS sobre el río Pantepec en Álamo (ver PENDIENTES.md).
PUNTO_RIO = (20.92, -97.68)

# Lluvia: el pueblo y la cuenca alta (Sierra Norte de Puebla e Hidalgo).
PUNTO_LOCAL = ("Álamo", 20.917, -97.675)
HORAS_CLIMA = 36  # horas de temperatura hacia adelante: alcanza aunque el bot se atrase muchas horas
PUNTOS_CUENCA = [
    ("Sierra Norte de Puebla (Pantepec)", 20.51, -97.89),
    ("Francisco Z. Mena", 20.73, -97.83),
    ("Vinazco (Ixhuatlán de Madero)", 20.69, -98.01),
    ("Huehuetla, Hidalgo", 20.47, -98.08),
]

# --- Índice de riesgo ---------------------------------------------------

# Caudal efectivo = 0.7 × pico de la mediana + 0.3 × pico del máximo del ensamble
PESO_MEDIANA = 0.7
PESO_MAXIMO = 0.3
DIAS_PRONOSTICO = 7


def puntos_caudal(u):
    """Tramos de interp para el caudal, en función de los umbrales {rp2, rp5, rp20}."""
    return [(0, 0), (0.5 * u["rp2"], 0.1), (u["rp2"], 0.35), (u["rp5"], 0.75), (u["rp20"], 1)]


PUNTOS_SIERRA = [(0, 0), (40, 0.1), (80, 0.35), (150, 0.7), (250, 1)]   # mm en 72 h
PUNTOS_LOCAL = [(0, 0), (50, 0.1), (100, 0.4), (200, 0.8), (300, 1)]     # mm en 72 h

# score = 1 − Π (1 − peso·factor)
PESOS = {"caudal": 0.85, "sierra": 0.45, "local": 0.25, "avisos": 0.5}

# Probabilidad mínima (0-100) para cada nivel 1, 2 y 3
CORTES_NIVEL = [25, 50, 75]

# Frases del resumen
LLUVIA_SIERRA_MUCHISIMA = 150   # mm en 72 h
LLUVIA_SIERRA_FUERTE = 80
LLUVIA_LOCAL_FUERTE = 50

# --- Avisos -------------------------------------------------------------

SMN_MM_AVISO = 50          # pronóstico oficial del día que genera aviso de nivel 1
NHC_RADIO_ATLANTICO = 900  # km
NHC_RADIO_PACIFICO = 450   # km
NHC_RADIO_CERCA = 500      # km: huracán → nivel 3; otro sistema → nivel 2
AVISOS_HORAS_VIGENCIA = 48

# --- Red ----------------------------------------------------------------

TIEMPO_ESPERA = 30   # segundos por petición
REINTENTOS = 2
USER_AGENT = "AlertaPantepec/1.0 (proyecto comunitario; Alamo Temapache)"
