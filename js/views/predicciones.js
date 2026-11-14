// ============================================================
// views/predicciones.js — Pronóstico: perspectiva, escenarios,
// proyección por partido y tabla de contiendas.
// ============================================================

import { store } from '../store.js';
import { PARTIES, PARTY_ORDER } from '../config.js';
import { navigate } from '../router.js';
import { partyLogo, probBar, statusTag } from '../components.js';
import { pct, signed, rng, seedFrom, animateCount } from '../utils.js';
import { simularConteo, nivelDeProb, tramoDeProb, deCien, N_TRAMOS } from '../stats.js';

/** Simula la distribución de gubernaturas ganadas por una fuerza. */
function simularEscanos(forceId, draws = 20000) {
  const u = rng(seedFrom('escenarios-' + forceId));
  return simularConteo(store.estados.map((e) => e.prob[forceId] || 0), u, draws);
}

/** Gubernaturas de Morena que marcan la pregunta del medidor y el primer escenario. */
const UMBRAL_MORENA = 12;
const RANGOS_TRAMO = ['0–5 %', '5–20 %', '20–40 %', '40–60 %', '60–80 %', '80–95 %', '95–100 %'];

/** Segundo lugar de una contienda según el voto estimado (sin "Otros"). */
function segundoLugar(e) {
  const r = Object.entries(e.voto).filter(([k]) => PARTIES[k]).sort((a, b) => b[1] - a[1]);
  return r[1]?.[0] || null;
}

/**
 * Medidor de perspectiva: 7 tramos de probabilidad para una pregunta de sí o no.
 * El tramo activo marca qué tan probable es el "sí" (extremo derecho).
 */
function medidorHTML({ p, textoSi, textoNo, colorSi, colorNo, pregunta }) {
  const nivel = nivelDeProb(p);
  const idx = tramoDeProb(p);
  const gana = p >= 0.5;
  const nDe = deCien(gana ? p : 1 - p);
  const lado = gana ? textoSi : textoNo;
  const segs = RANGOS_TRAMO.map((rango, i) => {
    const mezcla = Math.round((i / (N_TRAMOS - 1)) * 100);
    return `<span class="ol-seg${i === idx ? ' on' : ''}" style="--c:color-mix(in srgb, ${colorSi} ${mezcla}%, ${colorNo})"
      title="Probabilidad del «sí»: ${rango}"></span>`;
  }).join('');
  return `
  <section class="outlook" aria-label="Perspectiva nacional">
    <div class="ol-top">
      <span class="ol-k">Perspectiva</span>
      <span class="status status-${nivel.id}">${nivel.etiqueta}</span>
      <span class="ol-t">${lado}</span>
    </div>
    <div class="ol-scale" role="img"
      aria-label="Perspectiva ${nivel.etiqueta.toLowerCase()}: ${pregunta}. ${gana ? 'Sí' : 'No'} en ${nDe} de 100 escenarios simulados.">${segs}</div>
    <div class="ol-ends" aria-hidden="true"><span>${textoNo}</span><span>${textoSi}</span></div>
    <p class="ol-foot">En <b>${nDe} de 100</b> escenarios simulados se cumple que ${lado.replace(/<\/?b>/g, '')}.
      Cada tramo es una franja de probabilidad (0–5 %, 5–20 %, 20–40 %, 40–60 %, 60–80 %, 80–95 % y 95–100 %); la perspectiva es
      <b>segura</b> desde 95 %, <b>probable</b> desde 80 %, <b>inclinada</b> desde 60 % y <b>reñida</b> por debajo de eso.</p>
  </section>`;
}

