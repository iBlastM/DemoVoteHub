// ============================================================
// data.js — Dataset de las 17 gubernaturas (2027) construido a
// partir de encuestas reales agregadas en data/agregado.csv
// (promedio ponderado por recencia/calidad + tendencia Kalman,
// generado por el pipeline de scraping de encuestadoras públicas).
// Las probabilidades de victoria se derivan de una simulación
// Monte Carlo sobre esas estimaciones puntuales; el partido
// gobernante de referencia (para detectar "cambia de partido")
// sigue siendo un dato de referencia editorial, no del scraper.
// ============================================================

import { slugify, rng, seedFrom, clamp } from './utils.js';
import { estatusPorMargen, PARTY_ORDER, PARTIES, ELECTION_DATE, API_BASE } from './config.js';

// Metadatos editoriales por entidad: geo (nom_edo exacto del GeoJSON),
// display, región y partido gobernante de referencia (para la etiqueta
// "cambia de partido"). El voto y la incertidumbre ya no son fijos: se
// calculan a partir de data/agregado.csv.
const NUCLEO = [
  { cve: 1,  geo: 'Aguascalientes',      slugCsv: 'aguascalientes',      nombre: 'Aguascalientes',    region: 'Bajío',     gob: 'PAN' },
  { cve: 2,  geo: 'Baja California',     slugCsv: 'baja-california',     nombre: 'Baja California',   region: 'Norte',     gob: 'MORENA' },
  { cve: 3,  geo: 'Baja California Sur', slugCsv: 'baja-california-sur', nombre: 'Baja California Sur', region: 'Norte',   gob: 'MORENA' },
  { cve: 4,  geo: 'Campeche',            slugCsv: 'campeche',            nombre: 'Campeche',          region: 'Sureste',  gob: 'MORENA' },
  { cve: 8,  geo: 'Chihuahua',           slugCsv: 'chihuahua',           nombre: 'Chihuahua',         region: 'Norte',     gob: 'PAN' },
  { cve: 6,  geo: 'Colima',              slugCsv: 'colima',              nombre: 'Colima',            region: 'Occidente', gob: 'MORENA' },
  { cve: 23, geo: 'Quintana Roo',        slugCsv: 'quintana-roo',        nombre: 'Quintana Roo',      region: 'Sureste',   gob: 'MORENA' },
  { cve: 12, geo: 'Guerrero',            slugCsv: 'guerrero',            nombre: 'Guerrero',          region: 'Sur',       gob: 'MORENA' },
  { cve: 16, geo: 'Michoacán de Ocampo', slugCsv: 'michoacan',           nombre: 'Michoacán',         region: 'Occidente', gob: 'MORENA' },
  { cve: 18, geo: 'Nayarit',             slugCsv: 'nayarit',             nombre: 'Nayarit',           region: 'Occidente', gob: 'MORENA' },
  { cve: 19, geo: 'Nuevo León',          slugCsv: 'nuevo-leon',          nombre: 'Nuevo León',        region: 'Norte',     gob: 'MC' },
  { cve: 22, geo: 'Querétaro',           slugCsv: 'queretaro',           nombre: 'Querétaro',         region: 'Bajío',     gob: 'PAN' },
  { cve: 24, geo: 'San Luis Potosí',     slugCsv: 'san-luis-potosi',     nombre: 'San Luis Potosí',   region: 'Bajío',     gob: 'MORENA' },
  { cve: 25, geo: 'Sinaloa',             slugCsv: 'sinaloa',             nombre: 'Sinaloa',           region: 'Norte',     gob: 'MORENA' },
  { cve: 26, geo: 'Sonora',              slugCsv: 'sonora',              nombre: 'Sonora',            region: 'Norte',     gob: 'MORENA' },
  { cve: 29, geo: 'Tlaxcala',            slugCsv: 'tlaxcala',            nombre: 'Tlaxcala',          region: 'Centro',    gob: 'MORENA' },
  { cve: 32, geo: 'Zacatecas',           slugCsv: 'zacatecas',           nombre: 'Zacatecas',         region: 'Bajío',     gob: 'MORENA' },
];

