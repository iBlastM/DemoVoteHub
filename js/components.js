// ============================================================
// components.js — Componentes de UI reutilizables (HTML + SVG).
// ============================================================

import { PARTIES } from './config.js';
import { pct, fechaLarga, fmtNum, svgEl, esc } from './utils.js';
import { promedioMovil, DIA_MS } from './stats.js';

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
 * Chip de partido con logotipo: fondo claro del color del partido
 * (se adapta al tema claro/oscuro) y la imagen centrada.
 */
export function partyLogo(id, size = 'md') {
  const p = PARTIES[id];
  if (!p) return `<span class="chip">${id}</span>`;
  if (!p.logo) return `<span class="chip" style="background:${p.color};color:${p.tinta}">${p.nombre}</span>`;
  return `<span class="plogo plogo-${size}" style="--pc:${p.color}" title="${p.nombre}"><img src="${p.logo}" alt="${p.nombre}"></span>`;
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

/** Barras de apoyo potencial sobre la lista nominal (vertical mini). */
export function voteBars(estado) {
  const entries = Object.entries(estado.voto)
    .filter(([k]) => k !== 'Otros')
    .sort((a, b) => b[1] - a[1]);
  const max = Math.max(...entries.map(([, v]) => v));
  let html = '<div class="vbars">';
  for (const [id, v] of entries) {
    const p = PARTIES[id];
    const estimado = estado.votantesEstimados?.[id];
    const etiqueta = Number.isFinite(estimado) ? fmtNum(estimado) : pct(v);
    const titulo = Number.isFinite(estimado)
      ? `${p ? p.nombre : id}: ${etiqueta} personas estimadas sobre la lista nominal`
      : `${p ? p.nombre : id}: ${pct(v)}`;
    html += `<div class="vbar" title="${titulo}">
      <div class="vbar-col"><span class="vbar-fill" style="height:${(v / max) * 100}%;background:${p ? p.color : '#bbb'}"></span></div>
      <span class="vbar-val">${etiqueta}</span>
      <span class="vbar-lbl">${partyLogo(id, 'xs')}</span>
    </div>`;
  }
  return html + '</div>';
}

/** Etiqueta de estatus (segura/probable/inclinada/reñida). */
export function statusTag(estado) {
  return `<span class="status status-${estado.estatus.id}">${estado.estatus.label}</span>`;
}

/* ============================================================
   Encuestas reales de un estado: nube de sondeos + promedio móvil
   ============================================================ */

const MES_ABR = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const fmt1 = (v) => (Number.isFinite(v) ? `${v.toFixed(1)}%` : '—');

/**
 * Explorador de las encuestas publicadas de un estado.
 *  · Cada punto es un sondeo tal como lo publicó la casa (sin ajustes).
 *  · La línea es un promedio móvil y solo aparece con 3 o más sondeos del partido.
 *  · El anillo es la estimación del modelo (tendencia Kalman) al corte de datos.
 *  · Un clic en un partido lo oculta y la escala se ajusta a los que quedan.
 * Si el estado no tiene sondeos desagregados, lo dice en vez de inventar una serie.
 * @returns {HTMLElement}
 */
export function pollsExplorer(estado) {
  const wrap = document.createElement('div');
  wrap.className = 'pe';
  const polls = estado.encuestasSonReales ? estado.encuestas : [];
  const forces = estado.tendencia.forces;
  const agreg = estado.encuestasPorPartido || {};

  if (!polls.length) {
    wrap.innerHTML = `<p class="pe-empty">Esta entidad no tiene sondeos publicados con desglose por partido en el corte actual.
      El pronóstico usa el promedio de las encuestas disponibles; no se dibuja una serie para no inventar una tendencia.</p>`;
    return wrap;
  }

  const corteT = estado.actualizado ? new Date(estado.actualizado + 'T00:00:00').getTime() : NaN;
  const corteMs = Number.isFinite(corteT) ? corteT : null;
  const series = Object.fromEntries(forces.map((f) => [f,
    polls.filter((s) => Number.isFinite(s.shares[f])).map((s) => ({ t: s.fecha.getTime(), v: s.shares[f], s }))]));
  const lineas = Object.fromEntries(forces.map((f) => [f, promedioMovil(series[f])]));
  const modelo = Object.fromEntries(forces.map((f) => [f, agreg[f]?.tendencia]));

  // Dominio del tiempo: fijo, no cambia al ocultar partidos.
  const fechas = polls.map((s) => s.fecha.getTime());
  let tMin = Math.min(...fechas);
  let tMax = Math.max(...fechas, corteMs ?? -Infinity);
  const spanMin = 120 * DIA_MS;
  if (tMax - tMin < spanMin) { const mid = (tMin + tMax) / 2; tMin = mid - spanMin / 2; tMax = mid + spanMin / 2; }
  tMin -= 14 * DIA_MS; tMax += 14 * DIA_MS;

  const W = 860, H = 360, padL = 46, padR = 24, padT = 16, padB = 34;
  const iw = W - padL - padR, ih = H - padT - padB;
  const X = (t) => padL + ((t - tMin) / (tMax - tMin)) * iw;

  const on = new Set(forces);
  const tips = [];

  /* ---- leyenda interactiva ---- */
  const keys = document.createElement('div');
  keys.className = 'pe-keys';
  keys.setAttribute('role', 'group');
  keys.setAttribute('aria-label', 'Partidos en la gráfica');
  keys.innerHTML = forces.map((f) => {
    const p = PARTIES[f];
    return `<button type="button" class="pe-key" data-f="${f}" aria-pressed="true" style="--c:${p ? p.color : '#999'}"
      title="Mostrar u ocultar ${p ? p.nombre : f}">${partyLogo(f, 'xs')}<b>${fmt1(modelo[f])}</b><span class="pe-key-n">${series[f].length} ${series[f].length === 1 ? 'sondeo' : 'sondeos'}</span></button>`;
  }).join('');
  wrap.appendChild(keys);

  /* ---- gráfica ---- */
  const box = document.createElement('div');
  box.className = 'pe-chart';
  const svg = svgEl('svg', {
    class: 'pe-svg', viewBox: `0 0 ${W} ${H}`, role: 'img',
    'aria-label': `Encuestas publicadas en ${estado.nombre}: ${polls.length} sondeos entre ${fechaLarga(new Date(Math.min(...fechas)))} y ${fechaLarga(new Date(Math.max(...fechas)))}. Los mismos datos están en la tabla de abajo.`,
  });
  const tip = document.createElement('div');
  tip.className = 'pe-tip';
  tip.hidden = true;
  box.append(svg, tip);
  wrap.appendChild(box);

  function draw() {
    svg.replaceChildren();
    tips.length = 0;
    const vis = forces.filter((f) => on.has(f));
    const vals = vis.flatMap((f) => [...series[f].map((p) => p.v), ...(Number.isFinite(modelo[f]) ? [modelo[f]] : [])]);
    const lo = vals.length ? Math.max(0, Math.floor((Math.min(...vals) - 4) / 10) * 10) : 0;
    const hi = vals.length ? Math.min(100, Math.ceil((Math.max(...vals) + 4) / 10) * 10) : 50;
    const Y = (v) => padT + ih - ((v - lo) / (hi - lo)) * ih;
    const stepY = hi - lo > 60 ? 20 : 10;

    for (let g = lo; g <= hi; g += stepY) {
      svg.appendChild(svgEl('line', { class: 'pe-grid', x1: padL, y1: Y(g), x2: W - padR, y2: Y(g) }));
      const t = svgEl('text', { class: 'pe-lbl', x: padL - 8, y: Y(g) + 3, 'text-anchor': 'end' });
      t.textContent = `${g}%`;
      svg.appendChild(t);
    }

    // Meses en el eje X (a lo más ~9 etiquetas).
    const marcas = [];
    const d0 = new Date(tMin);
    for (let k = 1; ; k++) {
      const d = new Date(d0.getFullYear(), d0.getMonth() + k, 1);
      if (d.getTime() > tMax) break;
      marcas.push(d);
    }
    const salto = Math.max(1, Math.ceil(marcas.length / 9));
    marcas.forEach((d, i) => {
      if (i % salto !== 0) return;
      svg.appendChild(svgEl('line', { class: 'pe-tick', x1: X(d.getTime()), y1: padT + ih, x2: X(d.getTime()), y2: padT + ih + 4 }));
      const t = svgEl('text', { class: 'pe-lbl', x: X(d.getTime()), y: H - 12, 'text-anchor': 'middle' });
      t.textContent = i === 0 || d.getMonth() === 0 ? `${MES_ABR[d.getMonth()]} ${d.getFullYear()}` : MES_ABR[d.getMonth()];
      svg.appendChild(t);
    });

    if (!vis.length) return;

    // Promedio móvil (debajo de los puntos).
    for (const f of vis) {
      const ln = lineas[f];
      if (ln.length < 2) continue;
      const d = ln.map((p, i) => `${i === 0 ? 'M' : 'L'}${X(p.t).toFixed(1)},${Y(p.v).toFixed(1)}`).join(' ');
      svg.appendChild(svgEl('path', { class: 'pe-line', d, stroke: PARTIES[f]?.color || '#999' }));
    }
    // Sondeos.
    for (const f of vis) {
      for (const p of series[f]) {
        const c = svgEl('circle', { class: 'pe-dot', cx: X(p.t).toFixed(1), cy: Y(p.v).toFixed(1), r: 4.5, fill: PARTIES[f]?.color || '#999', 'data-tip': tips.length });
        tips.push({ titulo: p.s.casa, fecha: fechaLarga(p.s.fecha), linea: `${PARTIES[f]?.nombre || f}: ${p.v.toFixed(1)}%`, extra: [p.s.tipo ? `resultado ${p.s.tipo}` : '', p.s.n ? `muestra ${fmtNum(p.s.n)}` : ''].filter(Boolean).join(' · ') });
        svg.appendChild(c);
      }
    }
    // Anillo del modelo al corte.
    if (corteMs != null) {
      for (const f of vis) {
        const v = modelo[f];
        if (!Number.isFinite(v)) continue;
        const c = svgEl('circle', { class: 'pe-ring', cx: X(corteMs).toFixed(1), cy: Y(v).toFixed(1), r: 7, stroke: PARTIES[f]?.color || '#999', 'data-tip': tips.length });
        tips.push({ titulo: 'Estimación del modelo', fecha: `corte ${fechaLarga(new Date(corteMs))}`, linea: `${PARTIES[f]?.nombre || f}: ${v.toFixed(1)}%`, extra: 'tendencia Kalman de todas las encuestas' });
        svg.appendChild(c);
      }
    }
  }

  /* ---- interacción ---- */
  keys.addEventListener('click', (ev) => {
    const b = ev.target.closest('.pe-key');
    if (!b) return;
    const f = b.dataset.f;
    if (on.has(f)) { if (on.size === 1) return; on.delete(f); } else on.add(f); // siempre queda al menos uno
    b.setAttribute('aria-pressed', String(on.has(f)));
    tip.hidden = true;
    draw();
  });

  function mostrarTip(ev) {
    const el = ev.target instanceof Element ? ev.target.closest('[data-tip]') : null;
    const info = el ? tips[Number(el.dataset.tip)] : null;
    if (!info) { tip.hidden = true; return; }
    tip.replaceChildren();
    const add = (cls, txt) => { if (!txt) return; const s = document.createElement('span'); s.className = cls; s.textContent = txt; tip.appendChild(s); };
    add('pe-tip-t', info.titulo); add('pe-tip-d', info.fecha); add('pe-tip-v', info.linea); add('pe-tip-x', info.extra);
    tip.hidden = false;
    const r = box.getBoundingClientRect();
    let x = ev.clientX - r.left + 14;
    if (x + tip.offsetWidth > r.width) x = ev.clientX - r.left - tip.offsetWidth - 14;
    tip.style.transform = `translate(${Math.max(0, x)}px, ${Math.max(0, ev.clientY - r.top + 14)}px)`;
  }
  svg.addEventListener('pointermove', mostrarTip);
  svg.addEventListener('pointerdown', mostrarTip);
  svg.addEventListener('pointerleave', () => { tip.hidden = true; });

  draw();

  /* ---- resumen del promedio ---- */
  const filas = forces.map((f) => {
    const vals = series[f].map((p) => p.v);
    const simple = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : NaN;
    const a = agreg[f];
    return `<tr><th scope="row">${partyLogo(f, 'xs')}</th><td>${fmt1(simple)}</td><td>${fmt1(a?.promedio)}</td>
      <td><b>${fmt1(a?.tendencia)}</b></td><td>${a ? `${a.min.toFixed(1)} – ${a.max.toFixed(1)}` : '—'}</td><td>${a?.nEncuestas ?? '—'}</td></tr>`;
  }).join('');
  const resumen = document.createElement('div');
  resumen.className = 'survey-wrap';
  resumen.innerHTML = `<table class="survey pe-sum"><thead><tr><th scope="col">Partido</th>
    <th scope="col" title="Media de los sondeos de la gráfica, sin ponderar">Promedio simple</th>
    <th scope="col" title="Promedio ponderado por recencia, muestra y calidad de la casa">Promedio ponderado</th>
    <th scope="col" title="Promedio ponderado suavizado con filtro Kalman: es la cifra del pronóstico">Tendencia (modelo)</th>
    <th scope="col">Rango publicado</th><th scope="col" title="Sondeos que entran al promedio">Sondeos</th></tr></thead><tbody>${filas}</tbody></table>`;
  wrap.appendChild(resumen);

  const nota = document.createElement('p');
  nota.className = 'panel-note';
  nota.textContent = 'Cada punto es un sondeo tal como lo publicó la casa encuestadora (resultado bruto o efectivo, sin ajustes). La línea es un promedio móvil suavizado de unos 30 días y solo aparece cuando el partido tiene 3 o más sondeos. El anillo es la estimación del modelo al corte de datos. Toca un partido para ocultarlo y la escala se ajusta.';
  wrap.appendChild(nota);
  return wrap;
}

/** Tabla de encuestas del ciclo. */
export function surveyTable(estado) {
  const forces = estado.tendencia.forces;
  let head = '<tr><th>Casa</th><th>Fecha</th><th>n</th>';
  for (const f of forces) head += `<th>${partyLogo(f, 'xs')}</th>`;
  head += '</tr>';
  let rows = '';
  for (const s of estado.encuestas) {
    const casa = s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer" title="Ver la publicación original">${esc(s.casa)}</a>` : esc(s.casa);
    rows += `<tr><td class="st-casa">${casa}</td><td>${fechaLarga(s.fecha)}</td><td class="st-n">${s.n ?? '—'}</td>`;
    for (const f of forces) rows += `<td class="st-val">${Number.isFinite(s.shares[f]) ? fmt1(s.shares[f]) : '—'}</td>`;
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
