import json
import unittest
from datetime import date, timedelta
from pathlib import Path

import riesgo as R

RAIZ = Path(__file__).resolve().parent.parent
HOY = "2026-10-23"
UMBRALES = {"rp2": 900, "rp5": 1500, "rp20": 2600}


def escenario(base, pico, lluvia_local, lluvia_sierra, avisos=(), dispersion=0.25):
    """Serie de 14 días pasados + 9 de pronóstico (forma de los escenarios del prototipo)."""
    d0 = date.fromisoformat(HOY)
    serie = []
    for i in range(-14, 10):
        fecha = (d0 + timedelta(days=i)).isoformat()
        if i <= 0:
            q, mn, mx = base, None, None
        else:
            q = base + (pico - base) * 2.718281828 ** (-((i - 2.5) / 1.6) ** 2)
            mn, mx = q * (1 - dispersion), q * (1 + 1.6 * dispersion)
        serie.append({"fecha": fecha, "caudal": q, "min": mn, "max": mx, "pron": i > 0})
    lluvia = [{"fecha": (d0 + timedelta(days=i)).isoformat(), "mm": mm, "cuenca_mm": cu, "prob": 50}
              for i, (mm, cu) in enumerate(zip(lluvia_local, lluvia_sierra))]
    return R.calcular(serie, UMBRALES, lluvia, [{"nivel": n} for n in avisos], HOY)


NORMAL = dict(base=70, pico=95, lluvia_local=[2, 0, 4, 11, 6, 1, 0], lluvia_sierra=[3, 1, 6, 14, 9, 2, 1], avisos=[0])
FRENTE_FRIO = dict(base=240, pico=780, lluvia_local=[12, 30, 40, 18, 6, 2, 0],
                   lluvia_sierra=[20, 45, 60, 25, 8, 3, 1], avisos=[1, 1])
HURACAN = dict(base=600, pico=2350, lluvia_local=[95, 180, 140, 60, 20, 5, 2],
               lluvia_sierra=[140, 260, 210, 90, 30, 8, 3], avisos=[3, 3, 2])


class TestInterp(unittest.TestCase):
    P = [(0, 0), (40, 0.1), (80, 0.35), (150, 0.7), (250, 1)]

    def test_extremos(self):
        self.assertEqual(R.interp(0, self.P), 0)
        self.assertEqual(R.interp(250, self.P), 1)
        self.assertAlmostEqual(R.interp(80, self.P), 0.35)

    def test_en_medio_de_un_tramo(self):
        self.assertAlmostEqual(R.interp(20, self.P), 0.05)
        self.assertAlmostEqual(R.interp(115, self.P), 0.525)

    def test_fuera_de_rango(self):
        self.assertEqual(R.interp(-10, self.P), 0)
        self.assertEqual(R.interp(1000, self.P), 1)


class TestAcumulado(unittest.TestCase):
    def test_ventana_72h(self):
        self.assertEqual(R.max_acumulado([10, 0, 0, 30, 40, 50, 0]), 120)
        self.assertEqual(R.max_acumulado([5, None, 5]), 10)
        self.assertEqual(R.max_acumulado([]), 0)


class TestEscenarios(unittest.TestCase):
    def test_normal(self):
        r = escenario(**NORMAL)
        self.assertEqual(r["nivel"], 0)
        self.assertLess(r["probabilidad"], 15)

    def test_frente_frio(self):
        self.assertIn(escenario(**FRENTE_FRIO)["nivel"], (1, 2))

    def test_huracan(self):
        self.assertEqual(escenario(**HURACAN)["nivel"], 3)

    def test_aviso_nivel_3_sin_lluvia(self):
        r = escenario(base=50, pico=50, lluvia_local=[0] * 7, lluvia_sierra=[0] * 7, avisos=[3])
        self.assertEqual(r["nivel"], 3)

    def test_aviso_nunca_se_rebaja(self):
        r = escenario(base=50, pico=50, lluvia_local=[0] * 7, lluvia_sierra=[0] * 7, avisos=[2])
        self.assertEqual(r["nivel"], 2)

    def test_sin_caudal_no_truena(self):
        r = R.calcular([], UMBRALES, [], [], HOY)
        self.assertEqual(r["nivel"], 0)
        self.assertIn("No tenemos el pronóstico del río", r["resumen"])


class TestResumen(unittest.TestCase):
    PROHIBIDO = ["m³/s", "m3/s", "periodo de retorno", "percentil"]

    def test_sin_tecnicismos(self):
        for esc in (NORMAL, FRENTE_FRIO, HURACAN):
            texto = escenario(**esc)["resumen"]
            for palabra in self.PROHIBIDO:
                self.assertNotIn(palabra, texto.lower())

    def test_frases(self):
        self.assertEqual(escenario(**NORMAL)["resumen"], "El río está normal. No se espera lluvia fuerte esta semana.")
        texto = escenario(**HURACAN)["resumen"]
        self.assertTrue(texto.startswith("El río puede salirse de su cauce y meterse a las calles."))
        self.assertIn("Va a llover muchísimo en la sierra", texto)
        self.assertIn("Hay avisos de las autoridades", texto)
        self.assertTrue(texto.endswith("Si vive cerca del río, salga a un lugar alto."))

    def test_de_dos_a_cuatro_frases(self):
        for esc in (NORMAL, FRENTE_FRIO, HURACAN):
            n = escenario(**esc)["resumen"].count(".")
            self.assertGreaterEqual(n, 2)
            self.assertLessEqual(n, 4)


class TestComunidad(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        geo = json.loads((RAIZ / "public" / "geo.json").read_text(encoding="utf-8"))
        cls.rio = geo["river"]
        cls.locs = {l[0]: l for l in geo["locs"]}

    def zona_de(self, nombre):
        _, lat, lon, alt, _ = self.locs[nombre]
        return R.zona(R.distancia_rio(lat, lon, self.rio), alt), R.distancia_rio(lat, lon, self.rio)

    def test_alamo_junto_al_rio(self):
        z, d = self.zona_de("Álamo")
        self.assertEqual(z, "junto")
        self.assertAlmostEqual(d, 1.3, delta=0.3)

    def test_las_canas_lejos(self):
        self.assertEqual(self.zona_de("Las Cañas de Abajo")[0], "lejos")

    def test_nivel_por_zona(self):
        self.assertEqual(R.nivel_comunidad(3, "junto"), 3)
        self.assertEqual(R.nivel_comunidad(3, "cerca"), 2)
        self.assertEqual(R.nivel_comunidad(1, "lejos"), 0)


if __name__ == "__main__":
    unittest.main()
