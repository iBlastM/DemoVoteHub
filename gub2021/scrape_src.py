"""Descarga la Lista Nominal anual (serie 2021-2026, INE-DERFE) por municipio desde src.org.mx.

Uso:  python -m gub2021.scrape_src chihuahua nuevo-leon ...
Escribe gub2021/src_ln.json con {estado: {municipio_slug: {"nombre":..., "2021": n, "2022": n}}, "_estatal": {...}}.
"""
from __future__ import annotations

import html
import json
import re
import sys
import time
from pathlib import Path

import requests

OUT = Path(__file__).with_name("src_ln.json")
BASE = "https://www.src.org.mx/lista-nominal/mexico/"
HDR = {"User-Agent": "Mozilla/5.0 (script de consulta puntual; uso local)"}


def _get(url: str) -> str:
    for intento in range(3):
        r = requests.get(url, headers=HDR, timeout=45)
        if r.status_code == 200:
            return r.text
        time.sleep(1.5 * (intento + 1))
    raise RuntimeError(f"{url}: HTTP {r.status_code}")


def _serie(pagina: str) -> dict[str, int]:
    """{'2021': total, ...} desde la tabla 'Serie 2021–2026'."""
    out: dict[str, int] = {}
    for fila in re.findall(r"<tr[^>]*>(.*?)</tr>", pagina, flags=re.S):
        celdas = [re.sub(r"<[^>]+>", "", c).strip() for c in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", fila, flags=re.S)]
        if len(celdas) >= 5 and re.fullmatch(r"20\d\d", celdas[0]):
            try:
                out.setdefault(celdas[0], int(celdas[4].replace(",", "")))
            except ValueError:
                pass
    return out


def _titulo(pagina: str) -> str:
    m = re.search(r"<h1[^>]*>(.*?)</h1>", pagina, flags=re.S)
    return html.unescape(re.sub(r"<[^>]+>", " ", m.group(1)).strip()) if m else ""


def main(estados: list[str]) -> None:
    datos = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
    for est in estados:
        pag = _get(f"{BASE}{est}")
        datos.setdefault("_estatal", {})[est] = _serie(pag)
        enlaces = sorted(set(re.findall(rf'href="/lista-nominal/mexico/{est}/([a-z0-9\-]+)"', pag)))
        mun = datos.setdefault(est, {})
        for slug in enlaces:
            if slug in mun:
                continue
            p = _get(f"{BASE}{est}/{slug}")
            mun[slug] = {"titulo": _titulo(p), **_serie(p)}
            time.sleep(0.25)
        OUT.write_text(json.dumps(datos, ensure_ascii=False, indent=1), encoding="utf-8")
        print(est, len(mun), "municipios; estatal", datos["_estatal"][est].get("2021"), flush=True)


if __name__ == "__main__":
    main(sys.argv[1:])
