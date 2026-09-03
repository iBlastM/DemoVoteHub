// ============================================================
// utils.js — Utilidades: normalización, formato, RNG con semilla.
// ============================================================

/** Normaliza un nombre a slug: minúsculas, sin acentos, con guiones. */
export function slugify(str) {
  return String(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Formatea una proporción 0–1 como porcentaje entero: 0.623 -> "62%". */
export function pct(x, dec = 0) {
  return `${(x * 100).toFixed(dec)}%`;
}

/** Formatea una cantidad de personas o votos con separadores de miles mexicanos. */
export function fmtNum(x) {
  return Number(x || 0).toLocaleString('es-MX');
}

/** Formatea un margen con signo: 6.2 -> "+6.2". */
export function signed(x, dec = 1) {
  const s = x >= 0 ? '+' : '−';
  return `${s}${Math.abs(x).toFixed(dec)}`;
}

/** Generador pseudoaleatorio determinista (mulberry32). */
export function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Semilla numérica estable a partir de una cadena. */
export function seedFrom(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Interpolación de easing (cubic out) para animaciones. */
export function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

/** Días restantes hasta una fecha (entero, mínimo 0). */
export function daysUntil(date) {
  const ms = date.getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86400000));
}

/** Clamp de un número entre min y max. */
export function clamp(x, min, max) {
  return Math.min(max, Math.max(min, x));
}

/** Formatea una fecha ISO corta: "12 may". */
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export function fechaCorta(d) {
  const dt = d instanceof Date ? d : new Date(d);
  return `${dt.getDate()} ${MESES[dt.getMonth()]}`;
}

/** Crea un elemento SVG con atributos. */
export function svgEl(tag, attrs = {}) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

/** Animación de conteo numérico (para grandes cifras del hero). */
export function animateCount(node, to, { dur = 900, suffix = '', dec = 0 } = {}) {
  const start = performance.now();
  function frame(now) {
    const t = clamp((now - start) / dur, 0, 1);
    const v = to * easeOutCubic(t);
    node.textContent = v.toFixed(dec) + suffix;
    if (t < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
