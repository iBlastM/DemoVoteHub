"""Cargas adicionales: Aguascalientes 2022 (zip de distritos) y Sinaloa 2021 (resumen por distrito, imagen PDF)."""
from __future__ import annotations

import re
import zipfile

import numpy as np
import pandas as pd

from .loaders import BASE, _arma, _par, limpia_muni, norm_partido, num


def cargar_ags() -> pd.DataFrame:
    """Aguascalientes, gubernatura 2022 (18 distritos locales, una hoja por distrito, 'Casillas' = '<sección> <tipo>')."""
    filas = []
    with zipfile.ZipFile(BASE / "compilado_de__distritos_2122.zip") as z:
        for nombre in z.namelist():
            if not nombre.lower().endswith(".xlsx"):
                continue
            dl = int(re.search(r"DISTRITO (\d+)", nombre).group(1))
            bruto = pd.read_excel(z.open(nombre), header=None, dtype=object)
            hr = bruto.index[bruto.iloc[:, 0].astype(str).str.strip().eq("Casillas")][0]
            datos = bruto.iloc[hr + 1:].copy()
            datos.columns = [str(x).strip() for x in bruto.iloc[hr].tolist()]
            datos = datos[datos["Casillas"].astype(str).str.match(r"^\d+\s")].copy()
            datos["SECCION"] = datos["Casillas"].astype(str).str.split().str[0].astype(int)
            datos["DL"] = dl
            filas.append(datos)
    df = pd.concat(filas, ignore_index=True)
    # SUM_CO_1 / SUM_CO_2 son subtotales de coaliciones y DIFERENCIA es un dato de control: no son votos.
    cols = ["PAN", "PRI", "PRD", "PVEM", "PT", "MC", "MORENA", "FXMA", "PAN-PRI-PRD", "PAN-PRI", "PAN-PRD", "PRI-PRD", "PVEM-PT"]
    p, nombres = _par(df, cols)
    out = p.copy()
    out["MUNICIPIO"] = ""
    out["DL"] = df["DL"]
    out["SECCION"] = df["SECCION"]
    out["LISTA_NOMINAL"] = np.nan
    out["CNR"] = num(df["NUM_VOTOS_CAN_NREG"]).fillna(0)
    out["NULOS"] = num(df["NUM_VOTOS_NULOS"]).fillna(0)
    out["TOTAL"] = num(df["TOTAL"])
    return _arma(out, nombres)


# Transcripción del cuadro "Resultados electorales" (pág. 243, PDF escaneado y girado 90°) de Sinaloa 2021.
# Columnas: distrito, cabecera, PAN, PRI, PRD, PT, PVEM, MC, PAS (Partido Sinaloense), MORENA, PES, RSP, FxM, CNR, NULOS, TOTAL
_SINALOA = """
1|EL FUERTE|3685|8771|3167|213|4239|2020|2964|26793|265|509|472|6|1584|54688
2|LOS MOCHIS|4486|11953|703|1384|193|969|3294|20390|186|277|492|28|904|45259
3|LOS MOCHIS|1723|9598|522|1473|162|882|2662|22423|230|357|659|33|1258|41982
4|LOS MOCHIS|4216|11778|557|751|172|728|2561|19727|134|311|480|18|1378|42811
5|LOS MOCHIS|6436|8888|772|3417|497|2384|1991|17432|403|579|1006|31|1081|44917
6|SINALOA|1561|13542|482|684|153|533|4049|16056|404|437|161|11|1199|39272
7|GUASAVE|3922|12209|629|99|99|531|2753|22557|386|258|194|18|827|44482
8|GUASAVE|3532|10000|593|129|91|466|2568|21555|288|327|136|9|775|40469
9|GUAMUCHIL|2653|14666|859|210|289|608|7739|32520|214|626|424|6|1069|61883
10|MOCORITO|1372|13274|2038|683|198|1745|5579|21163|513|377|322|8|1423|48695
11|NAVOLATO|1987|8958|259|1904|305|1746|2531|18846|370|372|241|4|851|38374
12|CULIACAN|4878|12710|571|219|234|1734|4328|28532|503|390|861|30|880|55870
13|CULIACAN|4993|12112|556|237|241|1356|3556|22970|439|393|556|45|975|48429
14|CULIACAN|6905|14530|613|196|260|1845|3907|26997|494|316|812|26|964|57865
15|CULIACAN|3841|9116|436|256|227|1433|3028|21504|506|243|574|16|749|41929
16|CULIACAN|1789|6606|310|186|245|1461|2610|20454|440|238|509|23|676|35547
17|CULIACAN|1865|7857|405|290|252|1923|3250|21407|443|244|421|20|938|39315
18|CULIACAN|1683|8735|480|435|219|1207|4271|23129|403|306|422|7|895|42192
19|LA CRUZ|1292|13340|450|4392|1190|771|7180|18279|2826|333|223|1|1840|52117
20|MAZATLAN|2435|8342|352|327|249|1132|3218|24769|411|261|812|11|908|43227
21|MAZATLAN|5416|11938|436|289|295|1246|3213|23304|368|268|876|32|748|48429
22|MAZATLAN|3809|11379|426|259|318|1357|2985|25427|320|252|731|24|1090|48377
23|MAZATLAN|2578|8325|1001|278|247|962|5077|20256|425|285|501|12|1157|41104
24|ROSARIO|8557|6994|461|1671|161|2858|5598|16823|314|427|511|3|1211|45589
"""
# Fila "Total de Votos" impresa en el cuadro, para validar la transcripción.
SINALOA_TOTALES = [85614, 255621, 17078, 19982, 10536, 31897, 90912, 533313, 11285, 8386, 12396, 422, 25380, 1102822]
SINALOA_PARTIDOS = ["PAN", "PRI", "PRD", "PT", "PVEM", "MC", "PAS", "MORENA", "PES", "RSP", "FxM"]


