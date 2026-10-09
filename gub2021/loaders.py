"""Lectores de los cómputos de gubernatura 2021 (un formato distinto por OPLE).

Cada ``cargar_<estado>`` devuelve un DataFrame "plano" con las columnas:

    MUNICIPIO, DL, SECCION, LISTA_NOMINAL, <partidos...>, CNR, NULOS, TOTAL

* ``SECCION`` es entero (0 = voto en el extranjero / sin sección) o ``None`` cuando
  la fuente sólo trae resultados municipales.
* ``LISTA_NOMINAL`` es ``NaN`` cuando el origen no la trae (se completa después
  con la lista nominal 2021 estatal de SRC).
* ``TOTAL`` es el total de votos emitidos tal como lo reporta la fuente.
"""
from __future__ import annotations

import re
import unicodedata
import warnings
import zipfile
from pathlib import Path

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")

BASE = Path(r"G:\Metrix\Gubernaturas")

ROMANOS = {"I": 1, "II": 2, "III": 3, "IV": 4, "V": 5, "VI": 6, "VII": 7, "VIII": 8, "IX": 9, "X": 10,
           "XI": 11, "XII": 12, "XIII": 13, "XIV": 14, "XV": 15, "XVI": 16, "XVII": 17, "XVIII": 18,
           "XIX": 19, "XX": 20, "XXI": 21, "XXII": 22, "XXIII": 23, "XXIV": 24, "XXV": 25}


def sin_acentos(valor: object) -> str:
    texto = "" if valor is None or (isinstance(valor, float) and np.isnan(valor)) else str(valor)
    texto = unicodedata.normalize("NFKD", texto)
    return "".join(c for c in texto if not unicodedata.combining(c))


def limpia_muni(valor: object) -> str:
    """MAYÚSCULAS sin acentos, sin comas (el CSV del Demo se separa con split(',')) y sin espacios dobles."""
    texto = sin_acentos(valor).upper().replace(",", " ").replace("\r", " ").replace("\n", " ")
    return re.sub(r"\s+", " ", texto).strip()


def norm_partido(nombre: object) -> str:
    texto = sin_acentos(nombre).upper().strip()
    texto = re.sub(r"[\s\-\+,\.]+", "_", texto)
    texto = re.sub(r"_+", "_", texto).strip("_")
    return "FxM" if texto in {"FXM", "FM", "FXMA"} else texto


def num(serie: pd.Series) -> pd.Series:
    if pd.api.types.is_numeric_dtype(serie):
        return pd.to_numeric(serie, errors="coerce")
    texto = serie.astype("string").str.strip().str.replace(",", "", regex=False)
    texto = texto.mask(texto.isin(["", "-", "–", "N", "NA", "N/A"]))
    return pd.to_numeric(texto, errors="coerce")


def _arma(df: pd.DataFrame, partidos: list[str]) -> pd.DataFrame:
    """Orden estándar de columnas; agrupa columnas de partido repetidas."""
    base = ["MUNICIPIO", "DL", "SECCION", "LISTA_NOMINAL"]
    cols = base + partidos + ["CNR", "NULOS", "TOTAL"]
    df = df.copy()
    df[partidos + ["CNR", "NULOS"]] = df[partidos + ["CNR", "NULOS"]].apply(pd.to_numeric, errors="coerce").fillna(0)
    return df[cols]


def _par(df: pd.DataFrame, cols: list[str], renombres: dict[str, str] | None = None):
    """Devuelve (df_partidos, nombres) con nombres normalizados."""
    renombres = renombres or {}
    nombres = [renombres.get(str(c).strip(), norm_partido(c)) for c in cols]
    out = df[cols].apply(num).fillna(0)
    out.columns = nombres
    out = out.T.groupby(level=0, sort=False).sum().T  # sumar duplicados
    return out, list(out.columns)


