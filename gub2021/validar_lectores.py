import sys
sys.path.insert(0, r"G:\Metrix\DemoVotehub")
sys.stdout.reconfigure(encoding="utf-8")
import pandas as pd
from gub2021.loaders import LOADERS

pd.set_option("display.width", 250)
claves = sys.argv[1:] or list(LOADERS)
for k in claves:
    try:
        df = LOADERS[k]()
    except Exception as e:
        import traceback; traceback.print_exc()
        print("##", k, "ERROR", e)
        continue
    partidos = [c for c in df.columns if c not in ["MUNICIPIO", "DL", "SECCION", "LISTA_NOMINAL", "CNR", "NULOS", "TOTAL"]]
    calc = df[partidos].sum(axis=1) + df["CNR"] + df["NULOS"]
    tot = df["TOTAL"]
    mism = int(((tot.notna()) & (calc != tot)).sum())
    print(f"## {k}: filas={len(df)} munis={df['MUNICIPIO'].nunique()} secc={df['SECCION'].nunique()} "
          f"LN={df['LISTA_NOMINAL'].sum():,.0f} votos_calc={calc.sum():,.0f} total_fuente={tot.sum():,.0f} desajustes={mism}")
    print("   partidos:", partidos)
    tp = df[partidos].sum().sort_values(ascending=False)
    print("   top:", {a: int(b) for a, b in tp.head(6).items()}, "CNR", int(df.CNR.sum()), "NUL", int(df.NULOS.sum()))
    if mism:
        print(df[(tot.notna()) & (calc != tot)].head(5).to_string()[:1200])
