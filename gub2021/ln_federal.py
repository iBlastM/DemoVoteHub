"""Lista nominal 2021 por sección tomada del cómputo de diputaciones federales (INE, 11-jun-2021).

La misma lista nominal rigió en las elecciones locales concurrentes del 6 de junio de 2021, así que sirve
para completar o corregir la de los cómputos locales. Fuente: Gubernaturas/diputaciones.csv (todo el país,
una fila por casilla). Se cachea una tabla compacta (entidad, sección, lista nominal).
"""
from __future__ import annotations

import csv
from pathlib import Path

import pandas as pd

from .loaders import BASE

FUENTE = BASE / "diputaciones.csv"
CACHE = Path(__file__).with_name("ln_federal_2021.csv")


def construir_cache() -> None:
    d = pd.read_csv(FUENTE, sep="|", skiprows=6, encoding="latin-1", dtype=str, low_memory=False,
                    usecols=["ID_ESTADO", "SECCION", "LISTA_NOMINAL_CASILLA"])
    d = d[pd.to_numeric(d["SECCION"], errors="coerce").notna()].copy()
    d["ent"] = d["ID_ESTADO"].astype(int)
    d["seccion"] = d["SECCION"].astype(int)
    d["ln"] = pd.to_numeric(d["LISTA_NOMINAL_CASILLA"], errors="coerce").fillna(0).astype(int)
    d.groupby(["ent", "seccion"], as_index=False)["ln"].sum().to_csv(CACHE, index=False)


def ln_por_seccion(ent: int) -> dict[int, int]:
    if not CACHE.exists():
        construir_cache()
    t = pd.read_csv(CACHE)
    t = t[t["ent"] == ent]
    return dict(zip(t["seccion"], t["ln"]))
