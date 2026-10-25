import contextlib
import io
import json
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

import actualizar
import esquema
import fuentes

FIX = Path(__file__).resolve().parent / "fixtures"
AHORA = datetime(2026, 10, 23, 16, 17, tzinfo=timezone.utc)


def fixture(nombre):
    return json.loads((FIX / nombre).read_text(encoding="utf-8"))


def falla():
    raise OSError("sin conexión")


BUENAS = {
    "glofas": lambda: fixture("glofas.json"),
    "lluvia": lambda: fixture("lluvia.json"),
    "smn": lambda: fixture("smn.json"),
    "nhc": lambda: fixture("nhc.json"),
}


class TestActualizar(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.datos = self.dir / "data.json"
        self.umbrales = self.dir / "umbrales.json"
        self.avisos = self.dir / "avisos_manuales.json"
        self.umbrales.write_text(json.dumps({"rp2": 900, "rp5": 1500, "rp20": 2600}))
        self.avisos.write_text("[]")

    def correr(self, descargas, ahora=AHORA):
        with contextlib.redirect_stderr(io.StringIO()):
            return actualizar.ejecutar(self.datos, self.umbrales, self.avisos, descargas, ahora)

    def test_todo_bien_genera_json_valido(self):
        self.assertEqual(self.correr(BUENAS), 0)
        d = json.loads(self.datos.read_text(encoding="utf-8"))
        self.assertTrue(esquema.validar(d))
        self.assertTrue(all(f["ok"] for f in d["fuentes"]))
        self.assertFalse(self.dir.joinpath("data.json.tmp").exists())

    def test_temperatura_de_alamo(self):
        self.assertEqual(self.correr(BUENAS), 0)
        hoy = json.loads(self.datos.read_text(encoding="utf-8"))["lluvia"][0]
        self.assertEqual((hoy["tmax"], hoy["tmin"]), (27, 21))
        # un valor imposible o que no vino no se muestra
        crudo = fixture("lluvia.json")
        crudo[0]["daily"]["temperature_2m_max"][0] = 99.0
        del crudo[0]["daily"]["temperature_2m_min"]
        dia = fuentes.leer_lluvia(crudo)[0]
        self.assertEqual((dia["tmax"], dia["tmin"]), (None, None))

    def test_todas_fallan_no_toca_el_archivo(self):
        self.correr(BUENAS)
        antes = self.datos.read_bytes()
        codigo = self.correr({k: falla for k in BUENAS}, datetime(2026, 10, 23, 19, 17, tzinfo=timezone.utc))
        self.assertNotEqual(codigo, 0)
        self.assertEqual(self.datos.read_bytes(), antes)

    def test_todas_fallan_sin_archivo_previo(self):
        self.assertNotEqual(self.correr({k: falla for k in BUENAS}), 0)
        self.assertFalse(self.datos.exists())

    def test_una_falla_conserva_su_seccion(self):
        self.correr(BUENAS)
        antes = json.loads(self.datos.read_text(encoding="utf-8"))
        despues_hora = datetime(2026, 10, 23, 19, 17, tzinfo=timezone.utc)
        self.assertEqual(self.correr({**BUENAS, "glofas": falla}, despues_hora), 0)
        d = json.loads(self.datos.read_text(encoding="utf-8"))
        self.assertEqual(d["rio"]["serie"], antes["rio"]["serie"])
        glofas = next(f for f in d["fuentes"] if f["nombre"].startswith("GloFAS"))
        self.assertFalse(glofas["ok"])
        self.assertEqual(glofas["fecha"], antes["fuentes"][0]["fecha"])
        self.assertEqual(d["actualizado"], despues_hora.isoformat())
        otras = [f for f in d["fuentes"] if not f["nombre"].startswith("GloFAS")]
        self.assertTrue(all(f["ok"] for f in otras))

    def test_conserva_avisos_de_la_fuente_caida(self):
        tormenta = fixture("nhc.json")
        s = tormenta["activeStorms"][0]
        s.update(id="al992026", latitudeNumeric=21.5, longitudeNumeric=-96.0, classification="HU")
        self.correr({**BUENAS, "nhc": lambda: tormenta})
        self.assertEqual(json.loads(self.datos.read_text(encoding="utf-8"))["riesgo"]["nivel"], 3)
        self.correr({**BUENAS, "nhc": falla}, datetime(2026, 10, 23, 19, 17, tzinfo=timezone.utc))
        d = json.loads(self.datos.read_text(encoding="utf-8"))
        self.assertEqual(len([a for a in d["avisos"] if a["fuente"].startswith("Centro Nacional")]), 1)
        self.assertEqual(d["riesgo"]["nivel"], 3)

    def test_aviso_manual_nivel_3(self):
        self.avisos.write_text(json.dumps([
            {"fuente": "Protección Civil Veracruz", "titulo": "Alerta roja en Álamo", "nivel": 3,
             "fecha": "2026-10-23T09:00:00-06:00", "url": ""},
            {"fuente": "Protección Civil Veracruz", "titulo": "Aviso viejo", "nivel": 3,
             "fecha": "2026-10-19T09:00:00-06:00", "url": ""},
            {"titulo": "mal escrito"},
        ]))
        self.correr(BUENAS)
        d = json.loads(self.datos.read_text(encoding="utf-8"))
        self.assertEqual(d["riesgo"]["nivel"], 3)
        self.assertEqual([a["titulo"] for a in d["avisos"]], ["Alerta roja en Álamo"])

    def test_avisos_manuales_vacio_o_roto(self):
        for contenido in ("[]", "", "{no es json"):
            self.avisos.write_text(contenido)
            self.assertEqual(self.correr(BUENAS), 0)
        self.avisos.unlink()
        self.assertEqual(self.correr(BUENAS), 0)


class TestEsquema(unittest.TestCase):
    def test_rechaza_nivel_fuera_de_rango(self):
        d = json.loads((FIX / "data_ejemplo.json").read_text(encoding="utf-8"))
        esquema.validar(d)
        d["riesgo"]["nivel"] = 5
        with self.assertRaises(esquema.EsquemaInvalido):
            esquema.validar(d)

    def test_rechaza_campo_faltante(self):
        d = json.loads((FIX / "data_ejemplo.json").read_text(encoding="utf-8"))
        del d["fuentes"]
        with self.assertRaises(esquema.EsquemaInvalido):
            esquema.validar(d)

    def test_acepta_datos_sin_temperatura(self):
        d = json.loads((FIX / "data_ejemplo.json").read_text(encoding="utf-8"))
        for dia in d["lluvia"]:
            dia.pop("tmax", None), dia.pop("tmin", None)
        self.assertTrue(esquema.validar(d))


if __name__ == "__main__":
    unittest.main()
