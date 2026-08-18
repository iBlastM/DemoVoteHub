// ============================================================
// components.js — Componentes de UI reutilizables (HTML + SVG).
// ============================================================

import { PARTIES } from './config.js';
import { pct, signed, fechaCorta, svgEl, clamp } from './utils.js';

/** Chip de partido. */
export function chip(id, { soft = false } = {}) {
  const p = PARTIES[id];
  if (!p) return `<span class="chip">${id}</span>`;
  if (soft) return `<span class="chip chip-soft" style="--c:${p.color}">${p.nombre}</span>`;
  return `<span class="chip" style="background:${p.color};color:${p.tinta}">${p.nombre}</span>`;
}

/** Punto de color de partido. */
export function dot(id) {
  const p = PARTIES[id];
  return `<span class="pdot" style="background:${p ? p.color : '#999'}"></span>`;
}

/**
 * Barra de probabilidad apilada (fuerzas ordenadas de mayor a menor).
 * Muestra la probabilidad de victoria de cada fuerza en la contienda.
 */
export function probBar(estado) {
  const entries = Object.entries(estado.prob).sort((a, b) => b[1] - a[1]);
  let segs = '';
  for (const [id, v] of entries) {
    if (v < 0.005) continue;
    const p = PARTIES[id];
    segs += `<span class="pb-seg" style="width:${v * 100}%;background:${p ? p.color : '#bbb'}"
      title="${p ? p.nombre : id}: ${pct(v)}"></span>`;
  }
  return `<span class="pb">${segs}</span>`;
}

/** Barras de proyección de voto (vertical mini). */
export function voteBars(estado) {
  const entries = Object.entries(estado.voto)
    .filter(([k]) => k !== 'Otros')
    .sort((a, b) => b[1] - a[1]);
  const max = Math.max(...entries.map(([, v]) => v));
  let html = '<div class="vbars">';
  for (const [id, v] of entries) {
    const p = PARTIES[id];
    html += `<div class="vbar">
      <div class="vbar-col"><span class="vbar-fill" style="height:${(v / max) * 100}%;background:${p ? p.color : '#bbb'}"></span></div>
      <span class="vbar-val">${pct(v)}</span>
      <span class="vbar-lbl">${p ? p.nombre.split(' ')[0] : id}</span>
    </div>`;
  }
  return html + '</div>';
}

/** Etiqueta de estatus (segura/probable/inclinada/reñida). */
export function statusTag(estado) {
  return `<span class="status status-${estado.estatus.id}">${estado.estatus.label}</span>`;
}

/**
 * Gráfica de tendencia (líneas) como elemento SVG.
 * @returns {SVGElement}
 */
export function trendChart(estado, { w = 640, h = 260 } = {}) {
  const { forces, puntos } = estado.tendencia;
  const svg = svgEl('svg', { class: 'trend', viewBox: `0 0 ${w} ${h}`, preserveAspectRatio: 'none' });
  const padL = 34, padR = 12, padT = 16, padB = 26;
  const iw = w - padL - padR, ih = h - padT - padB;
  const vals = puntos.flatMap((p) => forces.map((f) => p[f]));
  const maxV = Math.min(75, Math.ceil((Math.max(...vals) + 5) / 10) * 10);
  const minV = Math.max(0, Math.floor((Math.min(...vals) - 5) / 10) * 10);
  const x = (i) => padL + (i / (puntos.length - 1)) * iw;
  const y = (v) => padT + ih - ((v - minV) / (maxV - minV)) * ih;

  // Rejilla horizontal.
  for (let g = minV; g <= maxV; g += 10) {
    svg.appendChild(svgEl('line', { class: 'grid', x1: padL, y1: y(g), x2: w - padR, y2: y(g) }));
    const t = svgEl('text', { class: 'grid-lbl', x: 4, y: y(g) + 3 });
    t.textContent = g + '%';
    svg.appendChild(t);
  }
  // Líneas por fuerza.
  forces.forEach((f) => {
    const p = PARTIES[f];
    const d = puntos.map((pt, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(pt[f]).toFixed(1)}`).join(' ');
    const path = svgEl('path', { d, fill: 'none', stroke: p ? p.color : '#999', 'stroke-width': 2.4, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' });
    svg.appendChild(path);
    const last = puntos[puntos.length - 1];
    svg.appendChild(svgEl('circle', { cx: x(puntos.length - 1), cy: y(last[f]), r: 3.2, fill: p ? p.color : '#999' }));
  });
  return svg;
}

/** Tabla de encuestas del ciclo. */
export function surveyTable(estado) {
  const forces = estado.tendencia.forces;
  let head = '<tr><th>Casa</th><th>Fecha</th><th>n</th>';
  for (const f of forces) head += `<th>${dot(f)}${PARTIES[f] ? PARTIES[f].nombre.split(' ')[0] : f}</th>`;
  head += '</tr>';
  let rows = '';
  for (const s of estado.encuestas) {
    rows += `<tr><td class="st-casa">${s.casa}</td><td>${fechaCorta(s.fecha)}</td><td class="st-n">${s.n}</td>`;
    for (const f of forces) rows += `<td class="st-val">${pct((s.shares[f] || 0) / 100)}</td>`;
    rows += '</tr>';
  }
  return `<table class="survey"><thead>${head}</thead><tbody>${rows}</tbody></table>`;
}

/** Barra horizontal de una sola fuerza (para tarjetas). */
export function odds(estado) {
  const p = PARTIES[estado.favorito];
  return `<div class="odds">
    <div class="odds-bar"><span style="width:${estado.probFav * 100}%;background:${p ? p.color : '#999'}"></span></div>
    <span class="odds-val">${pct(estado.probFav)}</span>
  </div>`;
}
