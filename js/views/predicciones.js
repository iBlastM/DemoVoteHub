// ============================================================
// views/predicciones.js — Pronóstico: escenarios, proyección y tabla.
// ============================================================

import { store } from '../store.js';
import { PARTIES, PARTY_ORDER, UPDATED_LABEL } from '../config.js';
import { navigate } from '../router.js';
import { chip, probBar, statusTag } from '../components.js';
import { pct, signed, rng, seedFrom, animateCount } from '../utils.js';

/** Simula la distribución de gubernaturas ganadas por una fuerza. */
function simularEscanos(forceId, draws = 20000) {
  const u = rng(seedFrom('escenarios-' + forceId));
  const ps = store.estados.map((e) => e.prob[forceId] || 0);
  const conteo = new Array(store.estados.length + 1).fill(0);
  for (let d = 0; d < draws; d++) {
    let w = 0;
    for (const p of ps) if (u() < p) w++;
    conteo[w]++;
  }
  const dist = conteo.map((c) => c / draws);
  const mean = dist.reduce((a, v, i) => a + v * i, 0);
  const acumGE = (n) => dist.slice(n).reduce((a, b) => a + b, 0); // P(>= n)
  // Intervalo 80%.
  let lo = 0, hi = dist.length - 1, acc = 0;
  for (let i = 0; i < dist.length; i++) { acc += dist[i]; if (acc >= 0.1) { lo = i; break; } }
  acc = 0;
  for (let i = dist.length - 1; i >= 0; i--) { acc += dist[i]; if (acc >= 0.1) { hi = i; break; } }
  return { dist, mean, acumGE, lo, hi };
}

export function render(root) {
  const r = store.resumen;
  const morena = simularEscanos('MORENA');
  const opos = simularEscanos('PAN'); // proxy de oposición (fuerza principal)

  const escenarios = [
    { p: morena.acumGE(12), t: 'Morena gana <b>12 o más</b> de las 17 gubernaturas.', c: PARTIES.MORENA.color },
    { p: morena.acumGE(14), t: 'Morena arrasa con <b>14 o más</b> gubernaturas.', c: PARTIES.MORENA.color },
    { p: 1 - morena.acumGE(13), t: 'La oposición contiene a Morena por <b>debajo de 13</b>.', c: PARTIES.PAN.color },
  ];

  root.innerHTML = `
  <section class="pred-hero">
    <p class="eyebrow">Pronóstico nacional · <span class="ficticio">datos ficticios</span></p>
    <h1 class="pred-h">Predicciones 2027</h1>
    <p class="pred-sub">Simulación de 20&nbsp;000 escenarios sobre las 17 contiendas. Actualizado ${UPDATED_LABEL}.</p>
  </section>

  <section class="scen">${escenarios.map((s, i) => `
    <div class="scen-card" style="--c:${s.c}">
      <span class="scen-p" data-count="${Math.round(s.p * 100)}">0%</span>
      <p class="scen-t">${s.t}</p>
    </div>`).join('')}
  </section>

  <section class="proj">
    <div class="section-head"><h2>Proyección de gubernaturas</h2>
      <span class="side-note">valor esperado (rango 80%)</span></div>
    <div class="proj-rows" id="proj"></div>
  </section>

  <section class="table-wrap">
    <div class="section-head"><h2>Las 17 contiendas</h2>
      <div class="sortbar" id="sortbar">
        <button data-sort="prob" class="on">probabilidad</button>
        <button data-sort="margen">margen</button>
        <button data-sort="nombre">A–Z</button>
      </div>
    </div>
    <div class="ftable" id="ftable"></div>
  </section>`;

  // Escenarios: animar porcentajes.
  root.querySelectorAll('.scen-p').forEach((n) =>
    animateCount(n, Number(n.dataset.count), { dur: 900, suffix: '%' }));

  // Proyección por fuerza.
  const proj = root.querySelector('#proj');
  const maxExp = Math.max(...PARTY_ORDER.map((p) => r.esperado[p] || 0));
  proj.innerHTML = PARTY_ORDER.map((id) => {
    const v = r.esperado[id] || 0;
    const p = PARTIES[id];
    const rango = id === 'MORENA' ? `${morena.lo}–${morena.hi}` : (id === 'PAN' ? `${opos.lo}–${opos.hi}` : '—');
    return `<div class="proj-row">
      <span class="proj-name">${p.nombre}</span>
      <div class="proj-track"><span class="proj-fill" style="width:${(v / maxExp) * 100}%;background:${p.color}"></span></div>
      <span class="proj-val">${v.toFixed(1)}</span>
      <span class="proj-range">${rango}</span>
    </div>`;
  }).join('');

  // Tabla ordenable.
  const ftable = root.querySelector('#ftable');
  const sorters = {
    prob: (a, b) => b.probFav - a.probFav,
    margen: (a, b) => a.margen - b.margen,
    nombre: (a, b) => a.nombre.localeCompare(b.nombre),
  };
  function paint(sort) {
    const arr = [...store.estados].sort(sorters[sort]);
    ftable.innerHTML = arr.map(row).join('');
    ftable.querySelectorAll('.ft-row').forEach((el) =>
      el.addEventListener('click', () => navigate('/estado/' + el.dataset.slug)));
  }
  paint('prob');
  const sortbar = root.querySelector('#sortbar');
  sortbar.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    sortbar.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === btn));
    paint(btn.dataset.sort);
  });
}

function row(e) {
  return `<div class="ft-row" data-slug="${e.slug}" tabindex="0">
    <span class="ft-name">${e.nombre}</span>
    <span class="ft-fav">${chip(e.favorito)}${e.flip ? '<span class="flip-tag sm">cambia</span>' : ''}</span>
    <span class="ft-bar">${probBar(e)}</span>
    <span class="ft-prob">${pct(e.probFav)}</span>
    <span class="ft-margen">${signed(e.margen)}</span>
    <span class="ft-status">${statusTag(e)}</span>
  </div>`;
}
