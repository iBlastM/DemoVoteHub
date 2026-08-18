// ============================================================
// data.js — Dataset ficticio de las 17 gubernaturas (2027).
// Todo es demostrativo. Las probabilidades se derivan de una
// simulación Monte Carlo determinista sobre estimaciones puntuales.
// ============================================================

import { slugify, rng, seedFrom, clamp } from './utils.js';
import { estatusPorMargen, PARTY_ORDER } from './config.js';

// Núcleo editable: geo (nom_edo exacto del GeoJSON), display, región,
// partido gobernante (ficticio), estimación de voto por fuerza (%),
// e incertidumbre (sigma, en puntos). El favorito se deriva del voto.
const NUCLEO = [
  { geo: 'Aguascalientes',    nombre: 'Aguascalientes',    region: 'Bajío',   gob: 'PAN',    sigma: 4.0, voto: { PAN: 45, MORENA: 40, MC: 9 } },
  { geo: 'Baja California',   nombre: 'Baja California',   region: 'Norte',   gob: 'MORENA', sigma: 3.0, voto: { MORENA: 55, PAN: 33, MC: 8 } },
  { geo: 'Baja California Sur', nombre: 'Baja California Sur', region: 'Norte', gob: 'MORENA', sigma: 5.0, voto: { MORENA: 44, PAN: 40, MC: 10 } },
  { geo: 'Campeche',          nombre: 'Campeche',          region: 'Sureste', gob: 'MORENA', sigma: 4.0, voto: { MORENA: 52, PAN: 24, PRI: 18 } },
  { geo: 'Chihuahua',         nombre: 'Chihuahua',         region: 'Norte',   gob: 'PAN',    sigma: 4.0, voto: { MORENA: 46, PAN: 42, MC: 8 } },
  { geo: 'Colima',            nombre: 'Colima',            region: 'Occidente', gob: 'MORENA', sigma: 4.0, voto: { MORENA: 50, PAN: 34, MC: 10 } },
  { geo: 'Durango',           nombre: 'Durango',           region: 'Norte',   gob: 'PRI',    sigma: 4.5, voto: { PAN: 47, MORENA: 43, MC: 6 } },
  { geo: 'Guerrero',          nombre: 'Guerrero',          region: 'Sur',     gob: 'MORENA', sigma: 3.0, voto: { MORENA: 58, PRI: 20, PAN: 16 } },
  { geo: 'Michoacán de Ocampo', nombre: 'Michoacán',       region: 'Occidente', gob: 'MORENA', sigma: 4.5, voto: { MORENA: 45, PAN: 30, MC: 18 } },
  { geo: 'Nayarit',           nombre: 'Nayarit',           region: 'Occidente', gob: 'MORENA', sigma: 4.0, voto: { MORENA: 53, PAN: 30, MC: 11 } },
  { geo: 'Nuevo León',        nombre: 'Nuevo León',        region: 'Norte',   gob: 'MC',     sigma: 5.0, voto: { MC: 41, MORENA: 38, PAN: 17 } },
  { geo: 'Querétaro',         nombre: 'Querétaro',         region: 'Bajío',   gob: 'PAN',    sigma: 4.0, voto: { PAN: 49, MORENA: 41, MC: 6 } },
  { geo: 'San Luis Potosí',   nombre: 'San Luis Potosí',   region: 'Bajío',   gob: 'MORENA', sigma: 4.0, voto: { MORENA: 48, PAN: 26, PRI: 20 } },
  { geo: 'Sinaloa',           nombre: 'Sinaloa',           region: 'Norte',   gob: 'MORENA', sigma: 5.0, voto: { MORENA: 47, PAN: 41, MC: 7 } },
  { geo: 'Sonora',            nombre: 'Sonora',            region: 'Norte',   gob: 'MORENA', sigma: 3.0, voto: { MORENA: 56, PAN: 34, MC: 6 } },
  { geo: 'Tlaxcala',          nombre: 'Tlaxcala',          region: 'Centro',  gob: 'MORENA', sigma: 4.0, voto: { MORENA: 54, PAN: 28, PRI: 12 } },
  { geo: 'Zacatecas',         nombre: 'Zacatecas',         region: 'Bajío',   gob: 'MORENA', sigma: 4.0, voto: { MORENA: 51, PAN: 30, PRI: 13 } },
];

