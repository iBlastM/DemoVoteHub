// ============================================================
// stats.js — Cálculos puros (sin DOM) de Predicciones y del
// detalle de estado: simulación de conteos, perspectiva y
// promedio móvil de encuestas.
// ============================================================

export const DIA_MS = 86400000;

/* ---------- Simulación de cuántas contiendas gana una fuerza ---------- */

/**
 * Simula `draws` escenarios: en cada uno, la fuerza gana cada contienda `i`
 * con probabilidad `ps[i]` (contiendas independientes). Devuelve la
 * distribución del número de victorias, su media, P(>= n) y el rango del 80 %
 * (percentiles 10 y 90).
 * @param {number[]} ps  probabilidades de victoria, una por contienda
 * @param {() => number} u  generador uniforme en [0, 1)
 */
export function simularConteo(ps, u, draws = 20000) {
  const conteo = new Array(ps.length + 1).fill(0);
  for (let d = 0; d < draws; d++) {
    let w = 0;
    for (const p of ps) if (u() < p) w++;
    conteo[w]++;
  }
  const dist = conteo.map((c) => c / draws);
  const mean = dist.reduce((a, v, i) => a + v * i, 0);
  const acumGE = (n) => dist.slice(n).reduce((a, b) => a + b, 0); // P(>= n)
  let lo = 0, hi = dist.length - 1, acc = 0;
  for (let i = 0; i < dist.length; i++) { acc += dist[i]; if (acc >= 0.1) { lo = i; break; } }
  acc = 0;
  for (let i = dist.length - 1; i >= 0; i--) { acc += dist[i]; if (acc >= 0.1) { hi = i; break; } }
  return { dist, mean, acumGE, lo, hi };
}

/* ---------- Perspectiva (medidor de 7 tramos) ---------- */

/** Límites entre los 7 tramos del medidor, como probabilidad de que ocurra el desenlace. */
export const LIMITES_TRAMOS = [0.05, 0.20, 0.40, 0.60, 0.80, 0.95];
export const N_TRAMOS = LIMITES_TRAMOS.length + 1;

/** Tramo (0 a 6) que corresponde a la probabilidad `p` de un desenlace. */
export function tramoDeProb(p) {
  let i = 0;
  while (i < LIMITES_TRAMOS.length && p >= LIMITES_TRAMOS[i]) i++;
  return i;
}

/** Qué tan firme es la perspectiva según la probabilidad del desenlace más probable. */
export const NIVELES = [
  { min: 0.95, id: 'segura', etiqueta: 'Segura' },
  { min: 0.80, id: 'probable', etiqueta: 'Probable' },
  { min: 0.60, id: 'inclinada', etiqueta: 'Inclinada' },
  { min: 0, id: 'renida', etiqueta: 'Reñida' },
];

/** Nivel de firmeza de un desenlace con probabilidad `p` (el contrario tiene 1 − p). */
export function nivelDeProb(p) {
  const f = Math.max(p, 1 - p);
  return NIVELES.find((n) => f >= n.min);
}

/**
 * "N de 100" sin prometer certezas: ">99" o "<1" en los extremos.
 * @returns {string}
 */
export function deCien(p) {
  const n = p * 100;
  if (n >= 99.5) return '>99';
  if (n < 0.5) return '<1';
  return String(Math.round(n));
}

/* ---------- Promedio móvil de encuestas ---------- */

/**
 * Promedio móvil con núcleo gaussiano: el valor en el instante `t` es la media de
 * todos los sondeos, con peso decreciente según su distancia en el tiempo
 * (`anchoDias` es la desviación estándar del núcleo). Se evalúa cada `pasoDias`
 * entre el primer y el último sondeo. Con menos de `minPuntos` sondeos, o si todos
 * son de la misma fecha, devuelve [] porque una línea no diría nada.
 * @param {{t:number, v:number}[]} puntos  `t` en milisegundos
 * @returns {{t:number, v:number}[]}
 */
export function promedioMovil(puntos, { anchoDias = 30, pasoDias = 7, minPuntos = 3 } = {}) {
  if (puntos.length < minPuntos) return [];
  const orden = [...puntos].sort((a, b) => a.t - b.t);
  const t0 = orden[0].t;
  const t1 = orden[orden.length - 1].t;
  if (t1 === t0) return [];
  const h = anchoDias * DIA_MS;
  const instantes = [];
  for (let t = t0; t < t1; t += pasoDias * DIA_MS) instantes.push(t);
  instantes.push(t1);
  return instantes.map((t) => {
    let sw = 0, sv = 0;
    for (const p of orden) {
      const z = (p.t - t) / h;
      const w = Math.exp(-0.5 * z * z);
      sw += w; sv += w * p.v;
    }
    return { t, v: sv / sw };
  });
}
