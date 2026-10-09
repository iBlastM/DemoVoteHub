// ============================================================
// views/atlas_comun.js — Armazón compartido de las vistas de mapa
// a pantalla completa basadas en encuestas reales:
//   · Preferencia estatal (#/estatal): polígonos de estados.
//   · Alcaldías 2027 (#/alcaldias): municipios con encuesta Rubrum.
// Reutiliza el motor atlas.js y los estilos .ax-* del Mapa de dominio.
// ============================================================

import { store } from '../store.js';
import { PARTIES, PARTY_ORDER } from '../config.js';
import { createAtlas, toWorldGeometry, unionBBox } from '../atlas.js';
import { resolvedTheme, cycleTheme, themePref, themeLabel, THEME_ICONS } from '../theme.js';
import { slugify, clamp, fmtNum } from '../utils.js';
import { navigate } from '../router.js';

export const ENTIDADES = {
  1: ['Aguascalientes', 'Ags.'], 2: ['Baja California', 'B.C.'], 3: ['Baja California Sur', 'B.C.S.'],
  4: ['Campeche', 'Camp.'], 5: ['Coahuila', 'Coah.'], 6: ['Colima', 'Col.'], 7: ['Chiapas', 'Chis.'],
  8: ['Chihuahua', 'Chih.'], 9: ['Ciudad de México', 'CDMX'], 10: ['Durango', 'Dgo.'],
  11: ['Guanajuato', 'Gto.'], 12: ['Guerrero', 'Gro.'], 13: ['Hidalgo', 'Hgo.'], 14: ['Jalisco', 'Jal.'],
  15: ['Estado de México', 'Edomex'], 16: ['Michoacán', 'Mich.'], 17: ['Morelos', 'Mor.'],
  18: ['Nayarit', 'Nay.'], 19: ['Nuevo León', 'N.L.'], 20: ['Oaxaca', 'Oax.'], 21: ['Puebla', 'Pue.'],
  22: ['Querétaro', 'Qro.'], 23: ['Quintana Roo', 'Q. Roo'], 24: ['San Luis Potosí', 'S.L.P.'],
  25: ['Sinaloa', 'Sin.'], 26: ['Sonora', 'Son.'], 27: ['Tabasco', 'Tab.'], 28: ['Tamaulipas', 'Tamps.'],
  29: ['Tlaxcala', 'Tlax.'], 30: ['Veracruz', 'Ver.'], 31: ['Yucatán', 'Yuc.'], 32: ['Zacatecas', 'Zac.'],
};

export const I = {
  home: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3.5 9 10 3.5 16.5 9M5 8v8.5h10V8"/></svg>',
  tilt: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 4h8l3.5 12h-15Z"/><path d="M8.6 4 7.7 16M11.4 4l.9 12M4.2 8.2h11.6M3.3 12h13.4"/></svg>',
  outline: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 7V4h3M13 4h3v3M16 13v3h-3M7 16H4v-3M9 4h2M9 16h2M4 9v2M16 9v2"/></svg>',
  layers: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m10 3 7 3.6-7 3.6-7-3.6Z"/><path d="m3 10.2 7 3.6 7-3.6M3 13.6l7 3.6 7-3.6"/></svg>',
  close: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5.5 5.5 9 9M14.5 5.5l-9 9"/></svg>',
  minus: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 10h10"/></svg>',
  plus: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 10h10M10 5v10"/></svg>',
  search: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.8" cy="8.8" r="5.3"/><path d="m12.8 12.8 4 4"/></svg>',
  arrow: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h11M11 6l4 4-4 4"/></svg>',
};

