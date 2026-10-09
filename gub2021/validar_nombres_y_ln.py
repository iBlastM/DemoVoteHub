import sys, json, re
sys.path.insert(0, r"G:\Metrix\DemoVotehub")
sys.stdout.reconfigure(encoding="utf-8")
import pandas as pd
from gub2021.scrape_src import _get, _serie, BASE
from gub2021.loaders import sin_acentos
D = r"G:\Metrix\DemoVotehub\data\\"
print("== LN del origen vs SRC 2021 (estatal)")
for slug, f in [("baja-california", "SE_GUB_BC_2021.csv"), ("michoacan", "SE_GUB_MICH_2021.csv"), ("sonora", "SE_GUB_SON_2021.csv"),
                ("zacatecas", "SE_GUB_ZAC_2021.csv"), ("colima", "SE_GUB_COL_2021.csv"), ("tlaxcala", "SE_GUB_TLAX_2021.csv"),
                ("nayarit", "SE_GUB_NAY_2021.csv"), ("guerrero", "SE_GUB_GRO_2021.csv"), ("campeche", "SE_GUB_CAMP_2021.csv")]:
    s = _serie(_get(BASE + slug)).get("2021")
    d = pd.read_csv(D + f)
    print(f"{slug:<16} origen={d.LISTA_NOMINAL.sum():>10,}  SRC2021={s:>10,}  dif={d.LISTA_NOMINAL.sum()/s-1:+.2%}")

print("== nombres de municipio vs geojson/muni (slugify del Demo)")
def slug(s):
    s = sin_acentos(s).lower().strip()
    return re.sub(r"^-+|-+$", "", re.sub(r"[^a-z0-9]+", "-", s))
for f, cve, y in [("AGS", 1, 2022), ("BC", 2, 2021), ("BCS", 3, 2021), ("CAMP", 4, 2021), ("CHIH", 8, 2021), ("COL", 6, 2021),
                  ("GRO", 12, 2021), ("MICH", 16, 2021), ("NAY", 18, 2021), ("NL", 19, 2021), ("QROO", 23, 2022),
                  ("SLP", 24, 2021), ("SON", 26, 2021), ("TLAX", 29, 2021), ("ZAC", 32, 2021)]:
    d = pd.read_csv(D + f"SE_GUB_{f}_{y}.csv")
    g = json.load(open(rf"G:\Metrix\DemoVotehub\geojsons\muni\{cve:02d}.geojson", encoding="utf-8"))
    gs = {slug(x["properties"]["name"]) for x in g["features"]}
    ms = {slug(m) for m in d.MUNICIPIO.dropna().unique() if m != "VOTO EN EL EXTRANJERO"}
    print(f, "fuente", len(ms), "geojson", len(gs), "sin match en geojson:", sorted(ms - gs), "| geojson sin datos:", sorted(gs - ms))
