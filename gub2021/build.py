"""Genera las bases de gubernatura (sábana estándar de AppBasesElectorales) para DemoVotehub/data.

Uso:   python -m gub2021.build            (desde G:\\Metrix\\DemoVotehub)
Salida: data/SE_GUB_<ENTIDAD>_<AÑO>.csv  +  data/SE_GUB_indice.csv

Pasos por entidad:
  1. Lector específico del formato de cada OPLE (gub2021/loaders.py, gub2021/extras.py).
  2. Municipio: si el origen sólo trae distrito/sección, se asigna por sección con el catálogo INE
     (gub2021/catalogo.py); las secciones que ya no existen en 2026 toman el municipio de la sección
     vecina del mismo distrito. Si sólo trae distritos (Campeche) se reparte con las secciones de cada distrito.
  3. Se agrupa por (municipio, sección). Las filas "sección 0" (voto en el extranjero, actas de
     recuento del Consejo, etc.) se conservan por municipio.
  4. Lista nominal: la del origen cuando existe; si no, la lista nominal anual de SRC (INE-DERFE)
     por municipio (o estatal) repartida entre las secciones en proporción a sus votos.
     Siempre queda marcada en la columna LN_FUENTE.
  5. Columnas calculadas (participación, abstención, top 3, PCN, validación...) con el mismo código
     de la app (src.excel_writer.construir_dataframe_completo / src.configuracion).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

RAIZ = Path(__file__).resolve().parents[1]
APP = Path(r"G:\Metrix\AppBasesElectorales")
sys.path.insert(0, str(APP))
sys.path.insert(0, str(RAIZ))

from src.configuracion import config_desde_perfil_simple  # noqa: E402
from src.excel_writer import construir_dataframe_completo  # noqa: E402
from src.perfiles import crear_perfil_generico  # noqa: E402

from gub2021.catalogo import catalogo  # noqa: E402
from gub2021.extras import (cargar_ags, cargar_campeche, cargar_guerrero, cargar_nayarit_pp, cargar_qroo,  # noqa: E402
                            cargar_sinaloa)
from gub2021.loaders import LOADERS  # noqa: E402
from gub2021.ln_federal import ln_por_seccion  # noqa: E402
from gub2021.municipios import cruzar  # noqa: E402
from gub2021.sinaloa_secciones import secciones_sinaloa  # noqa: E402

DATA = RAIZ / "data"
EXTRANJERO = "VOTO EN EL EXTRANJERO"

ESTADOS = [
    dict(key="BC", abbr="BC", cve=2, nombre="BAJA CALIFORNIA", anio="2021", ln="fuente"),
    dict(key="BCS", abbr="BCS", cve=3, nombre="BAJA CALIFORNIA SUR", anio="2021", ln="fed", slug="baja-california-sur",
         muni_secc=True, desglose="PARCIAL",
         aviso="El instituto electoral solo reporta PAN, PRI y PRD como coalicion (UNIDOS_CONTIGO); no hay votos por cada uno de esos partidos.",
         obs="El origen trae distrito local y seccion pero no municipio; el municipio se asigno por seccion (catalogo INE 2026, ver MUNICIPIO_FUENTE)."),
    dict(key="CAMP", abbr="CAMP", cve=4, nombre="CAMPECHE", anio="2021", ln="fuente", nivel="DISTRITO LOCAL -> MUNICIPIO",
         por_distrito=True, extras=["ASIGNACION_MUNICIPIO"],
         obs="El origen es por distrito local (resultados conforme al JRC SUP-JRC-128/2021). Se reparte a municipios con las secciones de cada distrito (cartel de distritacion IEEC, leido por OCR) ponderadas por lista nominal 2026; los distritos de un solo municipio son exactos, los mixtos son estimados (ver ASIGNACION_MUNICIPIO)."),
    dict(key="CHIH", abbr="CHIH", cve=8, nombre="CHIHUAHUA", anio="2021", ln="fed", slug="chihuahua",
         alias={"ROSARIO": "VALLEROSARIO"}),
    dict(key="COL", abbr="COL", cve=6, nombre="COLIMA", anio="2021", ln="fuente", nivel="MUNICIPIO", desglose="PARCIAL",
         aviso="El instituto electoral no publica MORENA por separado: reporta MORENA_PNA (MORENA con Nueva Alianza) y los votos de combinaciones de coalicion.",
         obs="El origen solo trae resultados por municipio (sin seccion) y solo coaliciones; no se encontro desglose por partido."),
    dict(key="GRO", abbr="GRO", cve=12, nombre="GUERRERO", anio="2021", ln="fuente", muni_secc=True,
         obs="PROCODE IEPC Guerrero, corte 18-jul-2021 (5,008 de 5,013 actas) + voto en el extranjero del JSON del sitio. Municipio asignado por seccion."),
    dict(key="MICH", abbr="MICH", cve=16, nombre="MICHOACAN", anio="2021", ln="fed",
         obs="La lista nominal del origen (3,808,490) esta inflada ~8% frente a la del computo federal (3,520,473); se uso la del computo federal por seccion."),
    dict(key="NAY", abbr="NAY", cve=18, nombre="NAYARIT", anio="2021", ln="fuente",
         obs="Nayarit.xlsx (computo con partidos individuales y lista nominal). La Yesca no celebro eleccion."),
    dict(key="NL", abbr="NL", cve=19, nombre="NUEVO LEON", anio="2021", ln="src_mun", slug="nuevo-leon",
         obs="Las filas 'ACTA MAC' (Consejo CEE) vienen con seccion 0 y se conservan por municipio."),
    dict(key="SLP", abbr="SLP", cve=24, nombre="SAN LUIS POTOSI", anio="2021", ln="fed", slug="san-luis-potosi",
         obs="La fila de totales del origen (1,205,480 votos) no coincide con la suma de sus casillas (1,215,356); se usa la suma de casillas."),
    dict(key="SIN", abbr="SIN", cve=25, nombre="SINALOA", anio="2021", ln="src_mun", slug="sinaloa",
         nivel="DISTRITO LOCAL -> MUNICIPIO", por_distrito=True, extras=["ASIGNACION_MUNICIPIO"],
         obs="El origen es un cuadro por distrito local (PDF escaneado, transcrito a mano y validado contra su fila de totales). Se reparte a municipios con el listado de secciones por distrito del IEES (Secciones.pdf, distritacion 2016-2022) ponderado por lista nominal federal 2021; los distritos de un solo municipio son exactos, los mixtos son estimados (ver ASIGNACION_MUNICIPIO). Lista nominal: SRC 2021 por municipio repartida entre las piezas por votos."),
    dict(key="SON", abbr="SON", cve=26, nombre="SONORA", anio="2021", ln="fuente", desglose="SOLO_COALICIONES",
         aviso="El instituto electoral solo publica el voto por coalicion (PAN_PRI_PRD y PT_PVEM_MORENA_NAS), no por partido individual.",
         obs="GubernaturaSonora.xlsx coincide con el computo oficial (Durazo 496,651; Gandara 339,139; 3,748 actas). Sonora.xlsx es de ayuntamientos y no se uso."),
    dict(key="TLAX", abbr="TLAX", cve=29, nombre="TLAXCALA", anio="2021", ln="fuente", nivel="MUNICIPIO",
         obs="El origen solo trae resultados por municipio (sin seccion)."),
    dict(key="ZAC", abbr="ZAC", cve=32, nombre="ZACATECAS", anio="2021", ln="fed",
         obs="La lista nominal del origen (1,358,765) esta inflada ~12% frente a la del computo federal (1,211,040); se uso la del computo federal por seccion."),
    dict(key="AGS", abbr="AGS", cve=1, nombre="AGUASCALIENTES", anio="2022", ln="src_mun", slug="aguascalientes", muni_secc=True,
         obs="Eleccion de 2022 (no 2021). El origen (18 distritos locales) no trae municipio ni lista nominal; municipio por seccion (catalogo INE 2026); el estado se identifico por su contenido."),
    dict(key="QROO", abbr="QROO", cve=23, nombre="QUINTANA ROO", anio="2022", ln="fuente", muni_secc=True,
         obs="Eleccion de 2022 (COMP_2022.zip). Municipio asignado por seccion (catalogo INE 2026)."),
]
LOADERS = {**LOADERS, "SIN": cargar_sinaloa, "AGS": cargar_ags, "NAY": cargar_nayarit_pp, "GRO": cargar_guerrero,
           "QROO": cargar_qroo, "CAMP": cargar_campeche}
COLS_FIJAS = ["MUNICIPIO", "DL", "SECCION", "LISTA_NOMINAL", "CNR", "NULOS", "TOTAL"]

# Nombres del origen -> nombre usado por los GeoJSON del Demo (js/hist2021.js cruza por slugify(nombre)).
RENOMBRES = {
    "NAY": {"BUCERIAS": "BAHIA DE BANDERAS", "VALLE DE BANDERAS": "BAHIA DE BANDERAS", "JESUS MARIA": "DEL NAYAR"},  # cabecera -> municipio
    "BC": {"ROSARITO": "PLAYAS DE ROSARITO"},
    "CHIH": {"ROSARIO": "VALLE DEL ROSARIO"},
    "COL": {"CUAUTHEMOC": "CUAUHTEMOC"},
    "SLP": {"AHUALULCO": "AHUALULCO DEL SONIDO 13"},
    "TLAX": {"MUA\u2018OZ DE DOMINGO ARENAS": "MUNOZ DE DOMINGO ARENAS", "ESPAA\u2018ITA": "ESPANITA",
             "ZITLALTEPEC DE TRINIDAD SANCHEZ SANTOS": "ZILTLALTEPEC DE TRINIDAD SANCHEZ SANTOS"},
}


def nombre_demo(key: str, nombre: str) -> str:
    if key == "NL":
        nombre = nombre.replace("GRAL. ", "GENERAL ").replace("DR. ", "DOCTOR ")
    return RENOMBRES.get(key, {}).get(nombre, nombre)


def reparto_entero(total: int, pesos: np.ndarray) -> np.ndarray:
    """Reparte ``total`` en enteros proporcionales a ``pesos`` (mayor residuo; la suma es exacta)."""
    pesos = np.asarray(pesos, dtype=float)
    if total <= 0 or len(pesos) == 0:
        return np.zeros(len(pesos), dtype=int)
    if pesos.sum() <= 0:
        pesos = np.ones(len(pesos))
    cuota = total * pesos / pesos.sum()
    base = np.floor(cuota).astype(int)
    resto = int(total - base.sum())
    if resto:
        orden = np.argsort(-(cuota - base), kind="stable")[:resto]
        base[orden] += 1
    return base


# --------------------------------------------------------------------------- municipio por sección / distrito
def asignar_municipio_por_seccion(df: pd.DataFrame, cfg: dict, log: list[str]) -> pd.DataFrame:
    cat = catalogo(cfg["cve"])
    df = df.copy()
    sec = df["SECCION"].astype(float)
    mun = sec.map(lambda s: cat[int(s)][0] if s > 0 and int(s) in cat else None)
    fuente = pd.Series(np.where(mun.notna(), "CATALOGO_INE_2026", ""), index=df.index)
    ext = df["MUNICIPIO"].eq(EXTRANJERO) | (sec == 0)
    mun[ext] = EXTRANJERO
    fuente[ext] = "ORIGEN"

    # Secciones que ya no existen en el catálogo 2026: municipio de la sección vecina (mismo distrito).
    faltan = df.index[mun.isna()]
    if len(faltan):
        conocidas = pd.DataFrame({"DL": df["DL"], "SECCION": sec, "MUN": mun})[mun.notna() & ~ext].drop_duplicates(["DL", "SECCION"])
        votos = df.loc[faltan, [c for c in df.columns if c not in COLS_FIJAS]].sum(axis=1)
        for i in faltan:
            pool = conocidas[conocidas["DL"] == df.at[i, "DL"]]
            if pool.empty:
                pool = conocidas
            j = (pool["SECCION"] - sec[i]).abs().idxmin()
            mun[i] = conocidas.at[j, "MUN"] if j in conocidas.index else pool.loc[j, "MUN"]
            fuente[i] = "INFERIDA_SECCION_VECINA"
        log.append(f"{cfg['key']}: {len(set(sec[faltan]))} secciones fuera del catalogo 2026 ({int(votos.sum()):,} votos) "
                   f"-> municipio de la seccion vecina del mismo distrito")
    df["MUNICIPIO"] = mun
    df["MUNICIPIO_FUENTE"] = fuente
    return df


def secciones_por_distrito(key: str) -> tuple[dict[int, list[tuple[str, float]]], str]:
    """{distrito: [(municipio, peso de la sección)]} y etiqueta del método de ponderación."""
    if key == "CAMP":  # cartel de distritación del IEEC (OCR) x lista nominal 2026 del INE
        secciones = {int(k): v for k, v in json.loads(Path(__file__).with_name("campeche_secciones_por_distrito.json")
                                                      .read_text(encoding="utf-8")).items()}
        cat = catalogo(4)
        return ({dl: [(cat[s][0], float(cat[s][1])) for s in lista if s in cat] for dl, lista in secciones.items()},
                "ESTIMADA_POR_SECCIONES_LN2026")
    if key == "SIN":  # Secciones.pdf del IEES (distritación 2016-2022) x lista nominal federal 2021
        fed = ln_por_seccion(25)
        out: dict[int, list[tuple[str, float]]] = {}
        for f in secciones_sinaloa():
            out.setdefault(f["dl"], []).append((f["municipio"], float(fed.get(f["seccion"], 0))))
        return out, "ESTIMADA_POR_SECCIONES_LN2021"
    raise KeyError(key)


def expandir_distritos(df: pd.DataFrame, key: str, log: list[str]) -> pd.DataFrame:
    """Reparte cada distrito local entre sus municipios, con las secciones del distrito ponderadas por lista nominal."""
    secciones, etiqueta = secciones_por_distrito(key)
    cols = [c for c in df.columns if c not in ["MUNICIPIO", "DL", "SECCION", "TOTAL"]]
    piezas = []
    for _, fila in df.iterrows():
        dl = int(fila["DL"])
        peso: dict[str, float] = {}
        cuenta: dict[str, int] = {}
        for m, w_ in secciones[dl]:
            peso[m] = peso.get(m, 0) + w_
            cuenta[m] = cuenta.get(m, 0) + 1
        if sum(peso.values()) <= 0:
            peso = {m: float(n) for m, n in cuenta.items()}
        munis = sorted(peso, key=lambda m: -peso[m])
        w = np.array([peso[m] for m in munis], dtype=float)
        trozos = {c: (reparto_entero(int(fila[c]), w) if pd.notna(fila[c]) else np.full(len(w), np.nan)) for c in cols}
        for k, m in enumerate(munis):
            p = {c: trozos[c][k] for c in cols}
            p.update(MUNICIPIO=m, DL=dl, SECCION=None, TOTAL=np.nan,
                     ASIGNACION_MUNICIPIO="EXACTA" if len(munis) == 1 else etiqueta)
            piezas.append(p)
        if len(munis) > 1:
            log.append(f"{key}: distrito {dl} repartido entre {', '.join(f'{m} ({peso[m] / sum(w):.0%})' for m in munis)}")
    return pd.DataFrame(piezas)


# --------------------------------------------------------------------------- agrupar + lista nominal
def agrupar(df: pd.DataFrame, partidos: list[str], claves: list[str], extras: list[str]) -> pd.DataFrame:
    df = df.copy()
    df["SECCION"] = df["SECCION"].astype(float)
    df["MUNICIPIO"] = df["MUNICIPIO"].fillna("")
    agg = {c: "sum" for c in partidos + ["CNR", "NULOS"]}
    agg["LISTA_NOMINAL"] = lambda s: s.sum(min_count=1)  # NaN si ninguna fila trae lista nominal
    for c in ["DL", "SECCION"] + extras:
        if c not in claves:
            agg[c] = "first"
    return df.groupby(claves, as_index=False, sort=False, dropna=False).agg(agg)


def completar_lista_nominal(df: pd.DataFrame, cfg: dict, partidos: list[str], log: list[str]):
    votos = df[partidos].sum(axis=1) + df["CNR"] + df["NULOS"]
    df = df.copy()
    ext = df["MUNICIPIO"].eq(EXTRANJERO)
    modo = cfg["ln"]

    if modo == "fuente":
        df["LISTA_NOMINAL"] = df["LISTA_NOMINAL"].fillna(0)
        return df, "ORIGEN"

    if modo == "fed":  # lista nominal real por sección (diputaciones federales 2021, misma lista que la elección local)
        fed = ln_por_seccion(cfg["cve"])
        sec = df["SECCION"].fillna(0).astype(int)
        df["LISTA_NOMINAL"] = sec.map(lambda s: fed.get(s, 0) if s > 0 else 0)
        cubierta = int(df["LISTA_NOMINAL"].sum())
        log.append(f"{cfg['key']}: lista nominal por seccion del computo federal; cubre {cubierta:,} de {sum(fed.values()):,} "
                   f"({cubierta / sum(fed.values()):.2%}); secciones del origen sin dato: {int(((sec > 0) & ~sec.isin(fed)).sum())}")
        return df, "INE_DIPUTACIONES_FED_2021"

    ln = pd.Series(0, index=df.index, dtype=int)
    if modo == "src_mun":
        nombres = sorted(n for n in df["MUNICIPIO"].unique() if n != EXTRANJERO)
        mapa, sin, aprox, no_usados = cruzar(nombres, cfg["slug"], cfg["anio"], cfg.get("alias"))
        if sin:
            raise RuntimeError(f"{cfg['key']}: municipios sin lista nominal SRC: {sin}")
        if aprox:
            log.append(f"{cfg['key']}: cruce aproximado de nombres {aprox}")
        if no_usados:
            log.append(f"{cfg['key']}: municipios SRC sin filas en el origen: {no_usados}")
        for nombre, total in mapa.items():
            idx = df.index[df["MUNICIPIO"].eq(nombre)]
            ln.loc[idx] = reparto_entero(int(total), votos.loc[idx].to_numpy())
        fuente = "SRC_MUNICIPAL_PRORRATEADA"
    else:  # src_est
        datos = json.loads(Path(__file__).with_name("src_ln.json").read_text(encoding="utf-8"))
        total = int(datos["_estatal"][cfg["slug"]][cfg["anio"]])
        idx = df.index[~ext]
        ln.loc[idx] = reparto_entero(total, votos.loc[idx].to_numpy())
        fuente = "SRC_ESTATAL_PRORRATEADA"
    df["LISTA_NOMINAL"] = ln
    return df, fuente


def procesar(cfg: dict, log: list[str]):
    crudo = LOADERS[cfg["key"]]()
    partidos = [c for c in crudo.columns if c not in COLS_FIJAS]
    nivel = cfg.get("nivel", "SECCION")
    extras = list(cfg.get("extras", []))

    if cfg.get("muni_secc"):
        crudo = asignar_municipio_por_seccion(crudo, cfg, log)
        extras.append("MUNICIPIO_FUENTE")
    if cfg.get("por_distrito"):
        crudo = expandir_distritos(crudo, cfg["key"], log)

    municipal = bool(crudo["SECCION"].isna().all())
    claves = (["MUNICIPIO", "DL"] if cfg.get("por_distrito") else ["MUNICIPIO"]) if municipal else ["MUNICIPIO", "SECCION"]
    df = agrupar(crudo, partidos, claves, extras)
    df, fuente_ln = completar_lista_nominal(df, cfg, partidos, log)
    df["MUNICIPIO"] = df["MUNICIPIO"].map(lambda n: nombre_demo(cfg["key"], n))
    df["VOTOS_EMITIDOS"] = (df[partidos].sum(axis=1) + df["CNR"] + df["NULOS"]).round().astype(int)
    df["_ord"] = df["MUNICIPIO"].ne(EXTRANJERO)
    df = df.sort_values(["_ord", "MUNICIPIO", "DL", "SECCION"], na_position="last", kind="stable").reset_index(drop=True)

    def entero_o_vacio(v):
        return "" if v is None or pd.isna(v) else int(v)

    base = pd.DataFrame({
        "#": range(1, len(df) + 1),
        "CVE_ENTIDAD": cfg["cve"],
        "ENTIDAD": cfg["nombre"],
        "MUNICIPIO": df["MUNICIPIO"],
        "DF": "",
        "DL": df["DL"].map(entero_o_vacio),
        "SECCION": df["SECCION"].map(entero_o_vacio),
        "LISTA_NOMINAL": df["LISTA_NOMINAL"].round().astype(int),
        "VOTOS_EMITIDOS": df["VOTOS_EMITIDOS"],
    })
    for p in partidos:
        base[p] = df[p].round().astype(int)
    base["CNR"] = df["CNR"].round().astype(int)
    base["NULOS"] = df["NULOS"].round().astype(int)

    # Mismo constructor que la app
    perfil = crear_perfil_generico(f"GUB_{cfg['abbr']}_{cfg['anio']}.csv", anio=cfg["anio"], eleccion="gubernatura",
                                   entidad=(cfg["cve"], cfg["nombre"]))
    config = config_desde_perfil_simple(perfil, partidos, incluir_municipio=True)
    final = construir_dataframe_completo(base, config)
    if fuente_ln == "ORIGEN":
        final["LN_FUENTE"] = np.where(base["LISTA_NOMINAL"].to_numpy() > 0, "ORIGEN", "SIN_DATO")
    else:
        final["LN_FUENTE"] = np.where(base["MUNICIPIO"].eq(EXTRANJERO).to_numpy(), "SIN_DATO", fuente_ln)
    final["NIVEL"] = nivel
    final["DESGLOSE_PARTIDOS"] = cfg.get("desglose", "COMPLETO")
    for c in extras:
        final[c] = df[c].to_numpy()

    ln_total = int(base["LISTA_NOMINAL"].sum())
    votos_tot = int(base["VOTOS_EMITIDOS"].sum())
    valid = int((final["TOT_VOTOS"] == final["VOTOS_EMITIDOS"]).sum())
    sec = pd.to_numeric(base["SECCION"], errors="coerce")
    sin_muni = base["MUNICIPIO"].eq("") | base["MUNICIPIO"].str.startswith("DISTRITO")
    resumen = dict(
        entidad=cfg["nombre"], anio=cfg["anio"], archivo=f"SE_GUB_{cfg['abbr']}_{cfg['anio']}.csv", nivel=nivel,
        filas=len(final), municipios=int(base.loc[~sin_muni & base["MUNICIPIO"].ne(EXTRANJERO), "MUNICIPIO"].nunique()),
        secciones=int(sec[sec > 0].nunique()), partidos_columnas=len(partidos), votos_emitidos=votos_tot,
        lista_nominal=ln_total, participacion=round(votos_tot / ln_total, 4) if ln_total else None,
        fuente_lista_nominal=fuente_ln, filas_validacion_ok=f"{valid}/{len(final)}", observaciones=cfg.get("obs", ""),
        desglose_partidos=cfg.get("desglose", "COMPLETO"), aviso_desglose=cfg.get("aviso", ""),
        entidad_cve=cfg["cve"], municipio_metodo=("REPARTO_DISTRITO" if cfg.get("por_distrito") else
                                                  "CATALOGO_SECCION" if cfg.get("muni_secc") else
                                                  "NINGUNO" if bool(sin_muni.all()) else "ORIGEN"),
        partidos_lista=[p for p in partidos],
    )
    return final, resumen


def main() -> None:
    DATA.mkdir(exist_ok=True)
    log: list[str] = []
    resumenes = []
    for cfg in ESTADOS:
        final, res = procesar(cfg, log)
        final.to_csv(DATA / res["archivo"], index=False, encoding="utf-8-sig")
        resumenes.append(res)
        print(f"{res['archivo']:<22} filas={res['filas']:>5} mun={res['municipios']:>3} secc={res['secciones']:>5} "
              f"votos={res['votos_emitidos']:>9,} LN={res['lista_nominal']:>9,} part={res['participacion']} "
              f"[{res['fuente_lista_nominal']}] valid={res['filas_validacion_ok']}")
    indice = pd.DataFrame(resumenes).drop(columns=["partidos_lista"])
    indice.to_csv(DATA / "SE_GUB_indice.csv", index=False, encoding="utf-8-sig")
    escribir_manifiesto(resumenes)
    for linea in log:
        print("AVISO", linea)


def escribir_manifiesto(resumenes: list[dict]) -> None:
    """data/gubernaturas_manifest.json: lo que el Demo necesita para decidir qué archivo cargar y qué avisos mostrar."""
    manifiesto: dict[str, dict] = {}
    # Querétaro: base original (formato simple) que ya usa el Demo
    qro_cols = (DATA / "Gubernatura_2021.csv").read_text(encoding="utf-8-sig").splitlines()[0].split(",")
    ini = qro_cols.index("3RO_VOTOS") + 1
    manifiesto["22"] = dict(
        entidad="QUERETARO", anio=2021, archivo="Gubernatura_2021.csv", nivel="SECCION", tiene_municipio=True,
        municipio_metodo="ORIGEN", desglose_partidos="COMPLETO", aviso_desglose="", lista_nominal_estimada=False,
        fuente_lista_nominal="ORIGEN", partidos=qro_cols[ini:qro_cols.index("NULOS")], observaciones="")
    for r in resumenes:
        manifiesto[str(r["entidad_cve"])] = dict(
            entidad=r["entidad"], anio=int(r["anio"]), archivo=r["archivo"], nivel=r["nivel"],
            tiene_municipio=r["municipio_metodo"] != "NINGUNO", municipio_metodo=r["municipio_metodo"],
            desglose_partidos=r["desglose_partidos"], aviso_desglose=r["aviso_desglose"],
            lista_nominal_estimada=r["fuente_lista_nominal"].startswith("SRC"), fuente_lista_nominal=r["fuente_lista_nominal"],
            partidos=r["partidos_lista"], observaciones=r["observaciones"])
    (DATA / "gubernaturas_manifest.json").write_text(
        json.dumps(dict(version=1, generado_por="gub2021/build.py", entidades=manifiesto), ensure_ascii=False, indent=1),
        encoding="utf-8")


if __name__ == "__main__":
    main()