# --------------------------------------------------------------------------- Baja California
def cargar_bc() -> pd.DataFrame:
    df = pd.read_excel(BASE / "GubernaturaBC.xls", header=5)
    df = df[df["MUNICIPIO"].astype(str).str.upper().ne("TOTALES") & df["SECCION"].notna()].copy()
    cols = list(df.columns[4:23])
    p, nombres = _par(df, cols)
    out = pd.concat([df[["MUNICIPIO"]], p], axis=1)
    out["MUNICIPIO"] = df["MUNICIPIO"].map(limpia_muni)
    out["DL"] = df["DISTRITO"].astype(str).str.strip().map(ROMANOS)
    out["SECCION"] = num(df["SECCION"]).astype(int)
    out["LISTA_NOMINAL"] = num(df["LISTA NOMINAL"])
    out["CNR"] = num(df["NO REGISTRADOS"]).fillna(0)
    out["NULOS"] = num(df["VOTO NULO"]).fillna(0)
    out["TOTAL"] = num(df["TOTAL VOTOS"])
    partidos = [n for n in nombres if n not in {"NO_REGISTRADOS"}]
    return _arma(out, partidos)


# --------------------------------------------------------------------------- Baja California Sur
BCS_PARTIDOS = ["UNIDOS_CONTIGO", "PT", "PVEM", "MC", "MORENA", "BCSC", "PNABCS", "PES", "RSP", "FxM",
                "RAMON_ALEJO_PARRA_OJEDA", "MORENA_PT"]


def cargar_bcs() -> pd.DataFrame:
    """16 archivos (uno por consejo distrital). Las columnas de partido vienen como logos en los encabezados,
    por eso se leen por posición (idéntica en los 16 archivos; ver README)."""
    filas = []
    with zipfile.ZipFile(BASE / "GUBERNATURA.zip") as z:
        for nombre in sorted(n for n in z.namelist() if n.lower().endswith(".xlsx")):
            dl = int(re.search(r"CDE(\d+)", nombre).group(1))
            with z.open(nombre) as fh:
                bruto = pd.read_excel(fh, header=None, dtype=object)
            sec = pd.to_numeric(bruto.iloc[:, 1], errors="coerce")
            datos = bruto[sec.notna()].copy()
            datos = datos.iloc[:, :18]
            datos.columns = ["DL_", "SECCION", "TIPO"] + BCS_PARTIDOS + ["CNR", "NULOS", "TOTAL"]
            datos["DL"] = dl
            filas.append(datos)
    df = pd.concat(filas, ignore_index=True)
    for c in BCS_PARTIDOS + ["CNR", "NULOS", "TOTAL", "SECCION"]:
        df[c] = pd.to_numeric(df[c], errors="coerce").fillna(0)
    df["SECCION"] = df["SECCION"].astype(int)
    df["MUNICIPIO"] = ""  # el archivo no trae municipio (sólo distrito local)
    df["LISTA_NOMINAL"] = np.nan
    return _arma(df, BCS_PARTIDOS)


# --------------------------------------------------------------------------- Chihuahua
def cargar_chihuahua() -> pd.DataFrame:
    df = pd.read_excel(BASE / "GubernaturaChihuahua.xlsx", header=0)
    df = df[df["Eleccion"].astype(str).str.upper().eq("GUBERNATURA")].copy()
    cols = list(df.columns[6:23])  # PAN ... CAND. NO REG ; NULOS al final
    cols_p = [c for c in df.columns[6:22]]
    p, nombres = _par(df, cols_p)
    out = pd.concat([p], axis=1)
    out["MUNICIPIO"] = df["Municipio"].map(limpia_muni).replace({"CONSEJO ESTATAL": "VOTO EN EL EXTRANJERO"})
    out["DL"] = num(df["Distrito"])
    out["SECCION"] = num(df["Seccion"]).fillna(0).astype(int)
    out["LISTA_NOMINAL"] = np.nan
    out["CNR"] = num(df["CAND. NO REG"]).fillna(0)
    out["NULOS"] = num(df["NULOS"]).fillna(0)
    out["TOTAL"] = np.nan
    return _arma(out, nombres)