const CASAS = ['Enkoll', 'Buendía & Márquez', 'De las Heras', 'Massive Caller', 'C&E', 'Parametría', 'Mitofsky'];

/** Muestra normal estándar (Box-Muller) usando un rng uniforme. */
function gauss(u) {
  const a = Math.max(1e-9, u());
  const b = u();
  return Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * b);
}

/** Simula probabilidades de victoria por fuerza (Monte Carlo). */
function simular(voto, sigma, u, draws = 6000) {
  const forces = Object.keys(voto);
  const wins = Object.fromEntries(forces.map((f) => [f, 0]));
  for (let i = 0; i < draws; i++) {
    let best = null;
    let bestVal = -Infinity;
    for (const f of forces) {
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
function generarTendencia(voto, u) {
  const forces = Object.keys(voto).slice(0, 3);
  const n = 13; // ~6 meses quincenal
  const puntos = [];
  const inicio = new Date('2026-12-01').getTime();
  const paso = (new Date('2027-06-01').getTime() - inicio) / (n - 1);
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

/** Encuestas del ciclo: jitter alrededor del estimado puntual. */
function generarEncuestas(voto, u) {
  const forces = Object.keys(voto);
  const n = 6 + Math.floor(u() * 4);
  const filas = [];
  for (let i = 0; i < n; i++) {
    const dias = Math.floor(u() * 150) + 5;
    const fecha = new Date(new Date('2027-05-25').getTime() - dias * 86400000);
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

/** Construye el dataset completo derivando probabilidades y estatus. */
export function construirEstados() {
  return NUCLEO.map((base) => {
    const u = rng(seedFrom(base.geo));
    // Normaliza voto a proporciones (con "Otros" al 100%).
    const sumaFuerzas = Object.values(base.voto).reduce((a, b) => a + b, 0);
    const otros = Math.max(0, 100 - sumaFuerzas);
    const voto = {};
    for (const [k, v] of Object.entries(base.voto)) voto[k] = v / 100;
    voto.Otros = otros / 100;

    const prob = simular(base.voto, base.sigma, u);
    // Favorito y margen puntual (entre las fuerzas, sin "Otros").
    const ranking = Object.entries(base.voto).sort((a, b) => b[1] - a[1]);
    const favorito = ranking[0][0];
    const margen = ranking[0][1] - (ranking[1] ? ranking[1][1] : 0);
    const estatus = estatusPorMargen(margen);
    const flip = favorito !== base.gob;
    const probFav = prob[favorito];

    const { forces, puntos } = generarTendencia(base.voto, u);

    return {
      slug: slugify(base.geo),
      geo: base.geo,
      nombre: base.nombre,
      region: base.region,
      gob: base.gob,
      favorito,
      margen,
      flip,
      estatus,
      prob,          // probabilidad de victoria por fuerza
      probFav,       // probabilidad del favorito
      voto,          // proyección de voto (proporciones, incl. Otros)
      tendencia: { forces, puntos },
      encuestas: generarEncuestas(base.voto, u),
      actualizado: '9 jul',
    };
  });
}

/** Resúmenes nacionales para las vistas de conjunto. */
export function resumenNacional(estados) {
  const porFavorito = Object.fromEntries(PARTY_ORDER.map((p) => [p, 0]));
  let flips = 0;
  let renidas = 0;
  // Suma de probabilidades = número esperado de gubernaturas por fuerza.
  const esperado = Object.fromEntries(PARTY_ORDER.map((p) => [p, 0]));
  for (const e of estados) {
    porFavorito[e.favorito] = (porFavorito[e.favorito] || 0) + 1;
    if (e.flip) flips++;
    if (e.estatus.id === 'renida' || e.estatus.id === 'inclinada') renidas++;
    for (const [f, p] of Object.entries(e.prob)) {
      if (esperado[f] !== undefined) esperado[f] += p;
    }
  }
  return { total: estados.length, porFavorito, esperado, flips, renidas };
}
