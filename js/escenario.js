// ============================================================
// escenario.js — Simulador de escenarios ("Ajustar el resultado").
//
// El usuario mueve el voto de un partido en un estado: los demás
// (incluido "Otros") se reacomodan en proporción hasta sumar 100 %.
// Con el voto nuevo se recalcula la contienda (probabilidades,
// favorito, margen) y cada municipio se desplaza según el método
// elegido, de modo que su promedio ponderado reproduzca el voto
// del estado.
//
// Las partes puras (reajustarVoto, desplazarMunicipios) no tocan el
// DOM ni el store, para poder probarlas aparte.
// ============================================================

import { store } from './store.js';
import { pronosticoDe, resumenNacional } from './data.js';
import { clamp } from './utils.js';

export const METODOS = [
  { id: 'logit', nombre: 'Logit', ayuda: 'Un partido que ya tiene mucho voto en un municipio cambia menos que uno intermedio. Es el método por defecto.' },
  { id: 'proporcional', nombre: 'Proporcional', ayuda: 'Cada municipio cambia en la misma proporción: si el partido crece 10 % en el estado, crece 10 % en cada municipio.' },
  { id: 'uniforme', nombre: 'Puntos uniformes', ayuda: 'Cada municipio suma o pierde los mismos puntos porcentuales, sin importar su tamaño.' },
];

/* ============================================================
   Partes puras
   ============================================================ */

/** Escala un voto (en puntos) para que sume exactamente 100. */
function normalizar100(voto) {
  const claves = Object.keys(voto);
  const suma = claves.reduce((a, k) => a + voto[k], 0);
  if (suma <= 0) return Object.fromEntries(claves.map((k) => [k, 100 / (claves.length || 1)]));
  return Object.fromEntries(claves.map((k) => [k, (voto[k] * 100) / suma]));
}

/**
 * Fija el voto de `partido` en `valor` puntos; el resto se reacomoda en proporción
 * para que todo siga sumando 100. Si el resto estaba en cero, se reparte parejo.
 * @param {Object<string, number>} voto  voto por fuerza incluyendo "Otros", en puntos, suma 100
 */
export function reajustarVoto(voto, partido, valor) {
  const claves = Object.keys(voto);
  if (!claves.includes(partido) || !Number.isFinite(valor)) return { ...voto };
  const v = clamp(valor, 0, 100);
  const resto = claves.filter((k) => k !== partido);
  const sumaResto = resto.reduce((a, k) => a + voto[k], 0);
  return Object.fromEntries(claves.map((k) => {
    if (k === partido) return [k, v];
    if (sumaResto > 1e-9) return [k, (voto[k] * (100 - v)) / sumaResto];
    return [k, (100 - v) / resto.length];
  }));
}

const EPS = 1e-4;
const logit = (pp) => { const p = clamp(pp / 100, EPS, 1 - EPS); return Math.log(p / (1 - p)); };

/** Transformación de un voto municipal `s` (puntos) con el parámetro `th` del método. */
const TRANSFORMA = {
  logit: (s, th) => (s <= 0 ? 0 : 100 / (1 + Math.exp(-(logit(s) + th)))), // sin voto no hay a qué sumarle
  proporcional: (s, th) => s * th,
  uniforme: (s, th) => Math.max(0, s + th),
};
/** Parámetro inicial y corrección del parámetro, según el método, para llevar `de` hasta `a`. */
const AJUSTE = {
  logit: { ini: () => 0, paso: (de, a) => logit(a) - logit(de), suma: (th, d) => clamp(th + d, -12, 12) },
  proporcional: { ini: () => 1, paso: (de, a) => (de > 1e-6 ? a / de : 1), suma: (th, d) => clamp(th * d, 0, 100) },
  uniforme: { ini: () => 0, paso: (de, a) => a - de, suma: (th, d) => clamp(th + d, -100, 100) },
};

/**
 * Traslada el cambio de voto de un estado a sus municipios.
 *
 * El voto estatal pasa de `base` a `objetivo`. A la media municipal actual (ponderada
 * por `w`, normalmente la lista nominal) se le suma ese mismo cambio en puntos: esa es la
 * meta. Todos los municipios se mueven con el mismo parámetro por partido, según el
 * método, y el parámetro se afina hasta que la media ponderada alcance la meta. Así,
 * sin cambio la salida es idéntica a la entrada, y con cambio los municipios suman
 * lo que dicen los deslizadores.
 *
 * @param {{shares: Object<string, number>, w: number}[]} munis  voto municipal en puntos (suma 100)
 * @param {Object<string, number>} base      voto estatal original, en puntos
 * @param {Object<string, number>} objetivo  voto estatal del escenario, en puntos
 * @param {'logit'|'proporcional'|'uniforme'} metodo
 * @returns {Object<string, number>[]}  voto municipal nuevo, en el mismo orden
 */