// data/agregado.csv usa claves de partido en minúsculas; PARTIES usa IDs en
// mayúsculas. PRD no está modelado como fuerza propia en la demo.
const PARTIDO_CSV_A_ID = {
  morena: 'MORENA', pan: 'PAN', pri: 'PRI', mc: 'MC', pvem: 'PVEM', pt: 'PT',
};

const AGREGADO_CSV_URL = 'data/agregado.csv';
let _agregadoCache = null;

/**
 * Descarga un CSV del pipeline: primero desde la API de mirador-backend (datos
 * que regenera su programa periódico) y, si no responde, la copia local en data/.
 */
async function fetchCSV(apiPath, localUrl) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(API_BASE + apiPath, { signal: ctrl.signal });
    clearTimeout(t);
    if (res.ok) return await res.text();
  } catch { /* API apagada: se usa el CSV local */ }
  const res = await fetch(localUrl);
  if (!res.ok) throw new Error(`No se pudo cargar ${localUrl}`);
  return res.text();
}

/** Parser CSV mínimo (sin comillas/escapes: el archivo es tabular simple). */
function parseCSV(texto) {
  const lineas = texto.trim().split(/\r?\n/);
  const encabezados = lineas[0].split(',');
  return lineas.slice(1).map((linea) => {
    const valores = linea.split(',');
    return Object.fromEntries(encabezados.map((h, i) => [h, valores[i]]));
  });
}

/**
 * Carga y agrupa data/agregado.csv por entidad: { [geoSlug]: { [PARTY_ID]: fila } }.
 * fila = { promedio, tendencia, nEncuestas, min, max }. Se cachea en memoria.
 */
export async function cargarAgregado() {
  if (_agregadoCache) return _agregadoCache;
  const filas = parseCSV(await fetchCSV('/api/v1/agregado.csv', AGREGADO_CSV_URL));
  const porEstado = {};
  let fechaCalculo = null;
  for (const fila of filas) {
    if (fila.fecha_calculo) fechaCalculo = fila.fecha_calculo;
    const partidoId = PARTIDO_CSV_A_ID[fila.partido];
    if (!partidoId) continue; // partido no modelado (p. ej. prd) -> se ignora
    const slug = fila.estado; // agregado.csv ya usa slugs (aguascalientes, baja-california, ...)
    const grupo = (porEstado[slug] = porEstado[slug] || {});
    grupo[partidoId] = {
      promedio: Number(fila.promedio_ponderado),
      tendencia: Number(fila.tendencia_kalman),
      nEncuestas: Number(fila.n_encuestas) || 0,
      min: Number(fila.min),
      max: Number(fila.max),
    };
  }
  _agregadoCache = porEstado;
  _fechaCalculo = fechaCalculo;
  return _agregadoCache;
}

/** Fecha real (YYYY-MM-DD) del corte de encuestas usado en data/agregado.csv. */
let _fechaCalculo = null;
export function fechaAgregado() {
  return _fechaCalculo;
}

const ENCUESTAS_CSV_URL = 'data/encuestas_clean.csv';
let _encuestasCache = null;

/** Parser CSV que respeta comillas dobles (el detalle de encuestas trae
 * texto libre con comas, p. ej. notas y candidato_o_partido). */
function parseCSVConComillas(texto) {
  const lineas = [];
  let fila = [];
  let campo = '';
  let enComillas = false;
  const texto2 = texto.replace(/\r\n/g, '\n');
  for (let i = 0; i < texto2.length; i++) {
    const c = texto2[i];
    if (enComillas) {
      if (c === '"') {
        if (texto2[i + 1] === '"') { campo += '"'; i++; } else { enComillas = false; }
      } else campo += c;
    } else if (c === '"') {
      enComillas = true;
    } else if (c === ',') {
      fila.push(campo); campo = '';
    } else if (c === '\n') {
      fila.push(campo); lineas.push(fila); fila = []; campo = '';
    } else campo += c;
  }
  if (campo !== '' || fila.length) { fila.push(campo); lineas.push(fila); }
  const encabezados = lineas[0];
  return lineas.slice(1).filter((f) => f.length === encabezados.length).map((f) =>
    Object.fromEntries(encabezados.map((h, i) => [h, f[i]])));
}

