"""Sinaloa: sección -> distrito local -> municipio con la distritación vigente en 2021 (INE 2015).

Fuente: Gubernaturas/Secciones.pdf, "LISTADO DE SECCIONES IEES - Encuentra tu Distrito por la Sección de tu
Credencial de Elector" (PDF creado en 2017, es decir, la distritación de 2016-2022 que rigió en 2021).
"""
from __future__ import annotations

import json
import re
from pathlib import Path

import pdfplumber

from .loaders import BASE, limpia_muni

PDF = BASE / "Secciones.pdf"
CACHE = Path(__file__).with_name("sinaloa_secciones_2021.json")
FILA = re.compile(r"^25 SINALOA (\d+) (\d+) (.+?) (\d+)$")


def construir_cache() -> list[dict]:
    filas = []
    with pdfplumber.open(PDF) as pdf:
        for pg in pdf.pages:
            for linea in (pg.extract_text() or "").splitlines():
                m = FILA.match(linea.strip())
                if m:
                    filas.append(dict(dl=int(m.group(1)), cve_mun=int(m.group(2)), municipio=limpia_muni(m.group(3)),
                                      seccion=int(m.group(4))))
    CACHE.write_text(json.dumps(filas, ensure_ascii=False), encoding="utf-8")
    return filas


def secciones_sinaloa() -> list[dict]:
    if CACHE.exists():
        return json.loads(CACHE.read_text(encoding="utf-8"))
    return construir_cache()