export function render(root) {
  const r = store.resumen;
  const sims = Object.fromEntries(PARTY_ORDER.map((id) => [id, simularEscanos(id)]));
  const morena = sims.MORENA;

  const escenarios = [
    { p: morena.acumGE(UMBRAL_MORENA), t: `Morena gana <b>${UMBRAL_MORENA} o más</b> de las 17 gubernaturas`, c: PARTIES.MORENA.color, partido: 'MORENA' },
    { p: morena.acumGE(14), t: 'Morena arrasa con <b>14 o más</b> gubernaturas', c: PARTIES.MORENA.color, partido: 'MORENA' },
    { p: 1 - morena.acumGE(13), t: 'La oposición contiene a Morena por <b>debajo de 13</b>', c: PARTIES.PAN.color, partido: 'PAN' },
  ];

  root.innerHTML = `
  <section class="pred-hero">
    <p class="eyebrow">Pronóstico nacional · <span class="fuente-real">basado en encuestas públicas</span></p>
    <h1 class="pred-h">Predicciones 2027</h1>
    <p class="pred-sub">Simulación de 20&nbsp;000 escenarios sobre las 17 contiendas. Actualizado ${store.updatedLabel}.</p>
  </section>

  ${medidorHTML({
    p: morena.acumGE(UMBRAL_MORENA),
    textoSi: `Morena gana <b>${UMBRAL_MORENA} o más</b> gubernaturas`,
    textoNo: `Morena gana <b>${UMBRAL_MORENA - 1} o menos</b>`,
    colorSi: PARTIES.MORENA.color,
    colorNo: PARTIES.PAN.color,
    pregunta: `Morena gana ${UMBRAL_MORENA} o más de las 17 gubernaturas`,
  })}

  <section class="scen">${escenarios.map((s) => `
    <div class="scen-card" style="--c:${s.c}">
      <div class="scen-logo">${partyLogo(s.partido, 'lg')}</div>
      <span class="scen-p" data-count="${Math.round(s.p * 100)}">0%</span>
      <p class="scen-t">${s.t} en <b>${deCien(s.p)} de 100</b> escenarios simulados.</p>
    </div>`).join('')}
  </section>

  <section class="proj">
    <div class="section-head"><h2>Proyección por partido</h2>
      <span class="side-note">gubernaturas de las 17 · rango del 80 % de las simulaciones</span></div>
    <div class="pt" id="proj" role="table" aria-label="Proyección de gubernaturas por partido"></div>
    <p class="panel-note">«Hoy» son las gubernaturas que cada partido gobierna actualmente entre las 17 en juego (referencia editorial).
      «Voto» es el promedio de las encuestas de cada estado ponderado por lista nominal; donde una encuesta no mide a un partido, ahí no suma voto.</p>
  </section>

  <section class="close">
    <div class="section-head"><h2>Las más cerradas</h2>
      <span class="side-note">menor diferencia entre el primer y el segundo lugar</span></div>
    <div class="cl-list" id="cerradas"></div>
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

  // Proyección por partido: hoy, proyectado, rango y voto.
  const hoy = Object.fromEntries(PARTY_ORDER.map((id) => [id, store.estados.filter((e) => e.gob === id).length]));
  const lnTotal = store.estados.reduce((a, e) => a + (e.listaNominal || 0), 0);
  const votoNacional = (id) => (lnTotal
    ? store.estados.reduce((a, e) => a + (e.voto[id] || 0) * (e.listaNominal || 0), 0) / lnTotal
    : 0);
  const eje = Math.min(r.total, Math.max(...PARTY_ORDER.map((id) => sims[id].hi)) + 1);
  const celdas = eje + 1; // 0..eje gubernaturas
  const proj = root.querySelector('#proj');
  proj.innerHTML = `
    <div class="pt-row pt-head" role="row">
      <span role="columnheader">Partido</span>
      <span role="columnheader" title="Gubernaturas que gobierna hoy, entre las 17 en juego">Hoy</span>
      <span role="columnheader" title="Gubernaturas esperadas (promedio de las simulaciones) y cambio frente a hoy">Proyectado</span>
      <span role="columnheader" title="Entre qué cifras cae el 80 % de las simulaciones">Rango 80 %</span>
      <span role="columnheader" title="Promedio de encuestas estatales ponderado por lista nominal">Voto</span>
    </div>` + PARTY_ORDER.map((id) => {
    const p = PARTIES[id];
    const s = sims[id];
    const esperado = r.esperado[id] || 0;
    const cambio = esperado - hoy[id];
    const band = `left:${(s.lo / celdas) * 100}%;width:${((s.hi - s.lo + 1) / celdas) * 100}%`;
    const marca = `left:${((esperado + 0.5) / celdas) * 100}%`;
    return `<div class="pt-row" role="row">
      <span class="pt-name" role="cell">${partyLogo(id, 'lg')}</span>
      <span class="pt-hoy" role="cell">${hoy[id]}</span>
      <span class="pt-proy" role="cell"><b>${esperado.toFixed(1)}</b><small>${signed(cambio)}</small></span>
      <span class="pt-range" role="cell">
        <span class="pt-track" aria-hidden="true"><span class="pt-band" style="${band};background:${p.color}"></span><span class="pt-mean" style="${marca}"></span></span>
        <span class="pt-rtxt">${s.lo === s.hi ? s.lo : `${s.lo}–${s.hi}`}</span>
      </span>
      <span class="pt-voto" role="cell">${pct(votoNacional(id), 1)}</span>
    </div>`;
  }).join('');

  // Las más cerradas.
  const cerradas = [...store.estados].sort((a, b) => a.margen - b.margen).slice(0, 6);
  const cl = root.querySelector('#cerradas');
  cl.innerHTML = cerradas.map((e) => {
    const sec = segundoLugar(e);
    return `<button type="button" class="cl-row" data-slug="${e.slug}">
      <span class="cl-name">${e.nombre}</span>
      <span class="cl-duelo">${partyLogo(e.favorito, 'xs')}<i aria-hidden="true">›</i>${sec ? partyLogo(sec, 'xs') : ''}</span>
      <span class="cl-m" title="Diferencia entre el primer y el segundo lugar">${e.margen.toFixed(1)} pts</span>
      <span class="cl-p" title="Probabilidad de que gane el favorito">prob. ${pct(e.probFav)}</span>
    </button>`;
  }).join('');
  cl.addEventListener('click', (ev) => {
    const b = ev.target.closest('.cl-row');
    if (b) navigate('/estado/' + b.dataset.slug);
  });

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
    <span class="ft-fav">${partyLogo(e.favorito)}${e.flip ? '<span class="flip-tag sm">cambia</span>' : ''}</span>
    <span class="ft-bar">${probBar(e)}</span>
    <span class="ft-prob">${pct(e.probFav)}</span>
    <span class="ft-margen">${signed(e.margen)}</span>
    <span class="ft-status">${statusTag(e)}</span>
  </div>`;
}