export function desplazarMunicipios(munis, base, objetivo, metodo = 'logit') {
  const n = munis.length;
  if (!n) return [];
  const claves = [...new Set([...Object.keys(base), ...Object.keys(objetivo), ...munis.flatMap((m) => Object.keys(m.shares))])];

  const wTot = munis.reduce((a, m) => a + Math.max(0, m.w || 0), 0);
  const pesos = munis.map((m) => (wTot > 0 ? Math.max(0, m.w || 0) / wTot : 1 / n));
  const media = (lista) => Object.fromEntries(claves.map((k) => [k, lista.reduce((a, s, i) => a + pesos[i] * (s[k] || 0), 0)]));

  const m0 = media(munis.map((m) => m.shares));
  const meta = normalizar100(Object.fromEntries(claves.map((k) => [k, Math.max(0, m0[k] + ((objetivo[k] ?? 0) - (base[k] ?? 0)))])));

  // Un partido sin voto en ningún municipio no puede crecer por proporción ni por logit:
  // para ese partido se suman puntos.
  const metodoDe = (k) => (m0[k] < 0.05 && meta[k] > m0[k] + 0.05 ? 'uniforme' : metodo);
  const TK = (k) => TRANSFORMA[metodoDe(k)] || TRANSFORMA.logit;
  const AK = (k) => AJUSTE[metodoDe(k)] || AJUSTE.logit;

  const aplicar = (th) => munis.map((m) => normalizar100(Object.fromEntries(claves.map((k) => [k, TK(k)(m.shares[k] || 0, th[k])]))));
  const theta = Object.fromEntries(claves.map((k) => [k, AK(k).suma(AK(k).ini(), AK(k).paso(m0[k], meta[k]))]));
  let res = aplicar(theta);
  for (let i = 0; i < 80; i++) {
    const mm = media(res);
    let err = 0;
    for (const k of claves) err = Math.max(err, Math.abs(meta[k] - mm[k]));
    if (err < 0.02) break;
    for (const k of claves) theta[k] = AK(k).suma(theta[k], AK(k).paso(mm[k], meta[k]));
    res = aplicar(theta);
  }
  return res;
}

/* ============================================================
   Escenario activo (vive en el store; no se guarda al recargar)
   ============================================================ */

const act = () => store.escenario;
const emitir = () => window.dispatchEvent(new Event('mirador:escenario'));

/** Voto editable de un pronóstico: fuerzas + "Otros" (el resto), en puntos y sumando 100. */
export function votoEditable(pron) {
  const fuerzas = pron.votoPct;
  const suma = Object.values(fuerzas).reduce((a, b) => a + b, 0);
  return normalizar100({ ...fuerzas, Otros: Math.max(0, 100 - suma) });
}

const casiIguales = (a, b) => Object.keys(a).every((k) => Math.abs((a[k] ?? 0) - (b[k] ?? 0)) < 0.05);

/** Recalcula el pronóstico de un estado desde su voto de escenario (o restaura el original). */
function recalcular(e) {
  const vec = act().cambios[e.slug];
  if (!vec) { Object.assign(e, e.base); return; }
  // Se conserva el orden de las fuerzas del pronóstico base: la simulación depende de él.
  const votoPct = Object.fromEntries(Object.keys(e.base.votoPct).map((k) => [k, vec[k] ?? 0]));
  Object.assign(e, pronosticoDe(votoPct, e.sigma, { geo: e.geo, gob: e.gob, listaNominal: e.listaNominal }));
}

function refrescar() {
  store.resumen = resumenNacional(store.estados);
  document.body.classList.toggle('esc-activo', hayEscenario());
  emitir();
}

export const hayEscenario = () => Object.keys(act().cambios).length > 0;
export const cambioDe = (slug) => act().cambios[slug] || null;
export const metodoActual = () => act().metodo;
export const estadosModificados = () => store.estados.filter((e) => act().cambios[e.slug]);

