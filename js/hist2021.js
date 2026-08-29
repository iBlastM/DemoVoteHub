// ============================================================
// hist2021.js — Resultados reales de la gubernatura 2021
// (Querétaro), agregados por municipio a partir del CSV.
// ============================================================

import { slugify } from './utils.js';

export const PARTIDOS_2021 = ['MORENA', 'PAN', 'PRI', 'MC'];

let _cache = null;

/** Carga y agrega el CSV por municipio (suma de secciones). */
export async function loadHist2021() {
  if (_cache) return _cache;
  const res = await fetch('data/Gubernatura_2021.csv');
  if (!res.ok) throw new Error('Datos 2021 no disponibles');
  const text = await res.text();
  _cache = parseCSV(text);
  return _cache;
}

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const head = lines[0].split(',').map((h) => h.trim());
  const col = (name) => head.indexOf(name);
  const cMun = col('MUNICIPIO');
  const cNom = col('LISTA_NOMINAL');
  const cVot = col('VOTOS_EMITIDOS');
  const cPartidos = PARTIDOS_2021.map((p) => ({ p, i: col(p) }));

  const muni = {};
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(',');
    const nombre = (c[cMun] || '').trim();
    if (!nombre || nombre === 'VOTO EN EL EXTRANJERO') continue;
    const key = slugify(nombre);
    const m = (muni[key] = muni[key] || { nombre, votos: 0, nominal: 0, partidos: {} });
    m.votos += Number(c[cVot]) || 0;
    m.nominal += Number(c[cNom]) || 0;
    for (const { p, i: pi } of cPartidos) {
      if (pi < 0) continue;
      m.partidos[p] = (m.partidos[p] || 0) + (Number(c[pi]) || 0);
    }
  }
  return muni;
}