/**
 * Carga y agrupa data/encuestas_clean.csv por entidad en sondeos reales:
 * { [geoSlug]: [{ casa, fecha, n, shares:{PARTY_ID:pct} }] }. Cada sondeo se
 * agrupa por (encuestadora, fecha); una misma encuesta reporta varios
 * partidos en filas separadas del CSV original.
 */
export async function cargarEncuestasDetalle() {
  if (_encuestasCache) return _encuestasCache;
  try {
    const filas = parseCSVConComillas(await fetchCSV('/api/v1/encuestas_clean.csv', ENCUESTAS_CSV_URL));
    const porEstado = {};
    const sondeoPorClave = new Map();
    for (const fila of filas) {
      const partidoId = PARTIDO_CSV_A_ID[fila.partido];
      if (!partidoId || !fila.estado || !fila.fecha) continue;
      const clave = `${fila.estado}|${fila.encuestadora}|${fila.fecha}`;
      let sondeo = sondeoPorClave.get(clave);
      if (!sondeo) {
        sondeo = { casa: fila.encuestadora, fecha: new Date(fila.fecha + 'T00:00:00'), n: Number(fila.muestra) || null, shares: {} };
        sondeoPorClave.set(clave, sondeo);
        (porEstado[fila.estado] = porEstado[fila.estado] || []).push(sondeo);
      }
      const pct = Number(fila.porcentaje);
      if (Number.isFinite(pct)) sondeo.shares[partidoId] = pct;
    }
    for (const lista of Object.values(porEstado)) lista.sort((a, b) => b.fecha - a.fecha);
    _encuestasCache = porEstado;
  } catch {
    _encuestasCache = {};
  }
  return _encuestasCache;
}

const CASAS = ['Enkoll', 'Buendía & Márquez', 'De las Heras', 'Massive Caller', 'C&E', 'Parametría', 'Mitofsky'];

/** Muestra normal estándar (Box-Muller) usando un rng uniforme. */
function gauss(u) {
  const a = Math.max(1e-9, u());
  const b = u();
  return Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * b);
}

/**
 * Incertidumbre real por fuerza a partir de la dispersión observada entre
 * encuestas (max-min) y del número de encuestas disponibles: con pocas
 * mediciones el rango observado es poco informativo, así que se aplica un
 * mínimo prudente y se reduce el rango a una desviación aproximada (rango/4,
 * regla práctica para no sobreestimar la incertidumbre con colas anchas).
 */
/**
 * Incertidumbre real por fuerza: combina la dispersión observada entre
 * encuestas (rango max-min) con un piso mínimo que depende de cuánto falta
 * para la jornada electoral. A 9+ meses de la elección (como en esta corrida),
 * el "swing" histórico de intención de voto en gubernaturas mexicanas es
 * amplio; un sigma de sólo 2-9 puntos, como si la encuesta fuera el resultado
 * final, produce probabilidades de victoria irrealmente cercanas al 100% aun
 * con márgenes moderados. El piso se reduce gradualmente a medida que se
 * acerca el 6 de junio de 2027, igual que en los modelos de pronóstico
 * electoral reales (p. ej. FiveThirtyEight), que ensanchan la incertidumbre
 * cuanto más lejos está la jornada.
 */
function pisoPorTiempoRestante() {
  const MS_DIA = 86400000;
  const VENTANA_MAX_DIAS = 365; // a un año o más de la jornada, el piso es máximo
  const diasRestantes = Math.max(0, (ELECTION_DATE.getTime() - Date.now()) / MS_DIA);
  const t = clamp(diasRestantes / VENTANA_MAX_DIAS, 0, 1);
  // 8 pp de piso muy cerca de la jornada -> 16 pp de piso a un año o más.
  return 8 + 8 * t;
}

function sigmaDesdeEncuestas(fila) {
  const rango = Number.isFinite(fila.max) && Number.isFinite(fila.min) ? fila.max - fila.min : 0;
  const dispersion = rango > 0 ? rango / 4 : 3.5;
  const factorMuestra = fila.nEncuestas >= 5 ? 1 : 1.3; // más cautela con pocas encuestas
  const piso = pisoPorTiempoRestante();
  return clamp(Math.max(dispersion * factorMuestra, piso), 8, 18);
}