def cargar_sinaloa() -> pd.DataFrame:
    filas = [l.split("|") for l in _SINALOA.strip().splitlines()]
    df = pd.DataFrame(filas, columns=["DL", "CABECERA"] + SINALOA_PARTIDOS + ["CNR", "NULOS", "TOTAL"])
    for c in ["DL"] + SINALOA_PARTIDOS + ["CNR", "NULOS", "TOTAL"]:
        df[c] = pd.to_numeric(df[c])
    suma = df[SINALOA_PARTIDOS + ["CNR", "NULOS", "TOTAL"]].sum().tolist()
    assert suma == SINALOA_TOTALES, f"Transcripción de Sinaloa no cuadra con el total impreso: {suma} vs {SINALOA_TOTALES}"
    assert (df[SINALOA_PARTIDOS + ["CNR", "NULOS"]].sum(axis=1) == df["TOTAL"]).all()
    df["MUNICIPIO"] = "DISTRITO " + df["DL"].astype(str).str.zfill(2) + " " + df["CABECERA"]
    df["MUNICIPIO"] = df["MUNICIPIO"].map(limpia_muni)
    df["SECCION"] = None
    df["LISTA_NOMINAL"] = np.nan
    return _arma(df, SINALOA_PARTIDOS)


# --------------------------------------------------------------------------- Nayarit (cómputo con partidos individuales)
def cargar_nayarit_pp() -> pd.DataFrame:
    """Nayarit.xlsx: cómputo por casilla con PAN, PRI, PRD... y combinaciones de coalición, más lista nominal."""
    df = pd.read_excel(BASE / "Nayarit.xlsx", header=5)
    ini, fin = df.columns.get_loc("PAN"), df.columns.get_loc("NO_REGISTRADOS")
    p, nombres = _par(df, list(df.columns[ini:fin]))
    out = p.copy()
    out["MUNICIPIO"] = df["CABECERA_MUNICIPAL"].map(limpia_muni).replace({"EXTRANJERO": "VOTO EN EL EXTRANJERO"})
    out["DL"] = np.nan
    out["SECCION"] = num(df["SECCION"]).fillna(0).astype(int)
    out["LISTA_NOMINAL"] = num(df["LISTA_NOMINAL"])
    out["CNR"] = num(df["NO_REGISTRADOS"]).fillna(0)
    out["NULOS"] = num(df["NULOS"]).fillna(0)
    out["TOTAL"] = num(df["TOTAL_VOTOS"])
    return _arma(out, nombres)


# --------------------------------------------------------------------------- Guerrero (PROCODE, IEPC Guerrero)
# votos_extranjero.json de https://www.iepcgro.mx/computos2021/procode (el CSV trae la casilla del extranjero vacía)
_GRO_EXT = {"PAN": 36, "PRI": 91, "PRD": 34, "PT": 16, "PVEM": 5, "MC": 19, "MORENA": 852, "PES": 1, "RSP": 5,
            "FxM": 13, "PRI_PRD": 21, "PT_PVEM": 3, "CNR": 7, "NULOS": 15}