# --------------------------------------------------------------------------- Colima (municipal)
def cargar_colima() -> pd.DataFrame:
    df = pd.read_csv(BASE / "GubernaturaColima.csv", encoding="utf-8-sig")
    cols = list(df.columns[6:19])  # PAN .. PRI_PRD
    p, nombres = _par(df, cols)
    out = p.copy()
    out["MUNICIPIO"] = df["MUNICIPIO"].astype(str).map(limpia_muni).replace({"0": "VOTO EN EL EXTRANJERO"})
    out["DL"] = np.nan
    out["SECCION"] = None
    out["LISTA_NOMINAL"] = num(df["LISTA_NOMINAL"])
    out["CNR"] = num(df["NUM_VOTOS_CAN_NREG"]).fillna(0)
    out["NULOS"] = num(df["NUM_VOTOS_NULOS"]).fillna(0)
    out["TOTAL"] = num(df["TOTAL_VOTOS"])
    return _arma(out, nombres)


# --------------------------------------------------------------------------- Michoacán
def cargar_michoacan() -> pd.DataFrame:
    df = pd.read_excel(BASE / "GubernaturaMichoacan.xlsx", sheet_name="Consulta")
    df = df[num(df["Sección"]).notna()].copy()
    cols = list(df.columns[7:22])  # PAN .. PRI-PRD
    p, nombres = _par(df, cols)
    out = p.copy()
    out["MUNICIPIO"] = df["Municipio"].map(limpia_muni)
    out["DL"] = num(df["Distrito"])
    out["SECCION"] = num(df["Sección"]).astype(int)
    out["LISTA_NOMINAL"] = num(df["Lista Nominal"])
    out["CNR"] = num(df["No registrados"]).fillna(0)
    out["NULOS"] = num(df["Nulos"]).fillna(0)
    out["TOTAL"] = np.nan
    return _arma(out, nombres)


# --------------------------------------------------------------------------- Nayarit (versión anterior)
# SUSTITUIDO en build.py por extras.cargar_nayarit_pp (Nayarit.xlsx trae partidos individuales y lista nominal).
# Se conserva porque sirvió para contrastar totales (476,188 votos).
NAYARIT_ESPECIAL = {"Concentrado"}


def cargar_nayarit() -> pd.DataFrame:
    xl = pd.ExcelFile(BASE / "GubernaturaNayaritE.xlsx")
    filas = []
    for hoja in xl.sheet_names:
        if hoja in NAYARIT_ESPECIAL:
            continue
        bruto = xl.parse(hoja, header=None, dtype=object)
        muni = next((str(v).strip() for v in bruto.iloc[:8, 2].tolist() if isinstance(v, str) and "\n" not in v and "Elecci" not in v), hoja)
        fila_enc = bruto.index[bruto.iloc[:, 0].astype(str).str.strip().eq("Sección")][0]
        enc = [str(x).strip() for x in bruto.iloc[fila_enc].tolist()]
        datos = bruto.iloc[fila_enc + 1:].copy()
        datos.columns = enc
        datos = datos[num(datos["Sección"]).notna()].copy()
        datos["MUNICIPIO"] = limpia_muni(muni)
        filas.append(datos)
    # El voto en el extranjero sólo aparece en la hoja "Concentrado" (sin sección).
    conc = xl.parse("Concentrado", header=None, dtype=object)
    f_enc = conc.index[conc.iloc[:, 0].astype(str).str.strip().eq("Municipio")][0]
    enc = [str(x).strip() for x in conc.iloc[f_enc].tolist()]
    ext = conc[conc.iloc[:, 0].astype(str).str.strip().str.lower().eq("voto en el extranjero")].copy()
    ext.columns = enc
    ext = ext.loc[:, [c for c in ext.columns if c and c != "nan"]]
    ext["Sección"] = 0
    ext["Casilla"] = "Extranjero"
    ext["MUNICIPIO"] = "VOTO EN EL EXTRANJERO"
    filas.append(ext)
    df = pd.concat(filas, ignore_index=True)
    cols = [c for c in df.columns if c not in {"Sección", "Casilla", "MUNICIPIO", "Candidaturas no registradas", "Votos nulos",
                                                 "Municipio", "Casillas Instaladas", "nan"}]
    p, nombres = _par(df, cols, {"PT-PVEM-MORENA-NAN": "PT_PVEM_MORENA_NAN"})
    out = p.copy()
    out["MUNICIPIO"] = df["MUNICIPIO"]
    out["DL"] = np.nan
    out["SECCION"] = num(df["Sección"]).astype(int)
    out["LISTA_NOMINAL"] = np.nan
    out["CNR"] = num(df["Candidaturas no registradas"]).fillna(0)
    out["NULOS"] = num(df["Votos nulos"]).fillna(0)
    out["TOTAL"] = np.nan
    return _arma(out, nombres)


