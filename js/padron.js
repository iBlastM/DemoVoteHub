// ============================================================
// padron.js — Padrón y Lista Nominal reales (INE, datos abiertos)
// agregados en build_padron.py a data/padron-ln.json (~46 KB).
// La app nunca toca el XLSX original (150 MB).
// ============================================================

let _cache = null;

export function loadPadron() {
  if (_cache) return _cache;
  _cache = fetch('data/padron-ln.json')
    .then((res) => (res.ok ? res.json() : null))
    .catch(() => null);
  return _cache;
}

/** [padrón, lista nominal territorial, lista nominal en el extranjero] de una entidad. */
export function statsEstado(data, cve) {
  if (!data || !cve) return null;
  return data.estados[String(parseInt(cve, 10))] || null;
}

/** Electorado potencial registrado: lista nominal territorial + residentes en el extranjero. */
export function totalListaNominal(stats) {
  return stats ? (Number(stats[1]) || 0) + (Number(stats[2]) || 0) : 0;
}

/** [padrón, lista nominal] de un municipio a partir de su cvegeo INEGI. */
export function statsMunicipio(data, cvegeo) {
  if (!data || !cvegeo) return null;
  const ent = String(parseInt(String(cvegeo).slice(0, 2), 10));
  const muni = String(parseInt(String(cvegeo).slice(2), 10));
  const m = data.mun[ent];
  return (m && m[muni]) || null;
}

export const fmtNum = (n) => Number(n).toLocaleString('es-MX');
