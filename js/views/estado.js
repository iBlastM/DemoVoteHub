// ============================================================
// views/estado.js — Detalle de una gubernatura.
// ============================================================

import { store } from '../store.js';
import { PARTIES } from '../config.js';
import { navigate } from '../router.js';
import { partyLogo, voteBars, statusTag, trendChart, surveyTable } from '../components.js';
import { pct, signed } from '../utils.js';

export function render(root, slug) {
  const e = store.porSlug[slug];
  if (!e) {
    root.innerHTML = `<section class="empty"><p>No se encontró la gubernatura.</p>
      <a href="#/dominio" class="see-all">← volver al mapa</a></section>`;
    return;
  }
  const fav = PARTIES[e.favorito];
  const gob = PARTIES[e.gob];

  const probList = Object.entries(e.prob)
    .filter(([, v]) => v >= 0.005)
    .sort((a, b) => b[1] - a[1]);

  root.innerHTML = `
  <section class="detail">
    <a class="back" href="#/dominio">← todas las gubernaturas</a>
    <header class="detail-hero">
      <div>
        <p class="eyebrow">Gubernatura · ${e.region} · <span class="ficticio">datos ficticios</span></p>
        <h1 class="detail-h">${e.nombre}</h1>
        <div class="detail-tags">
          ${partyLogo(e.favorito, 'lg')} ${statusTag(e)}
          ${e.flip ? `<span class="flip-tag">cambia de partido</span>` : `<span class="hold-tag">conserva</span>`}
        </div>
      </div>
      <div class="detail-kpis">
        <div class="kpi"><span class="kpi-k" style="color:${fav.color}">${pct(e.probFav)}</span>
          <span class="kpi-l">prob. de victoria</span></div>
        <div class="kpi"><span class="kpi-k">${signed(e.margen)}</span>
          <span class="kpi-l">margen proyectado</span></div>
        <div class="kpi"><span class="kpi-k"><span class="kpi-logo">${gob ? partyLogo(gob.id, 'lg') : e.gob}</span></span>
          <span class="kpi-l">gobierna hoy</span></div>
      </div>
    </header>

    <div class="detail-grid">
      <section class="panel panel-wide">
        <div class="panel-head"><h3>Tendencia de intención de voto</h3>
          <span class="panel-sub">estimación quincenal · dic 2026 – jun 2027</span></div>
        <div class="trend-wrap" id="trend"></div>
        <div class="trend-legend" id="trendLegend"></div>
      </section>

      <section class="panel">
        <div class="panel-head"><h3>Proyección de voto</h3>
          <span class="panel-sub">día de la jornada</span></div>
        ${voteBars(e)}
      </section>

      <section class="panel">
        <div class="panel-head"><h3>Probabilidad de victoria</h3></div>
        <div class="problist">${probList.map(([id, v]) => {
          const p = PARTIES[id];
          return `<div class="pl-row"><span class="pl-name">${PARTIES[id] ? partyLogo(id, 'md') : id}</span>
            <div class="pl-bar"><span style="width:${v * 100}%;background:${p ? p.color : '#999'}"></span></div>
            <span class="pl-val">${pct(v)}</span></div>`;
        }).join('')}</div>
      </section>

      <section class="panel panel-wide">
        <div class="panel-head"><h3>Encuestas del ciclo</h3>
          <span class="panel-sub">${e.encuestas.length} sondeos · casas ficticias</span></div>
        <div class="survey-wrap">${surveyTable(e)}</div>
      </section>
    </div>
  </section>`;

  // Gráfica de tendencia.
  root.querySelector('#trend').appendChild(trendChart(e));
  root.querySelector('#trendLegend').innerHTML = e.tendencia.forces.map((f) => {
    return `<span class="tl-item">${PARTIES[f] ? partyLogo(f, 'xs') : f}</span>`;
  }).join('');
}