/** Voto de escenario de un estado (o el original si no se ha tocado), en puntos. */
export const votoActual = (e) => act().cambios[e.slug] || votoEditable(e.base);

/** Mueve el voto de `partido` en el estado `slug`; los demás se reacomodan. */
export function fijarVoto(slug, partido, valor) {
  const e = store.porSlug[slug];
  if (!e) return;
  const nuevo = reajustarVoto(votoActual(e), partido, valor);
  if (casiIguales(nuevo, votoEditable(e.base))) delete act().cambios[slug];
  else act().cambios[slug] = nuevo;
  recalcular(e);
  refrescar();
}

export function restablecerEstado(slug) {
  const e = store.porSlug[slug];
  if (!e || !act().cambios[slug]) return;
  delete act().cambios[slug];
  recalcular(e);
  refrescar();
}

export function restablecerTodo() {
  if (!hayEscenario()) return;
  act().cambios = {};
  for (const e of store.estados) recalcular(e);
  refrescar();
}

export function fijarMetodo(id) {
  if (!METODOS.some((m) => m.id === id) || act().metodo === id) return;
  act().metodo = id;
  emitir();
}

/**
 * Voto nuevo de los municipios de un estado con escenario, o null si el estado no se
 * ha modificado. `munis`: [{ shares (puntos), w }] con el voto municipal original.
 */
export function aplicarAMunicipios(e, munis) {
  const vec = act().cambios[e.slug];
  if (!vec) return null;
  return desplazarMunicipios(munis, votoEditable(e.base), vec, act().metodo);
}

/** Resumen nacional del pronóstico original, para comparar con el escenario. */
export function resumenBase() {
  return resumenNacional(store.estados.map((e) => ({ ...e, ...e.base })));
}

/* ============================================================
   Escenarios guardados (localStorage)
   ============================================================ */

const LLAVE = 'mirador:escenarios:v1';
const MAX_GUARDADOS = 20;

/** Un voto guardado solo se acepta si coincide con las fuerzas del estado y suma ~100. */
function votoValido(e, vec) {
  if (!vec || typeof vec !== 'object') return false;
  const claves = [...Object.keys(e.base.votoPct), 'Otros'];
  if (Object.keys(vec).length !== claves.length || !claves.every((k) => Number.isFinite(vec[k]) && vec[k] >= 0 && vec[k] <= 100)) return false;
  return Math.abs(claves.reduce((a, k) => a + vec[k], 0) - 100) < 0.5;
}

export function listarGuardados() {
  try {
    const lista = JSON.parse(localStorage.getItem(LLAVE) || '[]');
    return Array.isArray(lista) ? lista.filter((g) => g && typeof g.id === 'string' && typeof g.nombre === 'string' && g.cambios) : [];
  } catch { return []; }
}

function escribirGuardados(lista) {
  try { localStorage.setItem(LLAVE, JSON.stringify(lista)); return true; } catch { return false; }
}

/** Guarda el escenario activo con un nombre. Devuelve el registro o null si no se pudo. */
export function guardarActual(nombre) {
  if (!hayEscenario()) return null;
  const limpio = String(nombre || '').trim().slice(0, 40) || `Escenario ${listarGuardados().length + 1}`;
  const reg = {
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    nombre: limpio,
    fecha: new Date().toISOString(),
    metodo: act().metodo,
    cambios: JSON.parse(JSON.stringify(act().cambios)),
  };
  const lista = [reg, ...listarGuardados()].slice(0, MAX_GUARDADOS);
  return escribirGuardados(lista) ? reg : null;
}

export function eliminarGuardado(id) {
  escribirGuardados(listarGuardados().filter((g) => g.id !== id));
}

/** Activa un escenario guardado. Descarta los estados cuyo voto ya no coincide con el modelo. */
export function cargarGuardado(id) {
  const reg = listarGuardados().find((g) => g.id === id);
  if (!reg) return false;
  const cambios = {};
  for (const [slug, vec] of Object.entries(reg.cambios)) {
    const e = store.porSlug[slug];
    if (e && votoValido(e, vec)) cambios[slug] = vec;
  }
  act().cambios = cambios;
  act().metodo = METODOS.some((m) => m.id === reg.metodo) ? reg.metodo : 'logit';
  for (const e of store.estados) recalcular(e);
  refrescar();
  return Object.keys(cambios).length > 0;
}