/* ---------- Color ---------- */
const rgbOf = (hex) => { const h = hex.replace('#', ''); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); };
const mixRgb = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const css = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;
const PAL = Object.fromEntries(Object.values(PARTIES).map((p) => {
  const base = rgbOf(p.color);
  return [p.id, { base, soft: rgbOf(p.colorSoft), deep: mixRgb(base, [12, 10, 22], 0.38) }];
}));
// Rampa propia para "Aún no decide" (violeta grisáceo, distinto de cualquier partido y del gris "sin dato").
PAL.NO_DECIDE = { soft: [226, 222, 238], base: [112, 96, 160], deep: [52, 40, 86] };
/** Rampa suave → color → profundo (t de 0 a 1). */
export function ramp(party, t) {
  const P = PAL[party];
  if (!P) return 'rgb(150,156,166)';
  t = clamp(t, 0, 1);
  return t < 0.55 ? css(mixRgb(P.soft, P.base, t / 0.55)) : css(mixRgb(P.base, P.deep, (t - 0.55) / 0.45));
}
export const baseColor = (p) => (PAL[p] ? css(PAL[p].base) : 'rgb(150,156,166)');
export const NEUTRAL = {
  light: { none: 'rgba(120,128,142,.16)', nodata: 'rgba(132,140,154,.30)' },
  dark: { none: 'rgba(150,160,178,.10)', nodata: 'rgba(120,128,144,.30)' },
};

/* ---------- Texto ---------- */
const EXTRA = { NO_DECIDE: 'Aún no decide', OTRO: 'Otros / locales', OTROS: 'Otros', Otros: 'Otros', PRD: 'PRD' };
export const partyName = (p) => EXTRA[p] || PARTIES[p]?.nombre || p;
export const isParty = (p) => !!PARTIES[p];
export const dot = (p) => `<span class="ax-dot" style="--c:${PARTIES[p]?.color || 'var(--ax-muted)'}"></span>`;
export const pct1 = (x) => `${Number(x).toFixed(1)}%`;
export const shortParty = (p) => (p === 'MORENA' ? 'Morena' : partyName(p));
export const escapeHTML = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export function fechaLarga(iso) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return `${d} ${MESES[m - 1]} ${y}`;
}
/** Partidos ordenados por valor, primero los partidos con logo y al final no decide / otros. */
export function rankEntries(obj) {
  return Object.entries(obj).filter(([, v]) => v != null)
    .sort((a, b) => (isParty(b[0]) - isParty(a[0])) || b[1] - a[1]);
}
const tipLogo = (p) => (PARTIES[p]?.logo
  ? `<span class="ax-tip-logo${p === 'MORENA' ? ' is-wordmark' : ''}"><img src="${PARTIES[p].logo}" alt="" width="${p === 'MORENA' ? 40 : 24}" height="24" decoding="async"></span>`
  : dot(p));
/* ---------- Desplegable "¿De dónde vienen estos datos?" ---------- */
// Se recuerda abierto/cerrado por título durante la sesión: el panel se vuelve a
// pintar con cada selección y el usuario no debe tener que reabrirlo.
const _abiertos = new Set();
document.addEventListener('toggle', (e) => {
  const d = e.target;
  if (!(d instanceof HTMLDetailsElement) || !d.dataset.fuente) return;
  if (d.open) _abiertos.add(d.dataset.fuente); else _abiertos.delete(d.dataset.fuente);
}, true);

/**
 * Bloque plegable con la explicación de la fuente de los datos.
 * titulo: texto del resumen; html: contenido; clave: identifica el bloque para recordar su estado.
 */
export function fuenteBox(html, { titulo = '¿De dónde vienen estos datos?', clave = titulo, cls = '' } = {}) {
  const k = escapeHTML(clave);
  return `<details class="ax-fuente ${cls}" data-fuente="${k}"${_abiertos.has(clave) ? ' open' : ''}>
    <summary>${escapeHTML(titulo)}</summary><div class="ax-fuente-b">${html}</div></details>`;
}