/** Simula probabilidades de victoria por fuerza (Monte Carlo), con sigma por fuerza. */
function simular(voto, sigmaPorFuerza, u, draws = 6000) {
  const forces = Object.keys(voto);
  const wins = Object.fromEntries(forces.map((f) => [f, 0]));
  for (let i = 0; i < draws; i++) {
    let best = null;
    let bestVal = -Infinity;
    for (const f of forces) {
      const sigma = sigmaPorFuerza[f] ?? 4.0;
      const val = voto[f] + gauss(u) * sigma;
      if (val > bestVal) { bestVal = val; best = f; }
    }
    wins[best]++;
  }
  const prob = {};
  for (const f of forces) prob[f] = wins[f] / draws;
  return prob;
}

/** Serie de tendencia: puntos quincenales que convergen al estimado. */
function generarTendencia(voto, u, fechaCorte) {
  // Se grafican como máximo las 4 fuerzas con mayor voto para no saturar la
  // gráfica de tendencia; el resto sigue disponible en voto/prob.
  const forces = Object.entries(voto).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([f]) => f);
  const n = 13;
  const puntos = [];
  // El punto de partida es el corte real del agregado (o hoy si no hay
  // fecha disponible); el punto final es la jornada electoral. Así la
  // gráfica sigue siendo válida sin importar cuándo se regenere el CSV.
  const inicio = (fechaCorte ? new Date(fechaCorte + 'T00:00:00') : new Date()).getTime();
  const fin = new Date('2027-06-06T00:00:00').getTime();
  const paso = Math.max(1, fin - inicio) / (n - 1);
  // Punto de partida algo distinto para dar movimiento.
  const arranque = {};
  for (const f of forces) arranque[f] = voto[f] + (u() - 0.5) * 14;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const fila = { fecha: new Date(inicio + paso * i) };
    for (const f of forces) {
      const base = arranque[f] * (1 - t) + voto[f] * t;
      fila[f] = clamp(base + (u() - 0.5) * 3.2, 2, 72);
    }
    puntos.push(fila);
  }
  return { forces, puntos };
}

/** Encuestas del ciclo: jitter alrededor del estimado puntual, con fechas
 * ancladas al corte real del agregado (nunca en el futuro respecto a hoy). */
function generarEncuestas(voto, u, fechaCorte) {
  const forces = Object.keys(voto);
  const n = 6 + Math.floor(u() * 4);
  const filas = [];
  const referencia = fechaCorte ? new Date(fechaCorte + 'T00:00:00').getTime() : Date.now();
  for (let i = 0; i < n; i++) {
    const dias = Math.floor(u() * 150) + 5;
    const fecha = new Date(referencia - dias * 86400000);
    const fila = {
      casa: CASAS[Math.floor(u() * CASAS.length)],
      fecha,
      n: 600 + Math.floor(u() * 900),
      shares: {},
    };
    for (const f of forces) fila.shares[f] = clamp(voto[f] + (u() - 0.5) * 6.5, 1, 74);
    filas.push(fila);
  }
  filas.sort((a, b) => b.fecha - a.fecha);
  return filas;
}

