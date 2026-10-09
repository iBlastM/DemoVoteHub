"""Cruce de nombres de municipio (fuente OPLE) contra los de SRC para la Lista Nominal 2021."""
from __future__ import annotations

import difflib
import json
import re
from pathlib import Path

from .loaders import sin_acentos

SRC_JSON = Path(__file__).with_name("src_ln.json")

_SUST = [
    (r"\bGRAL\b\.?", "GENERAL"), (r"\bDR\b\.?", "DOCTOR"), (r"\bSTA\b\.?", "SANTA"), (r"\bSTO\b\.?", "SANTO"),
    (r"\bCD\b\.?", "CIUDAD"), (r"\bPROF\b\.?", "PROFESOR"), (r"\bING\b\.?", "INGENIERO"), (r"\bLIC\b\.?", "LICENCIADO"),
]


def clave_nombre(nombre: str) -> str:
    t = sin_acentos(nombre).upper()
    t = re.sub(r"^LISTA NOMINAL\s+", "", t)
    t = re.sub(r"\s+(ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE)\b.*$", "", t)
    for pat, rep in _SUST:
        t = re.sub(pat, rep, t)
    t = re.sub(r"[^A-Z0-9 ]+", " ", t)
    t = re.sub(r"\b(DE|DEL|LA|LAS|LOS|EL|Y)\b", " ", t)
    return re.sub(r"\s+", "", t)


# Ajustes manuales (clave normalizada de la fuente OPLE -> clave normalizada del título SRC).
ALIAS = {
    "VOTOENELEXTRANJERO": None,
}


def tabla_src(estado_slug: str, anio: str) -> dict[str, int]:
    datos = json.loads(SRC_JSON.read_text(encoding="utf-8"))
    out: dict[str, int] = {}
    for slug, info in datos[estado_slug].items():
        if anio in info:
            out[clave_nombre(info["titulo"])] = info[anio]
    return out


def cruzar(nombres: list[str], estado_slug: str, anio: str, alias: dict[str, str] | None = None):
    """Devuelve ({nombre_fuente: LN}, [sin_cruce], [aproximados])."""
    src = tabla_src(estado_slug, anio)
    alias = {**ALIAS, **(alias or {})}
    res: dict[str, int] = {}
    sin: list[str] = []
    aprox: list[tuple[str, str]] = []
    usados: set[str] = set()
    for n in nombres:
        k = clave_nombre(n)
        k = alias.get(k, k) if k in alias else k
        if k is None:
            continue
        if k in src:
            res[n] = src[k]; usados.add(k)
            continue
        cand = difflib.get_close_matches(k, list(src), n=1, cutoff=0.8)
        if cand:
            res[n] = src[cand[0]]; usados.add(cand[0]); aprox.append((n, cand[0]))
        else:
            sin.append(n)
    no_usados = [k for k in src if k not in usados]
    return res, sin, aprox, no_usados