def cargar_guerrero() -> pd.DataFrame:
    """GRO_GUB_2021.csv (base de datos PROCODE, corte 18-jul-2021 20:57: 5,008 de 5,013 actas contabilizadas)."""
    ruta = BASE / "GubernaturaGuerrero_PROCODE.csv"
    lineas = ruta.read_text(encoding="utf-8-sig", errors="replace").splitlines()
    ini = next(i for i, l in enumerate(lineas) if l.startswith("CLAVE_CASILLA"))
    df = pd.read_csv(ruta, skiprows=ini, encoding="utf-8-sig", encoding_errors="replace", dtype=str)
    df = df[df["SECCION"].astype(str).str.strip().ne("0000")].copy()  # casilla del extranjero (sin datos en el CSV)
    cols = ["PAN", "PRI", "PRD", "PT", "PVEM", "MC", "MORENA", "PES", "RSP", "FXM", "PRI_PRD", "PT_PVEM"]
    p, nombres = _par(df, cols)
    out = p.copy()
    out["MUNICIPIO"] = ""  # se asigna por sección (catálogo INE)
    out["DL"] = num(df["ID_DISTRITO_LOCAL"])
    out["SECCION"] = num(df["SECCION"]).astype(int)
    out["LISTA_NOMINAL"] = num(df["LISTA_NOMINAL"])
    out["CNR"] = num(df["NOREG"]).fillna(0)
    out["NULOS"] = num(df["NULO"]).fillna(0)
    out["TOTAL"] = num(df["TOTAL_VOTOS_CALCULADO"])
    ext = {c: _GRO_EXT.get(c, 0) for c in nombres}
    ext.update(MUNICIPIO="VOTO EN EL EXTRANJERO", DL=np.nan, SECCION=0, LISTA_NOMINAL=np.nan, CNR=_GRO_EXT["CNR"],
               NULOS=_GRO_EXT["NULOS"], TOTAL=1118)
    out = pd.concat([out, pd.DataFrame([ext])], ignore_index=True)
    return _arma(out, nombres)


# --------------------------------------------------------------------------- Quintana Roo 2022
def cargar_qroo() -> pd.DataFrame:
    """COMP_2022.zip > COMP_GUB_QROO.zip > QROO_GUB_2022.csv (cómputo por casilla, 6-sep-2022)."""
    with zipfile.ZipFile(BASE / "COMP_2022.zip") as z1:
        with zipfile.ZipFile(z1.open("COMP_GUB_QROO.zip")) as z2:
            with z2.open("QROO_GUB_2022.csv") as fh:
                df = pd.read_csv(fh, sep="|", skiprows=3, encoding="utf-8-sig", dtype=str)
    for c in ("SECCION", "ID_DISTRITO_LOCAL"):
        df[c] = df[c].astype(str).str.replace(r'[="\s]', "", regex=True)
    ini, fin = df.columns.get_loc("PAN"), df.columns.get_loc("NO_REGISTRADOS")
    cols = list(df.columns[ini:fin])
    ren = {c: norm_partido(re.sub(r"^C_", "", c)) for c in cols}
    p, nombres = _par(df, cols, ren)
    out = p.copy()
    out["MUNICIPIO"] = ""
    out["DL"] = num(df["ID_DISTRITO_LOCAL"])
    out["SECCION"] = num(df["SECCION"]).fillna(0).astype(int)
    out["LISTA_NOMINAL"] = num(df["LISTA_NOMINAL"])
    out["CNR"] = num(df["NO_REGISTRADOS"]).fillna(0)
    out["NULOS"] = num(df["NULOS"]).fillna(0)
    out["TOTAL"] = num(df["TOTAL"])
    return _arma(out, nombres)


# --------------------------------------------------------------------------- Campeche (por distrito local)
CAMPECHE_PARTIDOS = ["PAN", "PRI", "PRD", "PT", "PVEM", "MC", "MORENA", "PES", "RSP", "FxM",
                     "PAN_PRI_PRD", "PAN_PRI", "PAN_PRD", "PRI_PRD", "PT_MORENA"]
# Encabezados de partido de Campeche.xlsx son logotipos; el orden se identificó con las imágenes de la hoja.


def cargar_campeche() -> pd.DataFrame:
    """Campeche.xlsx: 21 distritos locales, resultados conforme al JRC SUP-JRC-128/2021 y acumulados."""
    bruto = pd.read_excel(BASE / "Campeche.xlsx", header=None, dtype=object)
    datos = bruto[pd.to_numeric(bruto.iloc[:, 0], errors="coerce").notna()].copy()
    assert len(datos) == 21, len(datos)
    out = pd.DataFrame({"DL": num(datos.iloc[:, 0]).astype(int)})
    for k, nombre in enumerate(CAMPECHE_PARTIDOS):
        out[nombre] = num(datos.iloc[:, 1 + 2 * k]).to_numpy()
    out["CNR"] = num(datos.iloc[:, 31]).to_numpy()
    out["NULOS"] = num(datos.iloc[:, 35]).to_numpy()
    out["TOTAL"] = num(datos.iloc[:, 37]).to_numpy()
    out["LISTA_NOMINAL"] = num(datos.iloc[:, 39]).to_numpy()
    out["MUNICIPIO"] = ""
    out["SECCION"] = None
    return _arma(out, CAMPECHE_PARTIDOS)
