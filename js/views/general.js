// ============================================================
// views/general.js — Vista general (panorama nacional).
// ============================================================

import { store } from '../store.js';
import { PARTIES, PARTY_ORDER, UPDATED_LABEL, ELECTION_DATE } from '../config.js';
import { renderMap, renderLegend } from '../map.js';
import { navigate } from '../router.js';
import { partyLogo, probBar, statusTag } from '../components.js';
import { pct, signed, daysUntil, animateCount } from '../utils.js';
import { construirEncuestas } from '../polls.js';
import { buildPollChart } from './encuestas.js';

export function render(root) {
  const r = store.resumen;
  const favMorena = r.porFavorito.MORENA || 0;
  const dias = daysUntil(ELECTION_DATE);

  root.innerHTML = `
  <section class="hero">
    <p class="eyebrow">Pronóstico · Gubernaturas 2027 · <span class="ficticio">datos ficticios</span></p>
    <h1 class="hero-h">Morena parte como favorita en
      <span class="hero-num" data-count="${favMorena}">0</span> de ${r.total} gubernaturas.</h1>
    <p class="hero-sub">Actualizado ${UPDATED_LABEL} · faltan <b>${dias}</b> días para la jornada del 6 de junio</p>
  </section>

  <section class="board">
    <div class="board-map">
      <div class="map-toolbar">
        <div class="legend" id="legend"></div>
        <div class="metric-toggle" id="metricToggle" role="group" aria-label="Métrica del mapa">
          <button data-metric="prob" class="on">Probabilidad</button>
          <button data-metric="margen">Margen</button>
        </div>
      </div>
      <div class="map-stage"><svg id="map"></svg></div>
    </div>
    <aside class="board-side">
      <div class="statgrid" id="statgrid"></div>
      <div class="balance">
        <h3 class="side-title">Balance de fuerzas <span class="side-note">gubernaturas esperadas</span></h3>
        <div id="balance"></div>
      </div>
    </aside>
  </section>

  <section class="watch">
    <div class="section-head">
      <h2>Carreras para observar</h2>
      <a href="#/predicciones" class="see-all">ver las 17 →</a>
    </div>
    <div class="race-cards" id="watch"></div>
  </section>

  <section class="home-polls">
    <div class="section-head">
      <h2>Encuestas</h2>
      <a href="#/encuestas" class="see-all">ver todas →</a>
    </div>
    <div class="hp-grid" id="homePolls"></div>
  </section>`;

  // Cifra animada del hero.
  const num = root.querySelector('.hero-num');
  animateCount(num, Number(num.dataset.count), { dur: 1000 });

  // Mapa nacional.
  const svg = root.querySelector('#map');
  store.mapMetric = 'prob';
  renderMap(svg, { metric: 'prob', onSelect: (slug) => navigate('/estado/' + slug) });
  renderLegend(root.querySelector('#legend'), PARTY_ORDER);

  // Toggle de métrica.
  const toggle = root.querySelector('#metricToggle');
  toggle.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    store.mapMetric = btn.dataset.metric;
    toggle.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === btn));
    renderMap(svg, { metric: store.mapMetric, onSelect: (slug) => navigate('/estado/' + slug) });
  });

  // Franja de estadísticas.
  const stats = [
    { k: r.total, l: 'gubernaturas en juego' },
    { k: (r.esperado.MORENA || 0).toFixed(1), l: 'esperadas para Morena', c: PARTIES.MORENA.color },
    { k: r.flips, l: 'cambian de partido' },
    { k: r.renidas, l: 'contiendas cerradas' },
  ];
  root.querySelector('#statgrid').innerHTML = stats.map((s) => `
    <div class="stat"><span class="stat-k" style="${s.c ? `color:${s.c}` : ''}">${s.k}</span>
      <span class="stat-l">${s.l}</span></div>`).join('');

  // Balance de fuerzas (barra apilada por gubernaturas esperadas).
  const totalExp = PARTY_ORDER.reduce((a, p) => a + (r.esperado[p] || 0), 0);
  const balance = root.querySelector('#balance');
  balance.innerHTML = `<div class="bal-bar">${PARTY_ORDER.map((p) => {
    const v = r.esperado[p] || 0;
    return v <= 0.05 ? '' : `<span class="bal-seg" style="width:${(v / totalExp) * 100}%;background:${PARTIES[p].color}"
      title="${PARTIES[p].nombre}: ${v.toFixed(1)}"></span>`;
  }).join('')}</div>
  <div class="bal-legend">${PARTY_ORDER.map((p) => {
    const v = r.esperado[p] || 0;
    return v <= 0.05 ? '' : `<span class="bal-li">${partyLogo(p, 'xs')} <b>${v.toFixed(1)}</b></span>`;
  }).join('')}</div>`;

  // Carreras para observar: las más cerradas.
  const cerradas = [...store.estados].sort((a, b) => a.margen - b.margen).slice(0, 6);
  root.querySelector('#watch').innerHTML = cerradas.map(raceCard).join('');
  root.querySelectorAll('.race-card').forEach((c) =>
    c.addEventListener('click', () => navigate('/estado/' + c.dataset.slug)));

  // Previsualización de encuestas (3 preguntas destacadas).
  const destacadas = construirEncuestas().filter((q) => q.destacada).slice(0, 3);
  const hp = root.querySelector('#homePolls');
  hp.innerHTML = destacadas.map((q) => {
    const chips = q.opciones.map((o) => ({ o, v: q.topline[o.id] })).sort((a, b) => b.v - a.v).slice(0, 2)
      .map(({ o, v }) => `<span class="hp-chip" style="--c:${o.color}"><b>${Math.round(v)}%</b> ${PARTIES[o.id] ? partyLogo(o.id, 'xs') : o.label.split(' ')[0]}</span>`).join('');
    return `<article class="hp-card" data-id="${q.id}" tabindex="0">
      <h3 class="hp-q">${q.titulo}</h3>
      <div class="hp-spark" id="hp-${q.id}"></div>
      <div class="hp-chips">${chips}</div>
    </article>`;
  }).join('');
  for (const q of destacadas) hp.querySelector(`#hp-${q.id}`).appendChild(buildPollChart(q, { w: 320, h: 70, mini: true }));
  hp.querySelectorAll('.hp-card').forEach((c) =>
    c.addEventListener('click', () => navigate('/encuestas/' + c.dataset.id)));
}

function raceCard(e) {
  return `<article class="race-card" data-slug="${e.slug}" tabindex="0">
    <div class="rc-head">
      <span class="rc-name">${e.nombre}</span>
      ${statusTag(e)}
    </div>
    <div class="rc-fav">${partyLogo(e.favorito)} ${e.flip ? '<span class="flip-tag">cambia</span>' : ''}</div>
    ${probBar(e)}
    <div class="rc-foot">
      <span>prob. <b>${pct(e.probFav)}</b></span>
      <span>margen <b>${signed(e.margen)}</b></span>
    </div>
  </article>`;
}