# --------------------------------------------------------------------------- Nuevo León
def cargar_nl() -> pd.DataFrame:
    df = pd.read_excel(BASE / "GubernaturaNL.xlsx", header=1)
    df = df[num(df["Sección"]).notna()].copy()
    cols = list(df.columns[5:28])
    p, nombres = _par(df, cols, {"C_PRI_PRD": "PRI_PRD"})
    nombres = [re.sub(r"^C_", "", n) for n in nombres]
    p.columns = nombres
    out = p.copy()
    out["MUNICIPIO"] = df["Municipio"].map(limpia_muni)
    out["DL"] = num(df["Distrito"])
    out["SECCION"] = num(df["Sección"]).astype(int)
    out["LISTA_NOMINAL"] = np.nan
    out["CNR"] = num(df["NO_REGISTRADOS"]).fillna(0)
    out["NULOS"] = num(df["NULOS"]).fillna(0)
    out["TOTAL"] = num(df["Total"])
    return _arma(out, nombres)


# --------------------------------------------------------------------------- San Luis Potosí
def cargar_slp() -> pd.DataFrame:
    df = pd.read_excel(BASE / "GubernaturaSLP.xlsx", sheet_name="TODOS", dtype=object)
    es_ext = df["SECCIÓN"].astype(str).str.upper().str.startswith("VOTOMEX")
    df.loc[es_ext, ["SECCIÓN", "MUNICIPIO"]] = [0, "VOTO EN EL EXTRANJERO"]
    df = df[num(df["SECCIÓN"]).notna()].copy()
    cols = list(df.columns[6:32])  # PAN .. PT,PVEM
    cols = [c for c in cols if c not in {"CNR", "VTN", "TOTAL"}]
    p, nombres = _par(df, cols, {"PNA SAN LUIS": "PNA", "PMC": "MC", "PCP": "PCP"})
    out = p.copy()
    out["MUNICIPIO"] = df["MUNICIPIO"].map(limpia_muni)
    out["DL"] = num(df["DISTRITO"])
    out["SECCION"] = num(df["SECCIÓN"]).astype(int)
    out["LISTA_NOMINAL"] = np.nan
    out["CNR"] = num(df["CNR"]).fillna(0)
    out["NULOS"] = num(df["VTN"]).fillna(0)
    out["TOTAL"] = num(df["TOTAL"])
    return _arma(out, nombres)


# --------------------------------------------------------------------------- Sonora
SONORA_RENOMBRES = {
    "VA X SONORA": "PAN_PRI_PRD",
    "JUNTOS HAREMOS HISTORIA EN SONORA": "PT_PVEM_MORENA_NAS",
    "MOVIMIENTO CIUDADANO": "MC",
    "PARTIDO ENCUENTRO SOLIDARIO": "PES",
    "REDES SOCIALES PROGRESISTAS": "RSP",
    "FUERZA POR MEXICO": "FxM",
}