/** Construye el dataset completo derivando probabilidades, estatus y electorado. */
export async function construirEstados(padronData) {
  const agregado = await cargarAgregado();
  const fechaCalculo = fechaAgregado();
  const encuestasDetalle = await cargarEncuestasDetalle();
  return NUCLEO.map((base) => {
    const u = rng(seedFrom(base.geo));
    const filasPartido = agregado[base.slugCsv] || {};
    const fuerzasDisponibles = Object.keys(filasPartido).filter((id) => PARTIES[id]);

    // Voto en puntos porcentuales (0-100) por fuerza, tomando la tendencia
    // Kalman (suavizada) de data/agregado.csv como mejor estimación puntual.
    const votoPct = {};
    const sigmaPorFuerza = {};
    for (const id of fuerzasDisponibles) {
      const fila = filasPartido[id];
      votoPct[id] = fila.tendencia;
      sigmaPorFuerza[id] = sigmaDesdeEncuestas(fila);
    }

    // Normaliza a proporciones (con "Otros" al 100%) para gráficas/tablas.
    const sumaFuerzas = Object.values(votoPct).reduce((a, b) => a + b, 0);
    const otros = Math.max(0, 100 - sumaFuerzas);
    const voto = {};
    for (const [k, v] of Object.entries(votoPct)) voto[k] = v / 100;
    voto.Otros = otros / 100;

    // El JSON del INE se indexa por la clave de entidad, no por el nombre.
    // La lista nominal territorial es la base de los apoyos potenciales; la
    // lista en el extranjero se conserva aparte porque su elegibilidad depende
    // de la modalidad de cada elección local.
    const registro = padronData?.estados?.[String(base.cve)] || [0, 0, 0];
    const padron = Number(registro[0]) || 0;
    const listaNominal = Number(registro[1]) || 0;
    const listaNominalExtranjero = Number(registro[2]) || 0;
    const electoradoPotencial = listaNominal + listaNominalExtranjero;
    const votantesEstimados = Object.fromEntries(
      Object.entries(voto).map(([fuerza, proporcion]) => [fuerza, Math.round(proporcion * listaNominal)]),
    );

    const prob = simular(votoPct, sigmaPorFuerza, u);
    // Favorito y margen puntual (entre las fuerzas con datos, sin "Otros").
    const ranking = Object.entries(votoPct).sort((a, b) => b[1] - a[1]);
    const favorito = ranking[0]?.[0] || null;
    const margen = ranking[0] ? ranking[0][1] - (ranking[1] ? ranking[1][1] : 0) : 0;
    const estatus = estatusPorMargen(margen);
    const flip = favorito !== base.gob;
    const probFav = favorito ? prob[favorito] : 0;

    const { forces, puntos } = generarTendencia(votoPct, u, fechaCalculo);

    return {
      slug: slugify(base.geo),
      geo: base.geo,
      cve: base.cve,
      nombre: base.nombre,
      region: base.region,
      gob: base.gob,
      favorito,
      margen,
      flip,
      estatus,
      prob,                    // probabilidad de victoria por fuerza
      probFav,                 // probabilidad del favorito
      voto,                    // proporciones: útil para gráficas y simulación
      encuestasPorPartido: filasPartido, // fila cruda del agregado (promedio, n, min, max) por fuerza
      padron,
      listaNominal,
      listaNominalExtranjero,
      electoradoPotencial,
      votantesEstimados,       // apoyo potencial sobre lista nominal territorial
      tendencia: { forces, puntos },
      // Sondeos reales (casa, fecha, muestra, porcentajes) cuando el scraper
      // los capturó en detalle; si un estado no tiene desagregado por sondeo
      // disponible, se recurre a una ilustración sintética alrededor del
      // promedio real (marcada como tal en la vista).
      encuestas: encuestasDetalle[base.slugCsv]?.length
        ? encuestasDetalle[base.slugCsv]
        : generarEncuestas(votoPct, u, fechaCalculo),
      encuestasSonReales: Boolean(encuestasDetalle[base.slugCsv]?.length),
      actualizado: fechaCalculo,
    };
  });
}

/** Resúmenes nacionales para las vistas de conjunto. */
export function resumenNacional(estados) {
  const porFavorito = Object.fromEntries(PARTY_ORDER.map((p) => [p, 0]));
  let flips = 0;
  let renidas = 0;
  let padron = 0;
  let listaNominal = 0;
  let listaNominalExtranjero = 0;
  // Suma de probabilidades = número esperado de gubernaturas por fuerza.
  const esperado = Object.fromEntries(PARTY_ORDER.map((p) => [p, 0]));
  for (const e of estados) {
    porFavorito[e.favorito] = (porFavorito[e.favorito] || 0) + 1;
    if (e.flip) flips++;
    if (e.estatus.id === 'renida' || e.estatus.id === 'inclinada') renidas++;
    padron += e.padron || 0;
    listaNominal += e.listaNominal || 0;
    listaNominalExtranjero += e.listaNominalExtranjero || 0;
    for (const [f, p] of Object.entries(e.prob)) {
      if (esperado[f] !== undefined) esperado[f] += p;
    }
  }
  return {
    total: estados.length, porFavorito, esperado, flips, renidas,
    padron, listaNominal, listaNominalExtranjero,
    electoradoPotencial: listaNominal + listaNominalExtranjero,
  };
}
