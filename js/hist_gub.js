// ============================================================
// hist_gub.js — Resultados reales de la gubernatura (2021/2022)
// por entidad, agregados por municipio.
//
// Lo usa el Mapa de dominio (capas Cambio y Oportunidad) para las
// 17 entidades; sustituye a hist2021.js (que solo cargaba Querétaro).
// Forma de datos por municipio:
//   { nombre, votos, nominal, partidos: { PAN: n, ... } }
//
// Insumos (generados por gub2021/build.py):
//   data/gubernaturas_manifest.json   → qué archivo y qué avisos por entidad
//   data/SE_GUB_<EDO>_<AÑO>.csv       → sábana estándar por sección/municipio
// ============================================================

import { slugify } from './utils.js';

/** Partidos que hoy consume el Demo (dominio.js / hist2021.js). */
export const PARTIDOS_BASE = ['MORENA', 'PAN', 'PRI', 'MC', 'PVEM', 'PT'];

// Coaliciones con nombre propio en el origen → partidos que la integran.
const ALIAS_COALICION = { UNIDOS_CONTIGO: ['PAN', 'PRI', 'PRD'] };

/** Partidos que integran una columna del CSV ("PAN_PRI_PRD" → [PAN, PRI, PRD]). */
export function miembros(col) {
  return ALIAS_COALICION[col] || String(col).split('_');
}

/**
 * Cómo leer cada partido base en la entidad: su columna propia si el instituto la
 * publica; si no, la coalición (columna) más grande que lo contiene.
 * Devuelve { [partido]: { key, members, coalicion } }; un partido sin columna ni
 * coalición no aparece. `members` son solo partidos base (para sumar el 2027).
 */
export function unidadesGub(meta) {
  const out = {};
  if (!meta) return out;
  const cols = meta.partidos || [];
  for (const p of PARTIDOS_BASE) {
    if (cols.includes(p)) { out[p] = { key: p, members: [p], coalicion: false }; continue; }
    const cand = cols.filter((c) => c !== p && miembros(c).includes(p))
      .sort((a, b) => miembros(b).length - miembros(a).length);
    if (!cand.length) continue;
    out[p] = { key: cand[0], members: miembros(cand[0]).filter((m) => PARTIDOS_BASE.includes(m)), coalicion: true };
  }
  return out;
}

const MANIFEST_URL = 'data/gubernaturas_manifest.json';
let _manifest = null;
const _cache = new Map(); // cve -> Promise<{ muni, meta }>

/** Manifiesto: { [cveEntidad]: meta }. */
export async function loadManifest() {
  if (_manifest) return _manifest;
  const res = await fetch(MANIFEST_URL);
  if (!res.ok) throw new Error('Manifiesto de gubernaturas no disponible');
  _manifest = (await res.json()).entidades;
  return _manifest;
}

/** Metadatos de una entidad (o null si no hay base). Sirve para decidir qué mostrar sin descargar el CSV. */
export async function infoGub(cve) {
  const m = await loadManifest();
  return m[String(cve)] || null;
}

/**
 * Aviso para el usuario, o '' si no hace falta. Cubre los casos especiales que pidió el proyecto:
 * coaliciones sin desglose por partido, lista nominal estimada, municipio estimado y año distinto de 2021.
 */
export function avisosGub(meta) {
  if (!meta) return [];
  const out = [];
  if (meta.desglose_partidos !== 'COMPLETO' && meta.aviso_desglose) {
    out.push({ tipo: 'coalicion', texto: meta.aviso_desglose });
  }
  if (meta.anio !== 2021) {
    out.push({ tipo: 'anio', texto: `Elección de gubernatura de ${meta.anio}.` });
  }
  if (meta.lista_nominal_estimada) {
    out.push({ tipo: 'ln', texto: 'Lista nominal 2021 de SRC (INE-DERFE) repartida entre secciones: la participación por sección es aproximada.' });
  }
  if (meta.municipio_metodo === 'REPARTO_DISTRITO') {
    out.push({ tipo: 'municipio', texto: 'Resultados publicados por distrito local; algunos municipios son estimados.' });
  }
  if (!meta.tiene_municipio) {
    out.push({ tipo: 'sin-municipio', texto: 'Resultados publicados solo por distrito local: no hay desglose municipal.' });
  }
  return out;
}

/**
 * Carga y agrega por municipio la base de la entidad `cve` (clave INEGI, 1..32).
 * Devuelve { muni, meta } o null si la entidad no tiene base o no tiene municipios.
 */
export function loadHistGub(cve) {
  const key = String(cve);
  if (!_cache.has(key)) _cache.set(key, _cargar(key));
  return _cache.get(key);
}

async function _cargar(key) {
  const meta = await infoGub(key);
  if (!meta || !meta.tiene_municipio) return null;
  const res = await fetch(`data/${meta.archivo}`);
  if (!res.ok) throw new Error(`Datos de ${meta.entidad} no disponibles`);
  return { muni: parseCSV(await res.text(), meta.partidos), meta };
}

/** Agrega el CSV por municipio (suma de secciones / distritos). Exportada para pruebas. */
export function parseCSV(text, partidos) {
  const lines = text.replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  const head = lines[0].split(',').map((h) => h.trim());
  const col = (name) => head.indexOf(name);
  const cMun = col('MUNICIPIO');
  const cNom = col('LISTA_NOMINAL');
  const cVot = col('VOTOS_EMITIDOS');
  const cols = partidos.map((p) => ({ p, i: col(p) }));

  const muni = {};
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(',');
    const nombre = (c[cMun] || '').trim();
    // Sin municipio (p. ej. filas por distrito de Sinaloa) o voto en el extranjero: no se mapean.
    if (!nombre || nombre === 'VOTO EN EL EXTRANJERO' || /^DISTRITO \d/.test(nombre)) continue;
    const key = slugify(nombre);
    const m = (muni[key] = muni[key] || { nombre, votos: 0, nominal: 0, partidos: {} });
    m.votos += Number(c[cVot]) || 0;
    m.nominal += Number(c[cNom]) || 0;
    for (const { p, i: pi } of cols) {
      if (pi < 0) continue;
      m.partidos[p] = (m.partidos[p] || 0) + (Number(c[pi]) || 0);
    }
  }
  return muni;
}
