// ============================================================
// polls.js — Encuestas ficticias: preguntas con serie temporal,
// encuestas individuales (dispersión), banda del 90% y topline.
// Estilo "promedio ponderado en el tiempo" tipo VoteHub.
// ============================================================

import { rng, seedFrom, clamp } from './utils.js';
import { PARTIES } from './config.js';

const CASAS = ['Enkoll', 'Buendía & Márquez', 'De las Heras', 'Massive Caller', 'C&E', 'Parametría', 'Mitofsky', 'El Financiero', 'Reforma'];
const INICIO = new Date('2026-01-01');
const FIN = new Date('2027-06-01');
const DUR = FIN - INICIO;

function gauss(u) {
  const a = Math.max(1e-9, u());
  const b = u();
  return Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * b);
}

/**
 * Genera una pregunta: serie semanal (promedio + banda 90%) y nube de
 * encuestas individuales alrededor del promedio.
 * @param spec { id, titulo, subtitulo, tipo, opciones:[{id,label,color}],
 *              fin:{id:val}, drift:{id:val}, vol }
 */
function generarPregunta(spec) {
  const u = rng(seedFrom(spec.id));
  const semanas = 74;
  const serie = [];
  // Valores de arranque = fin + drift (desplazamiento histórico).
  const arranque = {};
  for (const o of spec.opciones) arranque[o.id] = spec.fin[o.id] + (spec.drift[o.id] || 0);

  for (let i = 0; i < semanas; i++) {
    const t = i / (semanas - 1);
    const fecha = new Date(INICIO.getTime() + DUR * t);
    const v = {};
    const band = {};
    // Ondulación suave compartida para dar textura realista.
    const wobble = Math.sin(t * Math.PI * 3 + spec.id.length) * 1.4;
    for (const o of spec.opciones) {
      const base = arranque[o.id] * (1 - t) + spec.fin[o.id] * t;
      const val = clamp(base + wobble * (o.id === spec.opciones[0].id ? 1 : -0.6) + (u() - 0.5) * 1.3, 1, 92);
      v[o.id] = val;
      // Banda del 90%: más ancha hacia el pasado.
      const half = (spec.vol || 3) * (1 + (1 - t) * 0.7);
      band[o.id] = [clamp(val - half, 0, 100), clamp(val + half, 0, 100)];
    }
    serie.push({ t: fecha, v, band });
  }

  // Encuestas individuales (dispersión) alrededor del promedio semanal.
  const dots = [];
  const nDots = 120;
  for (let i = 0; i < nDots; i++) {
    const t = u();
    const fecha = new Date(INICIO.getTime() + DUR * t);
    const si = Math.min(serie.length - 1, Math.floor(t * (serie.length - 1)));
    const ref = serie[si].v;
    const v = {};
    for (const o of spec.opciones) v[o.id] = clamp(ref[o.id] + gauss(u) * (spec.vol || 3), 0, 95);
    dots.push({ t: fecha, casa: CASAS[Math.floor(u() * CASAS.length)], n: 500 + Math.floor(u() * 1200), v });
  }
  dots.sort((a, b) => a.t - b.t);

  const topline = serie[serie.length - 1].v;
  // ENOP ficticio (número efectivo de encuestas ponderadas).
  const enop = (6 + u() * 6).toFixed(2);
  return { ...spec, serie, dots, topline, enop };
}

// Colores de opción reutilizando la identidad.
const C = {
  aprueba: '#1E9E5A', desaprueba: '#D5007F',
  bien: '#0A5CA8', mal: '#C1272D', ni: '#98a2b3',
};

const SPECS = [
  {
    id: 'gob-nacional',
    titulo: 'Si hoy fueran las elecciones, ¿por qué partido votarías para gobernador?',
    subtitulo: 'Promedio ponderado de encuestas en los 17 estados con elección.',
    tipo: 'multi', destacada: true,
    opciones: [
      { id: 'MORENA', label: 'Morena', color: PARTIES.MORENA.color },
      { id: 'PAN', label: 'PAN', color: PARTIES.PAN.color },
      { id: 'MC', label: 'Movimiento Ciudadano', color: PARTIES.MC.color },
      { id: 'PRI', label: 'PRI', color: PARTIES.PRI.color },
    ],
    fin: { MORENA: 45, PAN: 31, MC: 13, PRI: 8 },
    drift: { MORENA: -6, PAN: 5, MC: 1, PRI: 3 },
    vol: 3.2,
  },
  {
    id: 'aprobacion',
    titulo: '¿Aprueba el trabajo de la Presidenta?',
    subtitulo: 'Promedio, ponderado por recencia y calidad de la casa encuestadora.',
    tipo: 'dual', destacada: true,
    opciones: [
      { id: 'aprueba', label: 'Aprueba', color: C.aprueba },
      { id: 'desaprueba', label: 'Desaprueba', color: C.desaprueba },
    ],
    fin: { aprueba: 61, desaprueba: 35 },
    drift: { aprueba: 8, desaprueba: -8 },
    vol: 2.6,
  },
  {
    id: 'rumbo',
    titulo: '¿El país va por buen camino?',
    subtitulo: 'Percepción sobre la dirección general del país.',
    tipo: 'dual', destacada: true,
    opciones: [
      { id: 'bien', label: 'Buen camino', color: C.bien },
      { id: 'mal', label: 'Rumbo equivocado', color: C.mal },
    ],
    fin: { bien: 52, mal: 42 },
    drift: { bien: -3, mal: 3 },
    vol: 3.0,
  },
  {
    id: 'preferencia',
    titulo: '¿Qué partido representa mejor tus valores?',
    subtitulo: 'Identificación partidista declarada.',
    tipo: 'multi',
    opciones: [
      { id: 'MORENA', label: 'Morena', color: PARTIES.MORENA.color },
      { id: 'PAN', label: 'PAN', color: PARTIES.PAN.color },
      { id: 'MC', label: 'Movimiento Ciudadano', color: PARTIES.MC.color },
      { id: 'PRI', label: 'PRI', color: PARTIES.PRI.color },
    ],
    fin: { MORENA: 42, PAN: 27, MC: 15, PRI: 11 },
    drift: { MORENA: -4, PAN: 3, MC: 2, PRI: 2 },
    vol: 3.0,
  },
];

let _cache = null;
export function construirEncuestas() {
  if (_cache) return _cache;
  _cache = SPECS.map(generarPregunta);
  return _cache;
}

export function encuestaPorId(id) {
  return construirEncuestas().find((q) => q.id === id);
}
