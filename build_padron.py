#!/usr/bin/env python3
"""Agrega el XLSX de Padrón y Lista Nominal (INE, datos abiertos) a un JSON
ligero por entidad y municipio. Se ejecuta una sola vez; la app nunca carga
el XLSX (150 MB), solo el JSON resultante (~decenas de KB).

Uso:  python build_padron.py
"""
import json
import os
import re
import zipfile
import xml.etree.ElementTree as ET

XLSX = r'data/Copia-de-DatosAbiertos-derfe-pdln_edms_eo_20260820.xlsx'
OUT = r'data/padron-ln.json'

CLAVE = {
    'AGUASCALIENTES': 1, 'BAJA_CALIFORNIA': 2, 'BAJA_CALIFORNIA_SUR': 3,
    'CAMPECHE': 4, 'COAHUILA': 5, 'COLIMA': 6, 'CHIAPAS': 7, 'CHIHUAHUA': 8,
    'CDMX': 9, 'DISTRITO_FEDERAL': 9, 'DURANGO': 10, 'GUANAJUATO': 11,
    'GUERRERO': 12, 'HIDALGO': 13, 'JALISCO': 14, 'ESTADO_DE_MEXICO': 15,
    'MICHOACAN': 16, 'MORELOS': 17, 'NAYARIT': 18, 'NUEVO_LEON': 19,
    'OAXACA': 20, 'PUEBLA': 21, 'QUERETARO': 22, 'QUINTANA_ROO': 23,
    'SAN_LUIS_POTOSI': 24, 'SINALOA': 25, 'SONORA': 26, 'TABASCO': 27,
    'TAMAULIPAS': 28, 'TLAXCALA': 29, 'VERACRUZ': 30, 'YUCATAN': 31,
    'ZACATECAS': 32,
}

# Equivalencias entre la clave municipal del XLSX (numeración del INE, en
# general alfabética) y la clave INEGI vigente usada por los GeoJSON. Sin esta
# tabla, por ejemplo, Monterrey (INE 40) caería sobre Parás (INEGI 40).
# Fuente: Eric Magar, elecRetrns/ancillary/mun.yrs.csv (MIT); solo se guardan
# las claves que difieren. Incluye el caso de BCS (Los Cabos 4→8, Loreto 5→9).
CROSSWALK = r'data/mun-ine-inegi.csv'


def load_crosswalk():
    import csv
    out = {}
    with open(CROSSWALK, encoding='utf-8') as f:
        for r in csv.DictReader(f):
            ine, inegi = int(r['clave_ine']), int(r['clave_inegi'])
            out.setdefault(ine // 1000, {})[ine % 1000] = inegi % 1000
    return out


MUNI_INEGI = load_crosswalk()

NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'


def col_index(ref):
    m = re.match(r'([A-Z]+)', ref)
    idx = 0
    for ch in m.group(1):
        idx = idx * 26 + (ord(ch) - 64)
    return idx - 1


def main():
    z = zipfile.ZipFile(XLSX)
    ss = z.read('xl/sharedStrings.xml').decode('utf-8')
    strings = re.findall(r'<si>\s*(?:<t[^>]*>(.*?)</t>)?\s*</si>', ss, re.S)

    estados = {}   # clave INEGI -> [padron, lista nominal, ln extranjero]
    mun = {}       # clave INEGI -> { clave municipio -> [padron, ln] }
    pad_col = {}   # colIdx -> clave entidad
    ln_col = {}

    def est(k):
        return estados.setdefault(k, [0, 0, 0])

    def process(r):
        nombre = r.get(1, '')
        if nombre == 'RESIDENTES EXTRANJERO':
            for c, k in ln_col.items():
                v = int(float(r.get(c) or 0))
                if v:
                    est(k)[2] += v
            return
        ent = int(float(r.get(0) or 0))
        muni = int(float(r.get(3) or 0))
        muni = MUNI_INEGI.get(ent, {}).get(muni, muni)
        if not ent:
            return
        pad = sum(int(float(r.get(c) or 0)) for c in pad_col)
        ln = sum(int(float(r.get(c) or 0)) for c in ln_col)
        e = est(ent)
        e[0] += pad
        e[1] += ln
        if muni:
            m = mun.setdefault(ent, {}).setdefault(muni, [0, 0])
            m[0] += pad
            m[1] += ln

    row = []
    first = True
    with z.open('xl/worksheets/sheet1.xml') as f:
        for ev, el in ET.iterparse(f, events=('end',)):
            if el.tag == NS + 'c':
                t = el.get('t')
                v = el.find(NS + 'v')
                val = v.text if v is not None else None
                if t == 's' and val is not None:
                    val = strings[int(val)]
                row.append((col_index(el.get('r')), val))
            elif el.tag == NS + 'row':
                r = dict(row)
                row = []
                el.clear()
                if first:
                    for c, name in r.items():
                        if not name:
                            continue
                        if name.startswith('PAD_') and name[4:] in CLAVE:
                            pad_col[c] = CLAVE[name[4:]]
                        elif name.startswith('LN_') and name[3:] in CLAVE:
                            ln_col[c] = CLAVE[name[3:]]
                    first = False
                    continue
                process(r)

    payload = {
        'meta': {
            'fuente': 'INE — Datos abiertos DERFE, padrón y lista nominal',
            'archivo': os.path.basename(XLSX),
            'corte': '2026-08-20',
            'unidades': 'personas registradas',
        },
        'estados': estados,
        'mun': mun,
    }
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(payload, f, separators=(',', ':'))
    print('OK', OUT, os.path.getsize(OUT), 'bytes')
    print('QRO estado [padron, ln, lnExt]:', estados.get(22))
    print('QRO muni 1 (Amealco):', mun.get(22, {}).get(1))


if __name__ == '__main__':
    main()
