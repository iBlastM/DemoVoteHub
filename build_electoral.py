#!/usr/bin/env python3
"""Importa los datos estáticos del Dashboard Electoral (Querétaro 2018-2024)
para la pestaña #/electoral.

Lee la carpeta del proyecto original y escribe:
  data/electoral/*.json               resultados por sección y candidatos (JSON compacto)
  geojsons/electoral/*.geojson        secciones por año, municipios y distritos locales
                                      (los distritos se recortan a Querétaro: de ~50 MB a <1 MB)
  images/candidatos/<año>/<tipo>/<lugar>/<nombre>.jpg
                                      fotos de candidatos redimensionadas (máx. 400x500, JPEG)
                                      con rutas normalizadas (minúsculas, sin acentos, con guiones)

Las rutas de las fotos siguen la misma regla que slugify() en js/utils.js, así que la
vista calcula la ruta a partir del nombre del candidato y del municipio o distrito.

Uso: py build_electoral.py [ruta_dashboard_electoral]
     (def. ../DashboardElectoral junto a esta carpeta). Requiere Pillow.
"""
import json, os, re, shutil, sys, unicodedata

AQUI = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.path.join(AQUI, '..', 'DashboardElectoral'))

OUT_DATA = os.path.join(AQUI, 'data', 'electoral')
OUT_GEO = os.path.join(AQUI, 'geojsons', 'electoral')
OUT_FOTOS = os.path.join(AQUI, 'images', 'candidatos')

JSONS = [
    'Ayuntamientos_2018', 'Ayuntamientos_2021', 'Ayuntamientos_2024',
    'DiputacionLocal_2018', 'DiputacionLocal_2021', 'DiputacionLocal_2024',
    'DiputacionFederal_2018', 'DiputacionFederal_2021', 'DiputacionFederal_2024',
    'Gubernatura_2021', 'candidatos',
]
GEOS = ['secciones_2018', 'secciones_2021', 'secciones_2024', 'municipios']

# Carpeta de fotos de origen -> tipo de elección (las claves se comparan normalizadas).
CARPETAS_FOTOS = {
    ('2021', 'AYUNTAMIENTOS'): 'ayuntamiento',
    ('2021', 'DIPUTADOS FEDERALES'): 'diputacion_federal',
    ('2021', 'DISTRITOS'): 'diputacion_local',
    ('2021', 'GUBERNATURA'): 'gobernatura',
    ('2024', 'AYUNTAMIENTOS'): 'ayuntamiento',
    ('2024', 'DIPUTACION FEDERAL'): 'diputacion_federal',
    ('2024', 'DIPUTACION LOCAL'): 'diputacion_local',
}
# Carpetas de municipio con nombre abreviado.
ALIAS_MUNICIPIO = {'AMEALCO': 'AMEALCO DE BONFIL', 'PENA MILLER': 'PENAMILLER'}
# Fotos con nombre de archivo distinto al del candidato (tomado del dashboard original).
ALIAS_FOTO = {
    'abigail_ramos': 'ABIGAIL ARREDONDO RAMOS', 'mauricio_gonzalez': 'MAURICIO KURI GONZALEZ',
    'raquel_alvarez': 'RAQUEL RUIZ DE SANTIAGO ALVAREZ', 'beatriz_sotelo': 'BEATRIZ MAGDALENA LEON SOTELO',
    'katia_jaime': 'KATIA RESENDIZ JAIME', 'celia_garcia': 'CELIA MAYA GARCIA',
    'penelope_manriquez': 'PENELOPE RAMIREZ MANRIQUEZ', 'maria_silva': 'MA. DE JESUS IBARRA SILVA',
    'miguel_alvarado': 'MIGUEL NAVA ALVARADO', 'juan_rodriguez': 'JUAN CARLOS MARTINEZ CECIAS RODRIGUEZ',
    'rene_montoya': 'RENE MEJIA MONTOYA',
    'javier_pérez_mocha_malcher': 'JAVIER PEREZ ROCHA MALCHER',  # errata en el nombre del archivo
}
FOTO_MAX = (400, 500)


def norm(s):
    s = unicodedata.normalize('NFD', str(s))
    return ''.join(c for c in s if unicodedata.category(c) != 'Mn').upper().strip()


def slugify(s):
    """Igual que slugify() de js/utils.js."""
    s = norm(s).lower()
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')


def dump(obj, path):
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False, separators=(',', ':'))


def load(path):
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def kb(path):
    return os.path.getsize(path) // 1024


def copiar_datos():
    os.makedirs(OUT_DATA, exist_ok=True)
    for name in JSONS:
        dst = os.path.join(OUT_DATA, f'{name}.json')
        dump(load(os.path.join(SRC, 'jsons', f'{name}.json')), dst)
        print(f'  data/electoral/{name}.json  {kb(dst)} KB')