def cargar_sonora() -> pd.DataFrame:
    df = pd.read_excel(BASE / "GubernaturaSonora.xlsx", header=1, dtype=object)
    df = df[num(df["id_seccion"]).notna()].copy()
    cols = list(df.columns[8:14])
    p, nombres = _par(df, cols, {k.strip(): v for k, v in SONORA_RENOMBRES.items()})
    out = p.copy()
    out["MUNICIPIO"] = df["municipio"].map(limpia_muni)
    out["DL"] = num(df["id_distrito_local"])
    out["SECCION"] = num(df["id_seccion"]).astype(int)
    out["LISTA_NOMINAL"] = num(df["lista_nominal"])
    out["CNR"] = num(df["num_votos_can_nreg"]).fillna(0)
    out["NULOS"] = num(df["num_votos_nulos"]).fillna(0)
    out["TOTAL"] = num(df["total_votos"])
    return _arma(out, nombres)


# --------------------------------------------------------------------------- Tlaxcala (municipal)
def cargar_tlaxcala() -> pd.DataFrame:
    df = pd.read_excel(BASE / "GubernaturaTlaxcala.xlsx", header=0)
    df = df[df["MUNICIPIO"].notna()].copy()
    cols = list(df.columns[6:df.columns.get_loc("NUM_VOTOS_VALIDOS")])
    p, nombres = _par(df, cols)
    out = p.copy()
    out["MUNICIPIO"] = df["MUNICIPIO"].map(limpia_muni)
    out["DL"] = np.nan
    out["SECCION"] = None
    out["LISTA_NOMINAL"] = num(df["LISTA_NOMINAL"])
    out["CNR"] = num(df["NUM_VOTOS_CAN_NREG"]).fillna(0)
    out["NULOS"] = num(df["NUM_VOTOS_NULOS"]).fillna(0)
    out["TOTAL"] = num(df["TOTAL_VOTOS"])
    return _arma(out, nombres)


# --------------------------------------------------------------------------- Zacatecas
def cargar_zacatecas() -> pd.DataFrame:
    df = pd.read_excel(BASE / "GubernaturaZacatecas.xlsx", sheet_name=0, header=1, dtype=object)
    df = df[num(df["SECCION"]).notna()].copy()
    # La columna sin encabezado entre MC y MORENA es Nueva Alianza Zacatecas (NAZ), como en las coaliciones.
    df.columns = ["NAZ" if str(c).startswith("Unnamed") or str(c) == "nan" else c for c in df.columns]
    ini = df.columns.get_loc("PAN")
    fin = df.columns.get_loc("NUM_BOLETAS_SOBRANTES")
    cols = [c for c in df.columns[ini:fin]]
    p, nombres = _par(df, cols, {"NA": "NAZ"})
    out = p.copy()
    out["MUNICIPIO"] = df["MUNICIPIO_LOCAL"].map(limpia_muni).replace({"VOTOMEX": "VOTO EN EL EXTRANJERO"})
    out["DL"] = num(df["ID_DISTRITO_LOCAL"])
    out["SECCION"] = num(df["SECCION"]).astype(int)
    out["LISTA_NOMINAL"] = num(df["LISTA_NOMINAL_CASILLA"])
    out["CNR"] = num(df["NO_REGISTRADOS"]).fillna(0)
    out["NULOS"] = num(df["NUM_VOTOS_NULOS"]).fillna(0)
    out["TOTAL"] = num(df["TOTAL_VOTOS"])
    return _arma(out, nombres)


LOADERS = {
    "BC": cargar_bc, "BCS": cargar_bcs, "CHIH": cargar_chihuahua, "COL": cargar_colima, "MICH": cargar_michoacan,
    "NAY": cargar_nayarit, "NL": cargar_nl, "SLP": cargar_slp, "SON": cargar_sonora, "TLAX": cargar_tlaxcala,
    "ZAC": cargar_zacatecas,
}
