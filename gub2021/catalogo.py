"""Catálogo sección -> municipio (INE, lista nominal abierta 2026) para fuentes que sólo traen distrito local.

La hoja de DatosAbiertos-derfe-pdln_edms_eo trae, por sección: clave de entidad, distrito federal y
clave de municipio (numeración INE) y la lista nominal (columnas LN_<ENTIDAD>). Se cruza con
``data/mun-ine-inegi.csv`` (INE -> INEGI) y con los nombres de ``geojsons/muni/<ent>.geojson``.
Es la geografía vigente en 2026: una sección que cambió de municipio o que no existía en 2021
queda sin asignar (se reporta).
"""
from __future__ import annotations

import csv
import json
import re
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

from .loaders import sin_acentos

RAIZ = Path(__file__).resolve().parents[1]
XLSX = RAIZ / "data" / "Copia-de-DatosAbiertos-derfe-pdln_edms_eo_20260820.xlsx"
CACHE = Path(__file__).with_name("catalogo_secciones.csv")
NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"


def _col(ref: str) -> int:
    i = 0
    for ch in re.match(r"([A-Z]+)", ref).group(1):
        i = i * 26 + ord(ch) - 64
    return i - 1


def construir_cache() -> None:
    z = zipfile.ZipFile(XLSX)
    ss = z.read("xl/sharedStrings.xml").decode("utf-8")
    strings = re.findall(r"<si>\s*(?:<t[^>]*>(.*?)</t>)?\s*</si>", ss, re.S)
    filas, row, cols_ln = [], {}, set()
    primera = True
    with z.open("xl/worksheets/sheet1.xml") as f:
        for _, el in ET.iterparse(f, events=("end",)):
            if el.tag == NS + "c":
                v = el.find(NS + "v")
                val = v.text if v is not None else None
                if el.get("t") == "s" and val is not None:
                    val = strings[int(val)]
                row[_col(el.get("r"))] = val
            elif el.tag == NS + "row":
                if primera:
                    cols_ln = {c for c, n in row.items() if n and str(n).startswith("LN_")}
                    primera = False
                else:
                    try:
                        ent, dfed, mun, sec = (int(float(row.get(i) or 0)) for i in (0, 2, 3, 4))
                        ln = sum(int(float(row.get(c) or 0)) for c in cols_ln)
                    except ValueError:
                        ent = 0
                    if ent and sec and mun:
                        filas.append((ent, dfed, mun, sec, ln))
                row = {}
                el.clear()
    with CACHE.open("w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["ent", "df", "mun_ine", "seccion", "ln2026"])
        w.writerows(filas)


def _crosswalk() -> dict[tuple[int, int], int]:
    out = {}
    with (RAIZ / "data" / "mun-ine-inegi.csv").open(encoding="utf-8") as f:
        for r in csv.DictReader(f):
            ine, inegi = int(r["clave_ine"]), int(r["clave_inegi"])
            out[(ine // 1000, ine % 1000)] = inegi % 1000
    return out


def _nombres_geojson(ent: int) -> dict[int, str]:
    g = json.loads((RAIZ / "geojsons" / "muni" / f"{ent:02d}.geojson").read_text(encoding="utf-8"))
    return {int(f["properties"]["cvegeo"]) % 1000: f["properties"]["name"] for f in g["features"]}


def _limpia(n: str) -> str:
    t = sin_acentos(n).upper().replace(",", " ")
    return re.sub(r"\s+", " ", t).strip()


def catalogo(ent: int) -> dict[int, tuple[str, int]]:
    """{sección: (NOMBRE MUNICIPIO, lista nominal 2026)} de la entidad."""
    if not CACHE.exists() or "ln2026" not in CACHE.read_text(encoding="utf-8")[:80]:
        construir_cache()
    cw = _crosswalk()
    nombres = _nombres_geojson(ent)
    out: dict[int, tuple[str, int]] = {}
    with CACHE.open(encoding="utf-8") as f:
        for r in csv.DictReader(f):
            if int(r["ent"]) != ent:
                continue
            ine = int(r["mun_ine"])
            nombre = nombres.get(cw.get((ent, ine), ine))
            if nombre:
                out[int(r["seccion"])] = (_limpia(nombre), int(r["ln2026"]))
    return out


def secciones_a_municipio(ent: int) -> dict[int, str]:
    return {s: m for s, (m, _) in catalogo(ent).items()}