def copiar_geo():
    os.makedirs(OUT_GEO, exist_ok=True)
    for name in GEOS:
        dst = os.path.join(OUT_GEO, f'{name}.geojson')
        dump(load(os.path.join(SRC, 'geojsons', f'{name}.geojson')), dst)
        print(f'  geojsons/electoral/{name}.geojson  {kb(dst)} KB')
    dist = load(os.path.join(SRC, 'geojsons', 'DISTRITOS_LOCALES_24.geojson'))
    dist['features'] = [f for f in dist['features'] if norm(f['properties'].get('NOM_ENT', '')) == 'QUERETARO']
    dst = os.path.join(OUT_GEO, 'distritos_locales.geojson')
    dump(dist, dst)
    print(f'  geojsons/electoral/distritos_locales.geojson  {kb(dst)} KB ({len(dist["features"])} distritos)')


def lugar_de(tipo, carpeta):
    if tipo == 'gobernatura':
        return None
    if tipo == 'ayuntamiento':
        n = norm(carpeta)
        return ALIAS_MUNICIPIO.get(n, n)
    num = re.search(r'\d+', carpeta)
    return f'DISTRITO {int(num.group())}' if num else None


def ruta_foto(anio, tipo, lugar, nombre):
    partes = [anio, tipo] + ([slugify(lugar)] if lugar else []) + [slugify(nombre) + '.jpg']
    return os.path.join(OUT_FOTOS, *partes)


def copiar_fotos():
    from PIL import Image, ImageOps

    base = os.path.join(SRC, 'images', 'candidatos')
    if os.path.isdir(OUT_FOTOS):
        shutil.rmtree(OUT_FOTOS)
    hechas = set()
    total_in = total_out = 0
    for anio in sorted(os.listdir(base)):
        for carpeta in sorted(os.listdir(os.path.join(base, anio))):
            tipo = CARPETAS_FOTOS.get((anio, norm(carpeta)))
            if not tipo:
                print(f'  (omitida) {anio}/{carpeta}')
                continue
            raiz = os.path.join(base, anio, carpeta)
            for dirpath, _dirs, files in os.walk(raiz):
                sub = os.path.relpath(dirpath, raiz)
                lugar = lugar_de(tipo, sub) if sub != '.' else None
                if tipo != 'gobernatura' and not lugar:
                    continue
                for fn in files:
                    stem, ext = os.path.splitext(fn)
                    if ext.lower() not in ('.jpg', '.jpeg', '.png', '.webp'):
                        continue
                    nombre = ALIAS_FOTO.get(stem.lower(), re.sub(r'[_\s]+', ' ', stem))
                    dst = ruta_foto(anio, tipo, lugar, nombre)
                    os.makedirs(os.path.dirname(dst), exist_ok=True)
                    src = os.path.join(dirpath, fn)
                    with Image.open(src) as im:
                        im = ImageOps.exif_transpose(im).convert('RGB')
                        im.thumbnail(FOTO_MAX, Image.LANCZOS)
                        im.save(dst, 'JPEG', quality=82, optimize=True, progressive=True)
                    total_in += os.path.getsize(src)
                    total_out += os.path.getsize(dst)
                    hechas.add((anio, tipo, slugify(lugar) if lugar else '', slugify(nombre)))
    print(f'  {len(hechas)} fotos: {total_in // 2**20} MB -> {total_out // 2**20} MB')
    return hechas


def revisar_cobertura(hechas):
    """Cuenta cuántos candidatos de candidatos.json tienen foto (2021 y 2024)."""
    cand = load(os.path.join(SRC, 'jsons', 'candidatos.json'))
    con = sin = 0
    faltan = []
    for tipo, por_anio in cand.items():
        for anio, data in por_anio.items():
            if anio not in ('2021', '2024'):
                continue
            grupos = {None: data} if tipo == 'gobernatura' else data
            for lugar, nombres in grupos.items():
                if lugar == '_default':
                    continue
                for nombre in nombres:
                    key = (anio, tipo, slugify(lugar) if lugar else '', slugify(nombre))
                    if key in hechas:
                        con += 1
                    else:
                        sin += 1
                        faltan.append('/'.join(k for k in key if k))
    print(f'  candidatos 2021/2024 con foto: {con}, sin foto: {sin}')
    for f in faltan:
        print(f'    sin foto: {f}')


def main():
    if not os.path.isdir(SRC):
        sys.exit(f'No existe la carpeta de origen: {SRC}')
    print(f'Origen: {SRC}')
    print('Datos:')
    copiar_datos()
    print('GeoJSON:')
    copiar_geo()
    print('Fotos:')
    revisar_cobertura(copiar_fotos())


if __name__ == '__main__':
    main()