/** Tabla del tooltip: rows [[party, a, b]]. */
export function tipTable(cols, rows) {
  return `<table class="ax-tip-t">
    <thead><tr>${cols.map((c) => `<th scope="col">${c}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(([p, a, b]) => `<tr><th scope="row">${tipLogo(p)}<span>${partyName(p)}</span></th><td>${a}</td><td>${b}</td></tr>`).join('')}</tbody>
  </table>`;
}

/**
 * Monta la vista de mapa. cfg:
 *   aria            etiqueta del mapa
 *   layersHTML      contenido del diálogo de capas
 *   onLayers(btn)   clic dentro del diálogo de capas
 *   fill(it, theme) color de un item
 *   tip(it)         HTML del cuerpo del tooltip
 *   panel(list)     { scope, intro, table, foot } para la selección (list vacía = sin selección)
 *   legend()        HTML de la leyenda
 *   index()         entradas del buscador [{ label, sub, ids, bbox, maxZoom }]
 *   spike(it)       { h, color } | null (picos 3D)
 *   placeholder     texto del buscador
 * Devuelve ctx: { atlas, setItems, items, restyle, select, setStatus, renderPanel, selectedItems,
 *   stateBBox, fitMexico, theme, alive, onCleanup }.
 */
export function montarMapa(root, cfg) {
  document.body.classList.add('atlas-mode');
  root.innerHTML = `
  <section class="ax" aria-label="${cfg.aria}">
    <div class="ax-map" id="axMap" role="region" aria-label="${cfg.aria}. Arrastra para desplazar, rueda o pellizco para acercar; usa el buscador del panel para seleccionar."></div>
    <div class="ax-status" id="axStatus" role="status" hidden></div>
    <div class="ax-tip" id="axTip" hidden></div>
    <svg class="ax-tip-lead" id="axLead" aria-hidden="true" hidden><path class="ax-lead-halo"/><path class="ax-lead-line"/></svg>
    <div class="ax-bar" role="toolbar" aria-label="Controles del mapa">
      <button class="ax-btn" type="button" data-act="theme" id="axTheme"></button>
      <button class="ax-btn" type="button" data-act="reset" aria-label="Restablecer vista" title="Restablecer vista">${I.home}</button>
      <button class="ax-btn" type="button" data-act="tilt" aria-pressed="false" aria-label="Perspectiva" title="Perspectiva">${I.tilt}</button>
      <button class="ax-btn" type="button" data-act="outlines" aria-pressed="false" aria-label="Contornos" title="Contornos">${I.outline}</button>
      <button class="ax-btn" type="button" data-act="layers" aria-expanded="false" aria-controls="axLayers" aria-label="Capas del mapa" title="Capas">${I.layers}</button>
    </div>
    <div class="ax-layers" id="axLayers" role="dialog" aria-label="Capas del mapa" hidden>${cfg.layersHTML}
      <div class="ax-layers-legend" id="axLegend2" aria-hidden="true"></div>
    </div>
    <div class="ax-legend" id="axLegend" aria-hidden="true"></div>
    <p class="ax-attr">Teselas: Esri, HERE, Garmin, © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a></p>
    <aside class="ax-panel" id="axPanel" aria-label="Resultados">
      <header class="ax-ph">
        <h2 class="ax-scope" id="axScope" aria-live="polite"></h2>
        <button class="ax-icon-sm" type="button" data-act="clear" id="axClear" aria-label="Quitar selección" hidden>${I.close}</button>
        <button class="ax-icon-sm ax-collapse" type="button" data-act="collapse" aria-expanded="true" aria-controls="axBody" aria-label="Contraer panel">${I.minus}</button>
      </header>
      <div class="ax-body" id="axBody">
        <div class="ax-intro" id="axIntro"></div>
        <div class="ax-search" id="axSearchWrap">
          ${I.search}
          <input id="axSearch" type="search" autocomplete="off" spellcheck="false"
            placeholder="${cfg.placeholder || 'Busca un estado o municipio…'}" aria-label="Buscar"
            role="combobox" aria-expanded="false" aria-controls="axResults" aria-autocomplete="list" />
          <ul class="ax-results" id="axResults" role="listbox" aria-label="Resultados de búsqueda" hidden></ul>
        </div>
        <div class="ax-table" id="axTable"></div>
        <footer class="ax-pfoot" id="axFoot"></footer>
      </div>
    </aside>
  </section>`;

  const $ = (s) => root.querySelector(s);
  const mapEl = $('#axMap'), tipEl = $('#axTip'), leadEl = $('#axLead'), statusEl = $('#axStatus');
  const panel = $('#axPanel'), scopeEl = $('#axScope'), clearBtn = $('#axClear');
  const introEl = $('#axIntro'), searchWrap = $('#axSearchWrap'), searchEl = $('#axSearch'), resultsEl = $('#axResults');
  const tableEl = $('#axTable'), footEl = $('#axFoot'), legendEl = $('#axLegend');
  const layersEl = $('#axLayers'), layersBtn = root.querySelector('[data-act="layers"]');
  const cleanups = [];

  const ctx = {
    alive: true, theme: resolvedTheme(), items: [], selection: new Set(), spikesOn: false,
    onCleanup: (fn) => cleanups.push(fn),
  };

  // Contornos estatales y caja de México
  const outlineItems = store.geoData.features.map((f) => {
    const cve = parseInt(f.properties.cvegeo, 10);
    return { id: 'o:' + cve, cve, geom: toWorldGeometry(f.geometry), covered: cfg.covered ? cfg.covered(cve) : false };
  });
  const MEXICO = unionBBox(outlineItems.map((o) => o.geom.bbox));
  ctx.outlineItems = outlineItems;
  ctx.stateBBox = (cve) => outlineItems.find((o) => o.cve === cve)?.geom.bbox;

  let hoverItem = null;
  const atlas = createAtlas(mapEl, {
    onHover: (it, p) => { hoverItem = it; showTip(it, p); },
    onClick: (it, info) => {
      if (!it || it.selectable === false) return;
      if (info.remove) { select([it.id], 'remove'); return; }
      if (info.shift) { select([it.id], 'toggle'); return; }
      if (ctx.selection.size === 1 && ctx.selection.has(it.id)) { select([], 'replace'); return; }
      select([it.id], 'replace');
    },
    onBox: (hit, how) => select(hit.map((h) => h.id), how === 'remove' ? 'remove' : 'add'),
    onView: () => { if (hoverItem) hideTip(); },
    padding: () => {
      const pr = panel.getBoundingClientRect();
      if (window.innerWidth > 860) return { top: 64, right: 12, bottom: 12, left: pr.width + 28 };
      return { top: 64, right: 0, bottom: Math.min(pr.height, window.innerHeight * 0.5) + 8, left: 0 };
    },
  });
  ctx.atlas = atlas;
  atlas.setTheme(ctx.theme);
  atlas.setOutlines(outlineItems);
  atlas.setLimits([MEXICO[0] - 0.06, MEXICO[1] - 0.06, MEXICO[2] + 0.06, MEXICO[3] + 0.06]);
  ctx.fitMexico = (o) => atlas.fit(MEXICO, o);

  function refill() { for (const it of ctx.items) it.fill = cfg.fill(it, ctx.theme); }
  ctx.setItems = (list) => { ctx.items = list; refill(); atlas.setItems(list); rebuildIndex(); };
  ctx.restyle = () => { refill(); atlas.restyle(); renderLegend(); renderPanel(); tipKey = ''; };

  function setStatus(text, kind = 'info') {
    statusEl.hidden = !text;
    statusEl.textContent = text || '';
    statusEl.dataset.kind = kind;
  }
  ctx.setStatus = setStatus;

  /* ---------- Selección ---------- */
  function select(ids, how = 'replace') {
    const byId = new Map(ctx.items.map((i) => [i.id, i]));
    const valid = ids.filter((id) => byId.get(id) && byId.get(id).selectable !== false);
    let sel = how === 'replace' ? new Set() : new Set(ctx.selection);
    if (how === 'replace' || how === 'add') valid.forEach((id) => sel.add(id));
    else if (how === 'remove') valid.forEach((id) => sel.delete(id));
    else if (how === 'toggle') valid.forEach((id) => (sel.has(id) ? sel.delete(id) : sel.add(id)));
    ctx.selection = sel;
    atlas.setSelection(sel);
    renderPanel();
  }
  ctx.select = select;
  ctx.selectedItems = () => ctx.items.filter((i) => ctx.selection.has(i.id));

  /* ---------- Panel ---------- */
  function renderPanel() {
    const list = ctx.selectedItems();
    const has = list.length > 0;
    const out = cfg.panel(list);
    clearBtn.hidden = !has;
    introEl.hidden = has || !out.intro;
    searchWrap.hidden = has;
    if (has) closeResults();
    scopeEl.textContent = out.scope;
    if (!has && out.intro != null) introEl.innerHTML = out.intro;
    tableEl.innerHTML = out.table || '';
    footEl.innerHTML = out.foot || '';
  }
  ctx.renderPanel = renderPanel;
  function renderLegend() {
    const html = cfg.legend();
    legendEl.innerHTML = html;
    $('#axLegend2').innerHTML = html;
  }
  ctx.renderLegend = renderLegend;

  /* ---------- Tooltip ---------- */
  const GX = 84, GY = 40;
  let tipKey = '', tipW = 0, tipH = 0;
  function showTip(it, p) {
    if (!it || !p) { hideTip(); return; }
    const key = `${it.id}|${ctx.theme}|${cfg.tipKey ? cfg.tipKey() : ''}`;
    if (key !== tipKey || tipEl.hidden) {
      const sub = it.kind === 'mun' ? ENTIDADES[it.cve]?.[0] : it.kind === 'estado' ? 'Gubernatura 2027' : '';
      tipEl.innerHTML = `<div class="ax-tip-h"><b>${escapeHTML(it.name)}</b>${sub ? `<span>${sub}</span>` : ''}</div><div class="ax-tip-b">${cfg.tip(it)}</div>`;
      tipEl.hidden = false;
      tipW = tipEl.offsetWidth; tipH = tipEl.offsetHeight;
      tipKey = key;
    }
    const { w, h } = atlas.size;
    const right = p.x + GX + tipW <= w - 8 || p.x - GX - tipW < 8;
    const above = p.y - GY - tipH >= 8 || p.y + GY + tipH > h - 8;
    let x = right ? p.x + GX : p.x - GX - tipW;
    let y = above ? p.y - GY - tipH : p.y + GY;
    x = Math.max(8, Math.min(w - tipW - 8, x));
    y = Math.max(8, Math.min(h - tipH - 8, y));
    tipEl.style.transform = `translate(${x}px, ${y}px)`;
    const sx = right ? x : x + tipW, sy = above ? y + tipH - 22 : y + 22;
    const ex = p.x + (right ? 3 : -3), ey = p.y + (above ? -7 : 7);
    const tx = ex - ex, ty = ey - sy, L = Math.hypot(tx, ty) || 1, ux = tx / L, uy = ty / L, s = 7;
    const d = `M${sx},${sy} Q${ex},${sy} ${ex},${ey} M${ex - ux * s - uy * s * 0.6},${ey - uy * s + ux * s * 0.6} L${ex},${ey} L${ex - ux * s + uy * s * 0.6},${ey - uy * s - ux * s * 0.6}`;
    leadEl.querySelectorAll('path').forEach((el) => el.setAttribute('d', d));
    leadEl.removeAttribute('hidden');
  }
  function hideTip() {
    if (!tipEl.hidden) tipEl.hidden = true;
    if (!leadEl.hasAttribute('hidden')) leadEl.setAttribute('hidden', '');
  }

  /* ---------- Capas y barra ---------- */
  function openLayers(open) {
    layersEl.hidden = !open;
    layersBtn.setAttribute('aria-expanded', String(open));
    layersBtn.classList.toggle('is-on', open);
  }
  layersEl.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.act === 'spikes') {
      ctx.spikesOn = !ctx.spikesOn;
      b.setAttribute('aria-pressed', String(ctx.spikesOn));
      atlas.setSpikes(ctx.spikesOn && cfg.spike ? cfg.spike : null);
      renderLegend();
      return;
    }
    cfg.onLayers(b);
  });
  function syncThemeBtn() {
    const btn = $('#axTheme'), pref = themePref();
    btn.innerHTML = THEME_ICONS[pref];
    btn.setAttribute('aria-label', `Tema: ${themeLabel(pref)}`);
    btn.title = `Tema: ${themeLabel(pref)}`;
  }
  syncThemeBtn();
  let outlinesOn = false;
  root.querySelector('.ax').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act], [data-go], [data-pick]');
    if (!b || layersEl.contains(b)) return;
    if (b.dataset.go) { navigate(b.dataset.go); return; }
    if (b.dataset.pick) { pickId(b.dataset.pick); return; }
    const act = b.dataset.act;
    if (act === 'theme') cycleTheme();
    else if (act === 'reset') atlas.fit(MEXICO);
    else if (act === 'tilt') { atlas.setTilt(!atlas.tilted); b.setAttribute('aria-pressed', String(atlas.tilted)); b.classList.toggle('is-on', atlas.tilted); }
    else if (act === 'outlines') { outlinesOn = !outlinesOn; atlas.setOutlinesStrong(outlinesOn); b.setAttribute('aria-pressed', String(outlinesOn)); b.classList.toggle('is-on', outlinesOn); }
    else if (act === 'layers') openLayers(layersEl.hidden);
    else if (act === 'clear') select([], 'replace');
    else if (act === 'collapse') {
      const collapsed = panel.classList.toggle('is-collapsed');
      b.setAttribute('aria-expanded', String(!collapsed));
      b.setAttribute('aria-label', collapsed ? 'Expandir panel' : 'Contraer panel');
      b.innerHTML = collapsed ? I.plus : I.minus;
    }
  });

  /* ---------- Buscador ---------- */
  let index = [], results = [], active = -1;
  const norm = (s) => slugify(s).replace(/-/g, ' ');
  function rebuildIndex() { index = (cfg.index ? cfg.index() : []).map((e) => ({ ...e, norm: norm(e.label) })); }
  function search(q) {
    const n = norm(q);
    if (!n) return [];
    const out = [];
    for (const e of index) {
      const i = e.norm.indexOf(n);
      if (i < 0) continue;
      out.push([(i === 0 ? 0 : e.norm[i - 1] === ' ' ? 1 : 3) + (e.rank || 0) + e.norm.length / 300, e]);
    }
    return out.sort((a, b) => a[0] - b[0]).slice(0, 8).map((x) => x[1]);
  }
  function renderResults() {
    const open = results.length > 0 || searchEl.value.trim().length > 0;
    resultsEl.hidden = !open;
    searchEl.setAttribute('aria-expanded', String(open));
    if (!results.length) {
      resultsEl.innerHTML = searchEl.value.trim() ? '<li class="ax-r-empty" role="presentation">Sin coincidencias.</li>' : '';
      searchEl.removeAttribute('aria-activedescendant');
      return;
    }
    resultsEl.innerHTML = results.map((r, i) => `<li role="option" id="axr-${i}" data-i="${i}" aria-selected="${i === active}">
      <b>${escapeHTML(r.label)}</b><span>${escapeHTML(r.sub)}</span></li>`).join('');
    if (active >= 0) searchEl.setAttribute('aria-activedescendant', `axr-${active}`);
  }
  function closeResults() { results = []; active = -1; resultsEl.hidden = true; searchEl.setAttribute('aria-expanded', 'false'); }
  function pick(r) {
    if (!r) return;
    searchEl.value = '';
    closeResults();
    if (r.ids?.length) select(r.ids, 'replace');
    if (r.bbox) atlas.fit(r.bbox, { maxZoom: r.maxZoom || 9.5 });
  }
  function pickId(id) {
    const it = ctx.items.find((i) => i.id === id);
    if (!it) return;
    select([id], 'replace');
    atlas.fit(it.geom.bbox, { maxZoom: it.kind === 'mun' ? 10.5 : 7.5 });
  }
  ctx.pickId = pickId;
  searchEl.addEventListener('input', () => { results = search(searchEl.value); active = results.length ? 0 : -1; renderResults(); });
  searchEl.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' && results.length) { e.preventDefault(); active = (active + 1) % results.length; renderResults(); }
    else if (e.key === 'ArrowUp' && results.length) { e.preventDefault(); active = (active - 1 + results.length) % results.length; renderResults(); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(results[Math.max(0, active)]); }
    else if (e.key === 'Escape') { e.stopPropagation(); if (searchEl.value) { searchEl.value = ''; closeResults(); } else searchEl.blur(); }
  });
  resultsEl.addEventListener('pointerdown', (e) => {
    const li = e.target.closest('[data-i]');
    if (!li) return;
    e.preventDefault();
    pick(results[Number(li.dataset.i)]);
  });
  searchEl.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== searchEl) closeResults(); }, 120));

  /* ---------- Eventos globales ---------- */
  const onTheme = (e) => { ctx.theme = e.detail.theme; atlas.setTheme(ctx.theme); syncThemeBtn(); ctx.restyle(); };
  const onKey = (e) => {
    if (e.key !== 'Escape') return;
    if (!layersEl.hidden) { openLayers(false); layersBtn.focus(); return; }
    if (ctx.selection.size && !e.target.closest?.('input')) select([], 'replace');
  };
  const onDocDown = (e) => {
    if (!layersEl.hidden && !layersEl.contains(e.target) && !layersBtn.contains(e.target)) openLayers(false);
  };
  window.addEventListener('mirador:theme', onTheme);
  window.addEventListener('keydown', onKey);
  document.addEventListener('pointerdown', onDocDown, true);

  ctx.destroy = () => {
    ctx.alive = false;
    cleanups.forEach((fn) => { try { fn(); } catch { /* noop */ } });
    atlas.destroy();
    window.removeEventListener('mirador:theme', onTheme);
    window.removeEventListener('keydown', onKey);
    document.removeEventListener('pointerdown', onDocDown, true);
    document.body.classList.remove('atlas-mode');
  };
  return ctx;
}

/** Botones de un radiogroup de capas: marca aria-checked según el valor actual. */
export function syncRadios(root, attr, value) {
  root.querySelectorAll(`[data-${attr}]`).forEach((b) => b.setAttribute('aria-checked', String(b.dataset[attr] === value)));
}

/** Chips de partido para la capa "Partido". */
export function partyChips() {
  return PARTY_ORDER.map((p) => `<button type="button" role="radio" data-party="${p}"><span class="ax-dot" style="--c:${PARTIES[p].color}"></span>${shortParty(p)}</button>`).join('');
}

/** Leyenda estándar por modo. */
export function legendFor(mode, { leaders, cap, party, range, unit = 'pp' }) {
  const steps = (p, ts) => ts.map((t) => `<i style="background:${ramp(p, t)}"></i>`).join('');
  if (mode === 'margen') {
    return `<div class="ax-lg-grid">${leaders.map((p) => `<span class="ax-lg-n">${shortParty(p)}</span><span class="ax-lg-ramp">${steps(p, [0.1, 0.32, 0.55, 0.78, 1])}</span>`).join('')}</div>
      <div class="ax-lg-scale"><span>0</span><span>margen ${cap}+ ${unit}</span></div>`;
  }
  if (mode === 'ganador') return `<div class="ax-lg-sw">${leaders.map((p) => `<span>${dot(p)}${shortParty(p)}</span>`).join('')}</div>`;
  return `<p class="ax-lg-h">${partyName(party)}</p><span class="ax-lg-ramp ax-lg-wide">${steps(party, [0.06, 0.3, 0.52, 0.74, 0.96])}</span>
    <div class="ax-lg-scale"><span>${pct1(range[0])}</span><span>${pct1(range[1])}</span></div>`;
}

export { fmtNum, PARTY_ORDER, PARTIES };
