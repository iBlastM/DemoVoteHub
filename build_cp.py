#!/usr/bin/env python3
"""Construye geojsons/cp-demo.geojson: polígonos de código postal (CP)
de los 17 estados con elección en 2027, SIMPLIFICADOS (RDP) y con un
partido ganador FICTICIO asignado de forma determinista.

Uso: py build_cp.py [epsilon]   (epsilon en grados, def. 0.004)
"""
import json, sys, math, os

BASE = os.path.join(os.path.dirname(__file__), 'geojsons')
EPS = float(sys.argv[1]) if len(sys.argv) > 1 else 0.004

# prefijo de archivo -> (slug de estado, voto ficticio por fuerza en %)
ESTADOS = {
    '01-Ags':  ('aguascalientes',        {'PAN': 45, 'MORENA': 40, 'MC': 9}),
    '02-Bc':   ('baja-california',       {'MORENA': 55, 'PAN': 33, 'MC': 8}),
    '03-Bcs':  ('baja-california-sur',   {'MORENA': 44, 'PAN': 40, 'MC': 10}),
    '04-Camp': ('campeche',              {'MORENA': 52, 'PAN': 24, 'PRI': 18}),
    '06-Col':  ('colima',                {'MORENA': 50, 'PAN': 34, 'MC': 10}),
    '08-Chih': ('chihuahua',             {'MORENA': 46, 'PAN': 42, 'MC': 8}),
    '23-Qroo': ('quintana-roo',          {'MORENA': 45, 'PAN': 10, 'MC': 9}),
    '12-Gro':  ('guerrero',              {'MORENA': 58, 'PRI': 20, 'PAN': 16}),
    '16-Mich': ('michoacan-de-ocampo',   {'MORENA': 45, 'PAN': 30, 'MC': 18}),
    '18-Nay':  ('nayarit',               {'MORENA': 53, 'PAN': 30, 'MC': 11}),
    '19-NL':   ('nuevo-leon',            {'MC': 41, 'MORENA': 38, 'PAN': 17}),
    '22-Qro':  ('queretaro',             {'PAN': 49, 'MORENA': 41, 'MC': 6}),
    '24-SLP':  ('san-luis-potosi',       {'MORENA': 48, 'PAN': 26, 'PRI': 20}),
    '25-Sin':  ('sinaloa',               {'MORENA': 47, 'PAN': 41, 'MC': 7}),
    '26-Son':  ('sonora',                {'MORENA': 56, 'PAN': 34, 'MC': 6}),
    '29-Tlax': ('tlaxcala',              {'MORENA': 54, 'PAN': 28, 'PRI': 12}),
    '32-Zac':  ('zacatecas',             {'MORENA': 51, 'PAN': 30, 'PRI': 13}),
}


def mulberry32(seed):
    a = seed & 0xFFFFFFFF
    def rnd():
        nonlocal a
        a = (a + 0x6D2B79F5) & 0xFFFFFFFF
        t = a
        t = (t ^ (t >> 15)) * (t | 1) & 0xFFFFFFFF
        t ^= (t + ((t ^ (t >> 7)) * (t | 61) & 0xFFFFFFFF)) & 0xFFFFFFFF
        t &= 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296.0
    return rnd


def rdp(points, eps):
    """Ramer-Douglas-Peucker iterativo sobre lista de [x,y]."""
    n = len(points)
    if n < 3:
        return points
    keep = [False] * n
    keep[0] = keep[-1] = True
    stack = [(0, n - 1)]
    while stack:
        i0, i1 = stack.pop()
        ax, ay = points[i0]
        bx, by = points[i1]
        dx, dy = bx - ax, by - ay
        seg2 = dx * dx + dy * dy
        dmax, idx = 0.0, -1
        for i in range(i0 + 1, i1):
            px, py = points[i]
            if seg2 == 0:
                d = math.hypot(px - ax, py - ay)
            else:
                t = ((px - ax) * dx + (py - ay) * dy) / seg2
                t = max(0.0, min(1.0, t))
                d = math.hypot(px - (ax + t * dx), py - (ay + t * dy))
            if d > dmax:
                dmax, idx = d, i
        if dmax > eps and idx != -1:
            keep[idx] = True
            stack.append((i0, idx))
            stack.append((idx, i1))
    return [points[i] for i in range(n) if keep[i]]


def simplify_ring(ring):
    r = rdp(ring, EPS)
    r = [[round(x, 4), round(y, 4)] for x, y in r]
    # elimina puntos consecutivos duplicados
    out = [r[0]]
    for p in r[1:]:
        if p != out[-1]:
            out.append(p)
    return out if len(out) >= 4 else None


def asignar(voto, u):
    # pesos afilados para dar dominancia realista a la fuerza líder
    forces = list(voto.items())
    weights = [(f, (v / 100.0) ** 1.7) for f, v in forces]
    tot = sum(w for _, w in weights)
    r = u() * tot
    acc = 0.0
    win = weights[0][0]
    for f, w in weights:
        acc += w
        if r <= acc:
            win = f
            break
    # intensidad (para color): sesgada según qué tan líder es la fuerza
    s = round(min(1.0, max(0.15, (voto[win] / 100.0) * (0.7 + u() * 0.7))), 2)
    return win, s


def main():
    feats = []
    total_pts = 0
    for pref, (slug, voto) in ESTADOS.items():
        path = os.path.join(BASE, pref + '.geojson')
        d = json.load(open(path, encoding='utf-8'))
        for ft in d['features']:
            cp = ft['properties'].get('d_codigo')
            u = mulberry32((int(cp) * 2654435761) & 0xFFFFFFFF)
            win, s = asignar(voto, u)
            g = ft['geometry']
            polys = g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]
            new_polys = []
            for poly in polys:
                ext = simplify_ring(poly[0])
                if ext:
                    new_polys.append([ext])
                    total_pts += len(ext)
            if not new_polys:
                continue
            geom = ({'type': 'Polygon', 'coordinates': new_polys[0]}
                    if len(new_polys) == 1
                    else {'type': 'MultiPolygon', 'coordinates': new_polys})
            feats.append({'type': 'Feature',
                          'properties': {'cp': cp, 'edo': slug, 'w': win, 's': s},
                          'geometry': geom})
    out = {'type': 'FeatureCollection', 'features': feats}
    dest = os.path.join(BASE, 'cp-demo.geojson')
    with open(dest, 'w', encoding='utf-8') as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(',', ':'))
    size = os.path.getsize(dest)
    print(f'eps={EPS} feats={len(feats)} pts={total_pts} size={size/1e6:.2f}MB -> {dest}')


if __name__ == '__main__':
    main()
