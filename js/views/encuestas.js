// ============================================================
// views/encuestas.js — Encuestas: landing (preguntas) y detalle
// con gráfica de promedio ponderado + dispersión + banda 90%.
// ============================================================

import { store } from '../store.js';
import { construirEncuestas, encuestaPorId } from '../polls.js';
import { navigate } from '../router.js';
import { svgEl, clamp, pct } from '../utils.js';

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/* ---------- gráfica ---------- */
export function buildPollChart(q, opts = {}) {
  const w = opts.w || 820, h = opts.h || 420, mini = opts.mini;
  const padL = mini ? 4 : 40, padR = mini ? 4 : 96, padT = mini ? 4 : 16, padB = mini ? 4 : 26;
  const iw = w - padL - padR, ih = h - padT - padB;
  const svg = svgEl('svg', { class: 'pollchart' + (mini ? ' mini' : ''), viewBox: `0 0 ${w} ${h}`, preserveAspectRatio: 'none' });

  const t0 = q.serie[0].t.getTime();
  const t1 = q.serie[q.serie.length - 1].t.getTime();
  const X = (t) => padL + ((t - t0) / (t1 - t0)) * iw;

  // Rango vertical dinámico.
  let lo = 100, hi = 0;
  for (const s of q.serie) for (const o of q.opciones) { lo = Math.min(lo, s.band[o.id][0]); hi = Math.max(hi, s.band[o.id][1]); }
  lo = Math.max(0, Math.floor((lo - 3) / 10) * 10);
  hi = Math.min(100, Math.ceil((hi + 3) / 10) * 10);
  const Y = (v) => padT + ih - ((v - lo) / (hi - lo)) * ih;

  if (!mini) {
    for (let g = lo; g <= hi; g += 10) {
      svg.appendChild(svgEl('line', { class: 'pc-grid', x1: padL, y1: Y(g), x2: w - padR, y2: Y(g) }));
      const t = svgEl('text', { class: 'pc-glbl', x: 6, y: Y(g) + 3 }); t.textContent = g + '%'; svg.appendChild(t);
    }
    // Etiquetas de meses.
    let last = -1;
    for (const s of q.serie) {
      const m = s.t.getMonth();
      if (m !== last && m % 2 === 0) {
        last = m;
        const t = svgEl('text', { class: 'pc-xlbl', x: X(s.t.getTime()), y: h - 8 });
        t.textContent = MESES[m] + (m === 0 ? ` ${String(s.t.getFullYear()).slice(2)}` : '');
        svg.appendChild(t);
      }
    }
  }

  // Banda del 90% por opción.
  for (const o of q.opciones) {
    const top = q.serie.map((s) => `${X(s.t.getTime()).toFixed(1)},${Y(s.band[o.id][1]).toFixed(1)}`);
    const bot = q.serie.map((s) => `${X(s.t.getTime()).toFixed(1)},${Y(s.band[o.id][0]).toFixed(1)}`).reverse();
    svg.appendChild(svgEl('path', { d: `M${top.join(' L')} L${bot.join(' L')} Z`, fill: o.color, opacity: mini ? 0.1 : 0.13, stroke: 'none' }));
  }

  // Dispersión de encuestas individuales.
  if (!mini) {
    for (const d of q.dots) for (const o of q.opciones)
      svg.appendChild(svgEl('circle', { cx: X(d.t.getTime()).toFixed(1), cy: Y(d.v[o.id]).toFixed(1), r: 2.4, fill: o.color, opacity: 0.22 }));
  }

  // Promedio (línea) + punto final + etiqueta AHORA.
  for (const o of q.opciones) {
    const dd = q.serie.map((s, i) => `${i === 0 ? 'M' : 'L'}${X(s.t.getTime()).toFixed(1)},${Y(s.v[o.id]).toFixed(1)}`).join(' ');
    svg.appendChild(svgEl('path', { d: dd, fill: 'none', stroke: o.color, 'stroke-width': mini ? 1.8 : 2.6, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    if (!mini) {
      const last = q.serie[q.serie.length - 1];
      const y = Y(last.v[o.id]);
      svg.appendChild(svgEl('circle', { cx: X(t1), cy: y, r: 3.6, fill: o.color }));
      const lbl = svgEl('text', { class: 'pc-now', x: X(t1) + 8, y: y + 4, fill: o.color });
      lbl.textContent = `${o.label.split(' ')[0]} ${Math.round(last.v[o.id])}%`;
      svg.appendChild(lbl);
    }
  }
  return svg;
}

/* ---------- topline ---------- */
function toplineChips(q) {
  const entries = q.opciones.map((o) => ({ o, v: q.topline[o.id] })).sort((a, b) => b.v - a.v);
  return entries.map(({ o, v }) => `
    <div class="tl-chip" style="--c:${o.color}">
      <span class="tl-v">${Math.round(v)}%</span>
      <span class="tl-l">${o.label}</span>
    </div>`).join('');
}

/* ---------- landing ---------- */
export function render(root) {
  const qs = construirEncuestas();
  root.innerHTML = `
  <section class="enc-hero">
    <p class="eyebrow">Encuestas · <span class="ficticio">datos ficticios</span></p>
    <h1 class="enc-h">El pulso de las encuestas</h1>
    <p class="enc-sub">Promedios ponderados por recencia y calidad de la casa encuestadora. Cada punto es una encuesta; la línea es el promedio y la banda incluye el 90% de los sondeos.</p>
  </section>
  <section class="enc-grid" id="encGrid"></section>
  <section class="enc-states">
    <div class="section-head"><h2>Intención de voto por estado</h2>
      <span class="side-note">17 gubernaturas</span></div>
    <div class="enc-state-list" id="encStates"></div>
  </section>`;

  root.querySelector('#encGrid').innerHTML = qs.map((q) => `
    <article class="enc-card ${q.destacada ? 'big' : ''}" data-id="${q.id}" tabindex="0">
      <div class="ec-top"><h3>${q.titulo}</h3></div>
      <div class="ec-chart" id="mini-${q.id}"></div>
      <div class="ec-topline">${toplineChips(q)}</div>
      <span class="ec-go">ver análisis →</span>
    </article>`).join('');
  for (const q of qs) root.querySelector(`#mini-${q.id}`).appendChild(buildPollChart(q, { w: 380, h: 96, mini: true }));

  root.querySelectorAll('.enc-card').forEach((c) =>
    c.addEventListener('click', () => navigate('/encuestas/' + c.dataset.id)));

  // Lista por estado (enlaza al detalle de estado, que ya trae encuestas).
  const arr = [...store.estados].sort((a, b) => b.probFav - a.probFav);
  root.querySelector('#encStates').innerHTML = arr.map((e) => `
    <button class="es-row" data-slug="${e.slug}">
      <span class="es-name">${e.nombre}</span>
      <span class="es-lead">${e.favorito} <b>${pct(Object.values(e.voto).sort((a,b)=>b-a)[0])}</b></span>
    </button>`).join('');
  root.querySelector('#encStates').addEventListener('click', (e) => {
    const b = e.target.closest('.es-row'); if (b) navigate('/estado/' + b.dataset.slug);
  });
}

/* ---------- detalle ---------- */
export function renderDetail(root, id) {
  const q = encuestaPorId(id);
  if (!q) { root.innerHTML = `<section class="empty"><p>No se encontró la encuesta.</p><a class="see-all" href="#/encuestas">← volver</a></section>`; return; }

  root.innerHTML = `
  <section class="enc-detail">
    <a class="back" href="#/encuestas">← todas las encuestas</a>
    <header class="ed-head">
      <h1 class="ed-title">${q.titulo}</h1>
      <p class="ed-sub">${q.subtitulo}</p>
    </header>
    <div class="ed-topline">${toplineChips(q)}</div>
    <div class="ed-chartwrap">
      <span class="enop" title="Número efectivo de encuestas ponderadas (ficticio)">ENOP ${q.enop}</span>
      <span class="ed-now-tag">La banda incluye el 90% de los sondeos</span>
      <div id="edChart"></div>
    </div>
    <div class="ed-legend" id="edLegend"></div>
    <p class="ed-foot"><span class="ficticio">Encuestas ficticias de demostración.</span> ${q.dots.length} sondeos simulados de casas ficticias.</p>
  </section>`;

  root.querySelector('#edChart').appendChild(buildPollChart(q, { w: 900, h: 460 }));
  root.querySelector('#edLegend').innerHTML = q.opciones.map((o) =>
    `<span class="edl-item"><span class="pdot" style="background:${o.color}"></span>${o.label}</span>`).join('');
}
