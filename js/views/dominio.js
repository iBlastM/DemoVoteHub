// ============================================================
// views/dominio.js — Mapa de dominio a pantalla completa, versión
// mexicana del mapa por casilla de VoteHub 2024:
//   · los ~700 municipios de las 17 entidades con elección, coloreados
//     por capa (Margen, Ganador, Cambio, Oportunidad 2021);
//   · panel de resultados con buscador y tabla por fuerza que se
//     recalcula con la selección (clic, ⇧ + clic, recuadro ⇧ / Ctrl);
//   · herramientas de perspectiva, contornos, picos 3D y tema.
// La proyección estatal viene del agregado de encuestas reales; el
// desglose municipal es ILUSTRATIVO (ajustado para que su suma
// ponderada por lista nominal reproduzca la proyección estatal).
// ============================================================

import { store } from '../store.js';
import { PARTIES, PARTY_ORDER } from '../config.js';
import { loadMunicipios } from '../map.js';
import { loadHist2021 } from '../hist2021.js';
import { statsMunicipio } from '../padron.js';
import { navigate } from '../router.js';
import { createAtlas, toWorldGeometry, unionBBox } from '../atlas.js';
import { resolvedTheme, cycleTheme, themePref, themeLabel, THEME_ICONS } from '../theme.js';
import { slugify, clamp, fmtNum, rng, seedFrom } from '../utils.js';

/* ---------- Catálogo de entidades ---------- */
const ENTIDADES = {
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
const QRO = 22;                       // única entidad con base municipal 2021 real

/* ---------- Iconos (trazo 1.6, 20×20) ---------- */
const I = {
  home: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3.5 9 10 3.5 16.5 9M5 8v8.5h10V8"/></svg>',
  tilt: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 4h8l3.5 12h-15Z"/><path d="M8.6 4 7.7 16M11.4 4l.9 12M4.2 8.2h11.6M3.3 12h13.4"/></svg>',
  outline: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 7V4h3M13 4h3v3M16 13v3h-3M7 16H4v-3M9 4h2M9 16h2M4 9v2M16 9v2"/></svg>',
  layers: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m10 3 7 3.6-7 3.6-7-3.6Z"/><path d="m3 10.2 7 3.6 7-3.6M3 13.6l7 3.6 7-3.6"/></svg>',
  close: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5.5 5.5 9 9M14.5 5.5l-9 9"/></svg>',
  minus: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 10h10"/></svg>',
  plus: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 10h10M10 5v10"/></svg>',
  search: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.8" cy="8.8" r="5.3"/><path d="m12.8 12.8 4 4"/></svg>',
  boxAdd: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 6V3h3M14 3h3v3M17 14v3h-3M6 17H3v-3M8.5 3h3M8.5 17h3M3 8.5v3M17 8.5v3"/></svg>',
  boxRemove: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 6V3h3M14 3h3v3M17 14v3h-3M6 17H3v-3M8.5 3h3M8.5 17h3M3 8.5v3M17 8.5v3M7 10h6"/></svg>',
  arrow: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h11M11 6l4 4-4 4"/></svg>',
  tools: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 6V3h3M14 3h3v3M17 14v3h-3M6 17H3v-3"/><path d="m8 8 5 2-2 1-1 2Z"/></svg>',
};

/* ---------- Color ---------- */
const rgbOf = (hex) => { const h = hex.replace('#', ''); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); };
const mixRgb = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const css = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;
const PAL = Object.fromEntries(Object.values(PARTIES).map((p) => {
  const base = rgbOf(p.color);
  return [p.id, { base, soft: rgbOf(p.colorSoft), deep: mixRgb(base, [12, 10, 22], 0.38) }];
}));
const MARGIN_CAP = 40;              // pp: margen al que la rampa llega a su tono más profundo
/** Rampa suave → color → profundo (t de 0 a 1). */
function ramp(party, t) {
  const P = PAL[party];
  if (!P) return 'rgb(150,156,166)';
  t = clamp(t, 0, 1);
  return t < 0.55 ? css(mixRgb(P.soft, P.base, t / 0.55)) : css(mixRgb(P.base, P.deep, (t - 0.55) / 0.45));
}
const NEUTRAL = {
  light: { none: 'rgba(120,128,142,.16)', nodata: 'rgba(132,140,154,.42)', keep: [214, 218, 226] },
  dark: { none: 'rgba(150,160,178,.10)', nodata: 'rgba(120,128,144,.38)', keep: [86, 92, 106] },
};

/* ---------- Modelo municipal ilustrativo ---------- */
const FIELD = Object.fromEntries(PARTY_ORDER.map((p) => {
  const u = rng(seedFrom('campo-municipal:' + p));
  return [p, Array.from({ length: 3 }, () => [0.18 + u() * 0.5, 0.18 + u() * 0.5, u() * 6.283, u() * 6.283])];
}));
function field(party, x, y) {
  const f = FIELD[party];
  if (!f) return 0;
  let v = 0;
  for (const [fx, fy, a, b] of f) v += Math.sin(x * fx + a) * Math.cos(y * fy + b);
  return v / 3;
}
function unit(key, salt) {
  let h = 2166136261;
  const s = `${key}:${salt}`;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 100000) / 100000;
}
function rankShares(shares) {
  return Object.entries(shares).filter(([p]) => PARTIES[p]).sort((a, b) => b[1] - a[1]);
}

/**
 * Municipios de una entidad con una proyección ilustrativa: campo espacial
 * suave + variación local, ajustado por proporciones iterativas para que el
 * promedio ponderado por lista nominal coincida con la proyección estatal.
 */
function buildMunicipios(estado, geo) {
  const parties = Object.keys(estado.voto).filter((p) => PARTIES[p]);
  const otros = estado.voto.Otros || 0;
  const list = [];
  for (const f of geo.features || []) {
    const geom = toWorldGeometry(f.geometry);
    if (!geom.polys.length) continue;
    const cv = String(f.properties.cvegeo);
    const st = statsMunicipio(store.padronData, cv);
    const lx = geom.label[0] * 360, ly = geom.label[1] * 360;
    const raw = {};
    parties.forEach((p, i) => {
      const base = estado.voto[p] * 100;
      const noise = field(p, lx, ly) * 7 + (unit(cv, i) - 0.5) * 6;
      raw[p] = Math.max(0.3, base + noise * Math.sqrt(Math.max(base, 2) / 30));
    });
    list.push({
      id: 'm:' + cv, kind: 'mun', group: estado.cve, border: true, cvegeo: cv, name: f.properties.name || `Municipio ${cv}`,
      estado, cve: estado.cve, geom, ln: st ? Number(st[1]) || 0 : 0, padron: st ? Number(st[0]) || 0 : 0, lnKnown: !!st, raw,
    });
  }
  const weight = (m) => m.ln || 1;
  const W = list.reduce((s, m) => s + weight(m), 0) || 1;
  for (let it = 0; it < 6; it++) {
    for (const p of parties) {
      const mean = list.reduce((s, m) => s + m.raw[p] * weight(m), 0) / W;
      const k = mean > 0 ? (estado.voto[p] * 100) / mean : 1;
      for (const m of list) m.raw[p] *= k;
    }
    for (const m of list) {
      const sum = parties.reduce((s, p) => s + m.raw[p], 0) || 1;
      const k = ((1 - otros) * 100) / sum;
      for (const p of parties) m.raw[p] *= k;
    }
  }
  for (const m of list) {
    m.shares = Object.fromEntries(parties.map((p) => [p, m.raw[p] / 100]));
    m.shares.Otros = otros;
    delete m.raw;
    const r = rankShares(m.shares);
    m.leader = r[0][0];
    m.margin = (r[0][1] - (r[1] ? r[1][1] : 0)) * 100;
    m.prob = clamp(0.5 + m.margin / 34, 0.5, 0.97);
  }
  return list;
}

/* ---------- Vista ---------- */
export function render(root) {
  document.body.classList.add('atlas-mode');
  let alive = true;

  const estadosByCve = new Map(store.estados.map((e) => [e.cve, e]));
  const updated = store.updatedLabel;

  root.innerHTML = `
  <section class="ax" aria-label="Mapa de dominio">
    <div class="ax-map" id="axMap" role="region"
      aria-label="Mapa de municipios. Arrastra para desplazar, rueda o pellizco para acercar; usa el buscador del panel para seleccionar estados o municipios."></div>

    <div class="ax-status" id="axStatus" role="status" hidden></div>
    <div class="ax-tip" id="axTip" hidden></div>

    <div class="ax-tools" id="axTools">
      <div class="ax-tools-head">
        <span>Herramientas</span>
        <button class="ax-icon-sm" type="button" data-act="tools-close" aria-label="Cerrar herramientas">${I.close}</button>
      </div>
      <div class="ax-tools-row" title="Mantén ⇧ y arrastra para añadir municipios a la selección. ⇧ + clic suma uno.">
        <kbd>⇧</kbd>${I.boxAdd}<span>Añadir</span>
      </div>
      <div class="ax-tools-row" title="Mantén Ctrl y arrastra para quitar municipios de la selección.">
        <kbd>Ctrl</kbd>${I.boxRemove}<span>Quitar</span>
      </div>
    </div>
    <button class="ax-tools-open" type="button" data-act="tools-open" aria-label="Mostrar herramientas" title="Herramientas de selección" hidden>${I.tools}</button>

    <div class="ax-bar" role="toolbar" aria-label="Controles del mapa">
      <button class="ax-btn" type="button" data-act="theme" id="axTheme"></button>
      <button class="ax-btn" type="button" data-act="reset" aria-label="Restablecer vista" title="Restablecer vista">${I.home}</button>
      <button class="ax-btn" type="button" data-act="tilt" aria-pressed="false" aria-label="Perspectiva" title="Perspectiva">${I.tilt}</button>
      <button class="ax-btn" type="button" data-act="outlines" aria-pressed="false" aria-label="Contornos de estados y municipios" title="Contornos">${I.outline}</button>
      <button class="ax-btn" type="button" data-act="layers" aria-expanded="false" aria-controls="axLayers" aria-label="Capas del mapa" title="Capas">${I.layers}</button>
    </div>

    <div class="ax-layers" id="axLayers" role="dialog" aria-label="Capas del mapa" hidden>
      <div class="ax-modes" role="radiogroup" aria-label="Capa">
        <button type="button" role="radio" data-mode="margen">Margen</button>
        <button type="button" role="radio" data-mode="ganador">Ganador</button>
        <button type="button" role="radio" data-mode="cambio">Cambio</button>
        <button type="button" role="radio" data-mode="oportunidad">Oportunidad</button>
      </div>
      <div class="ax-sub" data-for="margen">
        <p class="ax-sub-h">Intensidad del color</p>
        <div class="ax-chips" role="radiogroup" aria-label="Intensidad">
          <button type="button" role="radio" data-metric="margen">Margen</button>
          <button type="button" role="radio" data-metric="prob">Probabilidad</button>
        </div>
      </div>
      <div class="ax-sub" data-for="cambio">
        <p class="ax-sub-h">Comparar contra</p>
        <div class="ax-chips" role="radiogroup" aria-label="Base de comparación">
          <button type="button" role="radio" data-base="gob">Partido gobernante</button>
          <button type="button" role="radio" data-base="2021">Voto 2021 · Qro.</button>
        </div>
      </div>
      <div class="ax-sub" data-for="oportunidad">
        <p class="ax-sub-h">Voto 2021 por partido</p>
        <div class="ax-chips ax-chips-party" role="radiogroup" aria-label="Partido">
          ${PARTY_ORDER.map((p) => `<button type="button" role="radio" data-party="${p}"><span class="ax-dot" style="--c:${PARTIES[p].color}"></span>${p === 'MORENA' ? 'Morena' : p}</button>`).join('')}
        </div>
        <p class="ax-note">Resultados reales de la gubernatura 2021, solo para los municipios de Querétaro. Los otros 16 estados no tienen base municipal 2021 en esta demo.</p>
      </div>
      <button class="ax-toggle" type="button" data-act="spikes" aria-pressed="false">
        <span class="ax-toggle-box" aria-hidden="true"></span>Picos 3D · lista nominal
      </button>
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
            placeholder="Busca un estado o municipio…" aria-label="Buscar estado o municipio"
            role="combobox" aria-expanded="false" aria-controls="axResults" aria-autocomplete="list" />
          <ul class="ax-results" id="axResults" role="listbox" aria-label="Resultados de búsqueda" hidden></ul>
        </div>
        <div class="ax-table" id="axTable"></div>
        <footer class="ax-pfoot" id="axFoot"></footer>
      </div>
    </aside>
  </section>`;

  const $ = (s) => root.querySelector(s);
  const mapEl = $('#axMap'), tipEl = $('#axTip'), statusEl = $('#axStatus');
  const panel = $('#axPanel'), scopeEl = $('#axScope'), clearBtn = $('#axClear');
  const introEl = $('#axIntro'), searchWrap = $('#axSearchWrap'), searchEl = $('#axSearch'), resultsEl = $('#axResults');
  const tableEl = $('#axTable'), footEl = $('#axFoot'), legendEl = $('#axLegend');
  const layersEl = $('#axLayers'), layersBtn = root.querySelector('[data-act="layers"]');
  const toolsEl = $('#axTools'), toolsOpen = root.querySelector('[data-act="tools-open"]');

  /* ---------- Estado de la vista ---------- */
  let mode = 'margen';
  let metric = 'margen';
  let baseline = 'gob';
  let opParty = 'PAN';
  let spikesOn = false;
  let outlinesOn = false;
  let themeName = resolvedTheme();
  let hist = null;
  let histPromise = null;
  let selection = new Set();
  let hoverItem = null;

  const noneItems = [];              // entidades sin elección
  const stateItems = new Map();      // cve → item estatal (antes de cargar municipios)
  const munisByCve = new Map();      // cve → municipios
  let items = [];
  let maxLn = 1;

  const outlineItems = [];
  for (const f of store.geoData.features) {
    const cve = parseInt(f.properties.cvegeo, 10);
    const geom = toWorldGeometry(f.geometry);
    const estado = estadosByCve.get(cve);
    // Las 17 entidades con elección dibujan su frontera desde sus propios
    // polígonos (ver atlas.js); el contorno estatal aproximado solo se usa
    // para las entidades sin elección.
    outlineItems.push({ id: 'o:' + cve, geom, covered: !!estado });
    const [nombre, abr] = ENTIDADES[cve] || [f.properties.nom_edo, ''];
    if (estado) {
      stateItems.set(cve, {
        id: 's:' + cve, kind: 'estado', group: cve, border: true, estado, cve, name: estado.nombre, geom,
        ln: estado.listaNominal, shares: estado.voto, leader: estado.favorito,
        margin: estado.margen, prob: estado.probFav, spike: false,
      });
    } else {
      noneItems.push({ id: 'n:' + cve, kind: 'none', cve, name: nombre, abr, geom, selectable: false, separator: false, spike: false });
    }
  }
  const MEXICO = unionBBox(outlineItems.map((o) => o.geom.bbox));
  const stateBBox = (cve) => outlineItems.find((o) => o.id === 'o:' + cve)?.geom.bbox;

  /* ---------- Atlas ---------- */
  const atlas = createAtlas(mapEl, {
    onHover: (it, p) => { hoverItem = it; showTip(it, p); },
    onClick: onMapClick,
    onBox: (hit, how) => select(hit.map((h) => h.id), how === 'remove' ? 'remove' : 'add'),
    onView: () => { if (hoverItem) hideTip(); },
    padding: fitPadding,
  });
  atlas.setTheme(themeName);
  atlas.setOutlines(outlineItems);
  const pad = 0.06;
  atlas.setLimits([MEXICO[0] - pad, MEXICO[1] - pad, MEXICO[2] + pad, MEXICO[3] + pad]);

  function fitPadding() {
    const wide = window.innerWidth > 860;
    const pr = panel.getBoundingClientRect();
    if (wide) return { top: 64, right: 12, bottom: 12, left: pr.width + 28 };
    return { top: 64, right: 0, bottom: Math.min(pr.height, window.innerHeight * 0.5) + 8, left: 0 };
  }

  /* ---------- Contenido ---------- */
  function rebuildItems() {
    const list = [...noneItems];
    for (const e of store.estados) list.push(...(munisByCve.get(e.cve) || [stateItems.get(e.cve)]));
    items = list.filter(Boolean);
    maxLn = Math.max(1, ...items.filter((i) => i.kind === 'mun').map((i) => i.ln));
    refill();
    atlas.setItems(items);
  }

  function histOf(it) {
    if (!hist || it.kind !== 'mun' || it.cve !== QRO) return null;
    return hist[slugify(it.name)] || null;
  }
  function gainOf(it, h) {
    let best = null;
    for (const p of PARTY_ORDER) {
      if (!(p in h.partidos) || !(p in it.shares) || !h.votos) continue;
      const g = it.shares[p] - h.partidos[p] / h.votos;
      if (!best || g > best.gain) best = { party: p, gain: g };
    }
    return best;
  }
  let opRange = [0, 1];
  function computeOpRange() {
    const vals = (munisByCve.get(QRO) || []).map(histOf).filter(Boolean).map((h) => (h.votos ? (h.partidos[opParty] || 0) / h.votos : 0));
    opRange = vals.length ? [Math.min(...vals), Math.max(...vals)] : [0, 1];
  }

  function fillOf(it) {
    const N = NEUTRAL[themeName];
    if (it.kind === 'none') return N.none;
    if (mode === 'margen') {
      const t = metric === 'prob' ? (it.prob - 0.5) / 0.47 : it.margin / MARGIN_CAP;
      return ramp(it.leader, 0.1 + 0.9 * clamp(t, 0, 1));
    }
    if (mode === 'ganador') return css(PAL[it.leader].base);
    if (mode === 'cambio' && baseline === 'gob') {
      return it.leader !== it.estado.gob ? ramp(it.leader, 0.72) : keepColor(it.leader);
    }
    const h = histOf(it);
    if (!h) return N.nodata;
    if (mode === 'cambio') {
      const g = gainOf(it, h);
      return g ? ramp(g.party, 0.12 + 0.88 * clamp(g.gain / 0.25, 0, 1)) : N.nodata;
    }
    const s = h.votos ? (h.partidos[opParty] || 0) / h.votos : 0;
    const t = opRange[1] > opRange[0] ? (s - opRange[0]) / (opRange[1] - opRange[0]) : 0.5;
    return ramp(opParty, 0.06 + 0.9 * t);
  }
  function keepColor(p) { return css(mixRgb(mixRgb(PAL[p].soft, PAL[p].base, 0.25), NEUTRAL[themeName].keep, 0.35)); }
  function refill() {
    if (mode === 'oportunidad') computeOpRange();
    for (const it of items) it.fill = fillOf(it);
  }
  function restyle() { refill(); atlas.restyle(); renderLegend(); renderPanel(); }

  function spikeOf(it) {
    if (it.kind !== 'mun' || !it.ln) return null;
    const color = mode === 'oportunidad' ? PARTIES[opParty].color
      : mode === 'cambio' && baseline === '2021' ? (it.fill || PARTIES[it.leader].color)
        : PARTIES[it.leader].color;
    return { h: Math.pow(it.ln / maxLn, 0.72), color };
  }

  /* ---------- Carga progresiva de municipios ---------- */
  const pending = [...store.estados].sort((a, b) => (a.cve === QRO ? -1 : b.cve === QRO ? 1 : 0));
  const total = pending.length;
  let loaded = 0, failed = 0;
  const waiters = new Map();
  const ready = (cve) => (munisByCve.has(cve) ? Promise.resolve() : new Promise((r) => {
    const list = waiters.get(cve) || [];
    list.push(r); waiters.set(cve, list);
  }));

  function setStatus(text, kind = 'info') {
    statusEl.hidden = !text;
    statusEl.textContent = text || '';
    statusEl.dataset.kind = kind;
  }
  function loadingText() { return `Cargando municipios · ${loaded} de ${total}`; }
  setStatus(loadingText());

  async function worker() {
    while (alive && pending.length) {
      const estado = pending.shift();
      try {
        const geo = await loadMunicipios(estado);
        if (!alive) return;
        const munis = buildMunicipios(estado, geo);
        if (!munis.length) throw new Error('sin geometría');
        munisByCve.set(estado.cve, munis);
        const sid = 's:' + estado.cve;
        if (selection.has(sid)) { selection.delete(sid); munis.forEach((m) => selection.add(m.id)); atlas.setSelection(selection); }
      } catch {
        failed++;
      }
      loaded++;
      (waiters.get(estado.cve) || []).forEach((r) => r());
      waiters.delete(estado.cve);
      rebuildItems();
      rebuildIndex();
      renderLegend();
      renderPanel();
      if (loaded < total) setStatus(loadingText());
      else if (failed) setStatus(`No se cargaron los municipios de ${failed} ${failed === 1 ? 'estado' : 'estados'}; se muestran a nivel estatal.`, 'warn');
      else { setStatus(''); }
    }
  }

  /* ---------- Selección ---------- */
  function select(ids, how = 'replace') {
    const valid = ids.filter((id) => { const it = items.find((i) => i.id === id); return it && it.selectable !== false; });
    if (how === 'replace') selection = new Set(valid);
    else if (how === 'add') valid.forEach((id) => selection.add(id));
    else if (how === 'remove') valid.forEach((id) => selection.delete(id));
    else if (how === 'toggle') valid.forEach((id) => (selection.has(id) ? selection.delete(id) : selection.add(id)));
    selection = new Set(selection);
    atlas.setSelection(selection);
    renderPanel();
  }
  function clearSelection() { if (selection.size) select([], 'replace'); }
  function idsOfState(cve) { return (munisByCve.get(cve) || [stateItems.get(cve)]).filter(Boolean).map((i) => i.id); }

  function onMapClick(it, info) {
    if (!it || it.selectable === false) return;
    if (info.remove) { select([it.id], 'remove'); return; }
    if (info.shift) { select([it.id], 'toggle'); return; }
    if (selection.size === 1 && selection.has(it.id)) { clearSelection(); return; }
    select([it.id], 'replace');
  }

  function selectedItems() { return items.filter((i) => selection.has(i.id)); }

  /** Una sola entidad completa seleccionada → su item estatal real. */
  function wholeState(list) {
    if (!list.length) return null;
    const cve = list[0].cve;
    if (list.some((i) => i.cve !== cve)) return null;
    const all = idsOfState(cve);
    return all.length === list.length ? estadosByCve.get(cve) : null;
  }

  /* ---------- Agregación ---------- */
  function aggregate(list) {
    const est = wholeState(list);
    if (est) {
      const sums = {};
      for (const [p, s] of Object.entries(est.voto)) sums[p] = s * est.listaNominal;
      return { sums, ln: est.listaNominal, estado: est, known: true };
    }
    const sums = {};
    let ln = 0;
    for (const m of list) {
      ln += m.ln;
      for (const [p, s] of Object.entries(m.shares)) sums[p] = (sums[p] || 0) + s * m.ln;
    }
    if (!ln) {
      for (const m of list) for (const [p, s] of Object.entries(m.shares)) sums[p] = (sums[p] || 0) + s / list.length;
      return { sums, ln: 0, known: false };
    }
    return { sums, ln, known: true };
  }
  function nationalAggregate() {
    const sums = {};
    let ln = 0;
    for (const e of store.estados) {
      ln += e.listaNominal;
      for (const [p, s] of Object.entries(e.voto)) sums[p] = (sums[p] || 0) + s * e.listaNominal;
    }
    return { sums, ln, known: true };
  }
  function hist2021Of(list) {
    const sums = {};
    let votos = 0, ln = 0, n = 0;
    for (const m of list) {
      const h = histOf(m);
      if (!h) continue;
      n++; votos += h.votos; ln += h.nominal;
      for (const [p, v] of Object.entries(h.partidos)) sums[p] = (sums[p] || 0) + v;
    }
    return { sums, votos, ln, n };
  }

  /* ---------- Panel ---------- */
  const partyName = (p) => (p === 'Otros' ? 'Otros' : PARTIES[p]?.nombre || p);
  const partySub = (p) => (p === 'Otros' ? 'No modelados y sin definir' : PARTIES[p]?.coalicion || '');
  const dot = (p) => `<span class="ax-dot" style="--c:${PARTIES[p]?.color || 'var(--ax-muted)'}"></span>`;
  const pct1 = (x) => `${(x * 100).toFixed(1)}%`;
  const pp = (x) => `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(1)} pp`;

  function seatsBar() {
    const counts = PARTY_ORDER.map((p) => [p, store.resumen.porFavorito[p] || 0]).filter(([, n]) => n > 0);
    return `<div class="ax-seats">
      <div class="ax-seats-lbl">${counts.map(([p, n]) => `<span style="flex:${n}">${n >= 2 ? (p === 'MORENA' ? 'Morena' : p) : ''}</span>`).join('')}</div>
      <div class="ax-seats-bar" role="img" aria-label="${counts.map(([p, n]) => `${partyName(p)} encabeza ${n}`).join(', ')}">
        ${counts.map(([p, n]) => `<span style="flex:${n};--c:${PARTIES[p].color};--t:${PARTIES[p].tinta}" title="${partyName(p)}: encabeza ${n} de 17">${n}</span>`).join('')}
      </div>
      <p class="ax-seats-cap">Fuerza que encabeza cada una de las 17 gubernaturas</p>
    </div>`;
  }

  function tableProjection(agg, leaderMark = true) {
    const total = Object.values(agg.sums).reduce((a, b) => a + b, 0) || 1;
    const rows = Object.entries(agg.sums).filter(([p]) => p === 'Otros' || PARTIES[p])
      .sort((a, b) => (a[0] === 'Otros') - (b[0] === 'Otros') || b[1] - a[1]);
    const lead = rows[0]?.[0];
    return `<table class="ax-t">
      <thead><tr><th scope="col">Fuerza</th><th scope="col" title="Proporción proyectada × lista nominal. No son votos emitidos.">Apoyo est.</th><th scope="col">%</th></tr></thead>
      <tbody>${rows.map(([p, v]) => `<tr>
        <th scope="row">${dot(p)}<span class="ax-pn"><span>${partyName(p)}${leaderMark && p === lead ? '<span class="ax-lead">lidera</span>' : ''}</span><em>${partySub(p)}</em></span></th>
        <td>${agg.known ? fmtNum(Math.round(v)) : '—'}</td><td>${pct1(v / total)}</td></tr>`).join('')}</tbody>
    </table>`;
  }

  function tableShift2021(list) {
    const h = hist2021Of(list);
    if (!h.n) return emptyNote('Sin base municipal 2021 para esta selección. Solo Querétaro tiene resultados 2021 en la demo.');
    const agg = aggregate(list.filter(histOf));
    const tot27 = Object.values(agg.sums).reduce((a, b) => a + b, 0) || 1;
    const rows = PARTY_ORDER.filter((p) => p in h.sums).map((p) => {
      const s21 = h.sums[p] / h.votos, s27 = (agg.sums[p] || 0) / tot27;
      return { p, s21, s27, d: s27 - s21 };
    }).sort((a, b) => b.s27 - a.s27);
    const best = [...rows].sort((a, b) => b.d - a.d)[0];
    return `<table class="ax-t ax-t4">
      <thead><tr><th scope="col">Fuerza</th><th scope="col">2021</th><th scope="col">2027</th><th scope="col">Cambio</th></tr></thead>
      <tbody>${rows.map((r) => `<tr><th scope="row">${dot(r.p)}<span class="ax-pn"><span>${partyName(r.p)}</span></span></th>
        <td>${pct1(r.s21)}</td><td>${pct1(r.s27)}</td><td class="${r.d >= 0 ? 'is-up' : 'is-down'}">${pp(r.d)}</td></tr>`).join('')}</tbody>
    </table>
    <p class="ax-shift">Mayor avance <b style="--c:${PARTIES[best.p].color}">${partyName(best.p)} ${pp(best.d)}</b></p>`;
  }

  function tableOportunidad(list) {
    const h = hist2021Of(list);
    if (!h.n) return emptyNote('Sin resultados 2021 para esta selección. Solo Querétaro tiene base municipal 2021 en la demo.');
    const rows = PARTY_ORDER.filter((p) => p in h.sums).map((p) => [p, h.sums[p]]).sort((a, b) => b[1] - a[1]);
    return `<table class="ax-t">
      <thead><tr><th scope="col">Partido</th><th scope="col">Votos 2021</th><th scope="col">%</th></tr></thead>
      <tbody>${rows.map(([p, v]) => `<tr class="${p === opParty ? 'is-on' : ''}"><th scope="row">${dot(p)}<span class="ax-pn"><span>${partyName(p)}</span></span></th>
        <td>${fmtNum(v)}</td><td>${pct1(v / h.votos)}</td></tr>`).join('')}</tbody>
    </table>`;
  }
  const emptyNote = (t) => `<p class="ax-empty">${t}</p>`;

  function scopeLabel(list) {
    const est = wholeState(list);
    if (est) return est.nombre;
    if (list.length === 1) return `${list[0].name}, ${ENTIDADES[list[0].cve][1]}`;
    const cves = new Set(list.map((i) => i.cve));
    return `${fmtNum(list.length)} municipios${cves.size === 1 ? ` · ${ENTIDADES[list[0].cve][1]}` : ''}`;
  }

  function renderPanel() {
    const list = selectedItems();
    const has = list.length > 0;
    const qro2021 = mode === 'oportunidad' || (mode === 'cambio' && baseline === '2021');
    clearBtn.hidden = !has;
    introEl.hidden = has;
    searchWrap.hidden = has;
    if (has) closeResults();

    if (has) scopeEl.textContent = scopeLabel(list);
    else scopeEl.textContent = qro2021 ? 'Querétaro · voto 2021' : 'Gubernaturas 2027 · México';

    if (!has && !introEl.dataset.built) {
      introEl.innerHTML = `<h1 class="ax-title">Las 17 gubernaturas de 2027, municipio por municipio</h1>
        <p class="ax-by">Proyección estatal con encuestas públicas agregadas (corte ${updated}). El desglose municipal es ilustrativo.</p>
        ${seatsBar()}`;
      introEl.dataset.built = '1';
    }

    // Tabla
    const scopeQro = has ? list : (munisByCve.get(QRO) || []);
    if (qro2021 && !hist) tableEl.innerHTML = emptyNote('Cargando resultados 2021…');
    else if (mode === 'oportunidad') tableEl.innerHTML = tableOportunidad(scopeQro);
    else if (qro2021) tableEl.innerHTML = tableShift2021(scopeQro);
    else tableEl.innerHTML = tableProjection(has ? aggregate(list) : nationalAggregate());

    // Pie
    const est = has ? wholeState(list) : null;
    const oneState = has && new Set(list.map((i) => i.cve)).size === 1 ? estadosByCve.get(list[0].cve) : null;
    const link = (e) => `<button class="ax-link" type="button" data-contest="${e.slug}">Ver contienda en ${e.nombre} ${I.arrow}</button>`;
    let foot = '';
    if (qro2021) {
      const h = hist2021Of(scopeQro);
      foot = h.n ? `<p>Votos emitidos 2021: <b>${fmtNum(h.votos)}</b> · lista nominal 2021: <b>${fmtNum(h.ln)}</b></p>` : '';
      foot += '<p class="ax-src">2021: resultados de la gubernatura de Querétaro por casilla, agregados por municipio. 2027: desglose municipal ilustrativo.</p>';
    } else if (!has) {
      const agg = nationalAggregate();
      foot = `<p>Lista nominal en juego: <b>${fmtNum(agg.ln)}</b></p>
        <p class="ax-src">Encuestas públicas agregadas (promedio ponderado + Kalman) · Lista nominal INE, corte 20 AGO 2026 · Municipios: ilustrativo.</p>`;
    } else if (est) {
      const prob = est.prob?.[est.favorito] ?? est.probFav;
      foot = `<p>Probabilidad de victoria: <b>${partyName(est.favorito)} ${Math.round(prob * 100)}%</b> · margen <b>+${est.margen.toFixed(1)} pp</b> · ${est.estatus.label.toLowerCase()}</p>
        ${mode === 'cambio' ? `<p>Gobierna ${partyName(est.gob)} · ${est.flip ? `<b>cambiaría a ${partyName(est.favorito)}</b>` : 'retendría'}</p>` : ''}
        <p>Lista nominal: <b>${fmtNum(est.listaNominal)}</b></p>${link(est)}`;
    } else {
      const agg = aggregate(list);
      const unknown = list.filter((i) => i.kind === 'mun' && !i.lnKnown).length;
      foot = `<p>Lista nominal: <b>${agg.ln ? fmtNum(agg.ln) : '—'}</b>${unknown ? ` · ${unknown} sin dato INE` : ''}</p>
        ${list.length === 1 && mode === 'cambio' ? `<p>Gobierna el estado ${partyName(list[0].estado.gob)} · ${list[0].leader !== list[0].estado.gob ? `aquí lidera <b>${partyName(list[0].leader)}</b>` : 'aquí retiene'}</p>` : ''}
        <p class="ax-src">Desglose municipal ilustrativo, ajustado a la proyección estatal.</p>
        ${oneState ? link(oneState) : ''}`;
    }
    footEl.innerHTML = foot;
  }

  /* ---------- Tooltip ---------- */
  function rowsHTML(entries, fmt) {
    return entries.map(([p, a, b]) => `<div class="ax-tip-row">${dot(p)}<span>${partyName(p)}</span><b>${a}</b><i>${b}</i></div>`).join('');
  }
  // El HTML del tooltip solo se reconstruye si cambia el contenido (otro
  // municipio, capa o carga de datos 2021); mientras el cursor se mueve sobre
  // el mismo municipio solo se reposiciona, sin volver a medir el DOM.
  let tipKey = '', tipW = 0, tipH = 0;
  function showTip(it, p) {
    if (!it || !p) { hideTip(); return; }
    const key = `${it.id}|${mode}|${baseline}|${opParty}|${hist ? 1 : 0}|${themeName}`;
    if (key !== tipKey || tipEl.hidden) {
      tipEl.innerHTML = tipHTML(it);
      tipEl.hidden = false;
      tipW = tipEl.offsetWidth; tipH = tipEl.offsetHeight;
      tipKey = key;
    }
    const { w, h } = atlas.size;
    let x = p.x + 18, y = p.y + 18;
    if (x + tipW > w - 8) x = p.x - tipW - 14;
    if (y + tipH > h - 8) y = p.y - tipH - 14;
    tipEl.style.transform = `translate(${Math.max(8, x)}px, ${Math.max(8, y)}px)`;
  }
  function tipHTML(it) {
    let html = '';
    const where = it.kind === 'mun' ? `<span>${ENTIDADES[it.cve][0]}</span>` : '';
    if (it.kind === 'none') {
      html = `<div class="ax-tip-h"><b>${it.name}</b></div><p class="ax-tip-f">Sin elección de gubernatura en 2027</p>`;
    } else if (mode === 'oportunidad' || (mode === 'cambio' && baseline === '2021')) {
      const h = histOf(it);
      html = `<div class="ax-tip-h"><b>${it.name}</b>${where}</div>`;
      if (!h) html += `<p class="ax-tip-f">${hist || it.cve !== QRO ? 'Sin base municipal 2021' : 'Cargando resultados 2021…'}</p>`;
      else if (mode === 'oportunidad') {
        const rows = PARTY_ORDER.filter((q) => q in h.partidos).map((q) => [q, h.partidos[q]]).sort((a, b) => b[1] - a[1]).slice(0, 4)
          .map(([q, v]) => [q, fmtNum(v), pct1(v / h.votos)]);
        html += rowsHTML(rows) + `<p class="ax-tip-f">Votos emitidos 2021: ${fmtNum(h.votos)}</p>`;
      } else {
        const rows = PARTY_ORDER.filter((q) => q in h.partidos && q in it.shares)
          .map((q) => [q, it.shares[q] - h.partidos[q] / h.votos]).sort((a, b) => b[1] - a[1]).slice(0, 4)
          .map(([q, d]) => [q, pct1(it.shares[q]), pp(d)]);
        html += rowsHTML(rows) + '<p class="ax-tip-f">2027 ilustrativo vs. 2021 real</p>';
      }
    } else {
      const rows = rankShares(it.shares).slice(0, 4).map(([q, s]) => [q, it.ln ? fmtNum(Math.round(s * it.ln)) : '—', pct1(s)]);
      html = `<div class="ax-tip-h"><b>${it.name}</b>${where}</div>${rowsHTML(rows)}`;
      if (mode === 'cambio') {
        const g = it.estado.gob;
        html += `<p class="ax-tip-g">Gobierna ${partyName(g)} · ${it.leader !== g ? `<b>lidera ${partyName(it.leader)}</b>` : 'retiene'}</p>`;
      }
      html += `<p class="ax-tip-f">Lista nominal: ${it.ln ? fmtNum(it.ln) : 'sin dato INE'}${it.kind === 'mun' ? ' · ilustrativo' : ' · encuestas'}</p>`;
    }
    return html;
  }
  function hideTip() { if (!tipEl.hidden) tipEl.hidden = true; }

  /* ---------- Leyenda ---------- */
  function leadingParties() {
    const set = new Set(items.filter((i) => i.leader).map((i) => i.leader));
    return PARTY_ORDER.filter((p) => set.has(p));
  }
  function renderLegend() {
    const lead = leadingParties();
    const steps = (p, ts) => ts.map((t) => `<i style="background:${ramp(p, t)}"></i>`).join('');
    let html = '';
    if (mode === 'margen') {
      html = `<div class="ax-lg-grid">${lead.map((p) => `<span class="ax-lg-n">${p === 'MORENA' ? 'Morena' : p}</span><span class="ax-lg-ramp">${steps(p, [0.1, 0.32, 0.55, 0.78, 1])}</span>`).join('')}</div>
        <div class="ax-lg-scale"><span>${metric === 'prob' ? '50%' : '0'}</span><span>${metric === 'prob' ? 'probabilidad 97%' : `margen ${MARGIN_CAP}+ pp`}</span></div>`;
    } else if (mode === 'ganador') {
      html = `<div class="ax-lg-sw">${lead.map((p) => `<span>${dot(p)}${p === 'MORENA' ? 'Morena' : p}</span>`).join('')}</div>`;
    } else if (mode === 'cambio' && baseline === 'gob') {
      html = `<div class="ax-lg-grid">${lead.map((p) => `<span class="ax-lg-n">${p === 'MORENA' ? 'Morena' : p}</span><span class="ax-lg-ramp ax-lg-2"><i style="background:${ramp(p, 0.72)}"></i><i style="background:${keepColor(p)}"></i></span>`).join('')}</div>
        <div class="ax-lg-scale"><span></span><span>cambia · retiene</span></div>`;
    } else if (mode === 'cambio') {
      html = `<p class="ax-lg-h">Mayor avance 2021 → 2027</p><div class="ax-lg-grid">${PARTY_ORDER.slice(0, 4).map((p) => `<span class="ax-lg-n">${p === 'MORENA' ? 'Morena' : p}</span><span class="ax-lg-ramp">${steps(p, [0.12, 0.4, 0.7, 1])}</span>`).join('')}</div>
        <div class="ax-lg-scale"><span>0</span><span>+25 pp</span></div>`;
    } else {
      html = `<p class="ax-lg-h">${partyName(opParty)} · voto 2021</p><span class="ax-lg-ramp ax-lg-wide">${steps(opParty, [0.06, 0.3, 0.52, 0.74, 0.96])}</span>
        <div class="ax-lg-scale"><span>${pct1(opRange[0])}</span><span>${pct1(opRange[1])}</span></div>`;
    }
    if (spikesOn) html += '<p class="ax-lg-spike"><svg viewBox="0 0 12 14" aria-hidden="true"><path d="M2 13 6 1l4 12Z"/></svg>Altura: lista nominal</p>';
    legendEl.innerHTML = html;
    $('#axLegend2').innerHTML = html;
  }

  /* ---------- Capas ---------- */
  function syncLayerUI() {
    layersEl.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.mode === mode)));
    layersEl.querySelectorAll('[data-metric]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.metric === metric)));
    layersEl.querySelectorAll('[data-base]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.base === baseline)));
    layersEl.querySelectorAll('[data-party]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.party === opParty)));
    layersEl.querySelectorAll('.ax-sub').forEach((s) => { s.hidden = s.dataset.for !== mode; });
    root.querySelector('[data-act="spikes"]').setAttribute('aria-pressed', String(spikesOn));
  }

  function ensureHist() {
    if (hist) return Promise.resolve(hist);
    if (!histPromise) {
      setStatus('Cargando resultados 2021…');
      histPromise = loadHist2021().then((h) => { hist = h; setStatus(loaded < total ? loadingText() : ''); return h; })
        .catch(() => { histPromise = null; setStatus('No se pudieron cargar los resultados 2021.', 'warn'); return null; });
    }
    return histPromise;
  }

  async function setMode(next, sub = {}) {
    mode = next;
    if (sub.metric) metric = sub.metric;
    if (sub.base) baseline = sub.base;
    if (sub.party) opParty = sub.party;
    syncLayerUI();
    restyle();
    const needs2021 = mode === 'oportunidad' || (mode === 'cambio' && baseline === '2021');
    if (!needs2021) return;
    const wasLoaded = !!hist;
    await Promise.all([ensureHist(), ready(QRO)]);
    if (!alive) return;
    restyle();
    if (!wasLoaded || sub.focus) {
      const sel = selectedItems();
      if (!sel.length || sel.some((i) => i.cve !== QRO)) atlas.fit(stateBBox(QRO), { maxZoom: 9.5 });
    }
  }

  layersEl.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.mode && b.dataset.mode !== mode) setMode(b.dataset.mode, { focus: true });
    else if (b.dataset.metric) setMode('margen', { metric: b.dataset.metric });
    else if (b.dataset.base) setMode('cambio', { base: b.dataset.base, focus: b.dataset.base === '2021' });
    else if (b.dataset.party) setMode('oportunidad', { party: b.dataset.party });
    else if (b.dataset.act === 'spikes') {
      spikesOn = !spikesOn;
      atlas.setSpikes(spikesOn ? spikeOf : null);
      syncLayerUI(); renderLegend();
    }
  });

  function openLayers(open) {
    layersEl.hidden = !open;
    layersBtn.setAttribute('aria-expanded', String(open));
    layersBtn.classList.toggle('is-on', open);
  }

  /* ---------- Barra de herramientas ---------- */
  function syncThemeBtn() {
    const btn = $('#axTheme');
    const pref = themePref();
    btn.innerHTML = THEME_ICONS[pref];
    btn.setAttribute('aria-label', `Tema: ${themeLabel(pref)}`);
    btn.title = `Tema: ${themeLabel(pref)}`;
  }
  syncThemeBtn();

  root.querySelector('.ax').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act], [data-contest]');
    if (!b) return;
    if (b.dataset.contest) { navigate('/estado/' + b.dataset.contest); return; }
    const act = b.dataset.act;
    if (act === 'theme') cycleTheme();
    else if (act === 'reset') atlas.fit(MEXICO);
    else if (act === 'tilt') { atlas.setTilt(!atlas.tilted); b.setAttribute('aria-pressed', String(atlas.tilted)); b.classList.toggle('is-on', atlas.tilted); }
    else if (act === 'outlines') { outlinesOn = !outlinesOn; atlas.setOutlinesStrong(outlinesOn); b.setAttribute('aria-pressed', String(outlinesOn)); b.classList.toggle('is-on', outlinesOn); }
    else if (act === 'layers') openLayers(layersEl.hidden);
    else if (act === 'clear') clearSelection();
    else if (act === 'collapse') {
      const collapsed = panel.classList.toggle('is-collapsed');
      b.setAttribute('aria-expanded', String(!collapsed));
      b.setAttribute('aria-label', collapsed ? 'Expandir panel' : 'Contraer panel');
      b.innerHTML = collapsed ? I.plus : I.minus;
    } else if (act === 'tools-close' || act === 'tools-open') {
      const show = act === 'tools-open';
      toolsEl.hidden = !show; toolsOpen.hidden = show;
      try { localStorage.setItem('mirador-tools', show ? '1' : '0'); } catch { /* sin persistencia */ }
    }
  });
  try { if (localStorage.getItem('mirador-tools') === '0') { toolsEl.hidden = true; toolsOpen.hidden = false; } } catch { /* sin persistencia */ }

  /* ---------- Buscador ---------- */
  let index = [];
  let results = [];
  let active = -1;
  const norm = (s) => slugify(s).replace(/-/g, ' ');
  function rebuildIndex() {
    index = [];
    for (const [cve, [nombre]] of Object.entries(ENTIDADES)) {
      const e = estadosByCve.get(Number(cve));
      const munis = munisByCve.get(Number(cve));
      index.push({
        type: e ? 'estado' : 'none', cve: Number(cve), label: nombre, norm: norm(nombre),
        sub: e ? `Estado · ${munis ? `${munis.length} municipios · ` : ''}LN ${fmtNum(e.listaNominal)}` : 'Estado · sin elección en 2027',
      });
    }
    for (const munis of munisByCve.values()) for (const m of munis) {
      index.push({ type: 'mun', id: m.id, cve: m.cve, label: m.name, norm: norm(m.name), sub: `Municipio · ${ENTIDADES[m.cve][0]}${m.ln ? ` · LN ${fmtNum(m.ln)}` : ''}` });
    }
  }
  function search(q) {
    const n = norm(q);
    if (!n) return [];
    const out = [];
    for (const e of index) {
      const i = e.norm.indexOf(n);
      if (i < 0) continue;
      const score = (i === 0 ? 0 : e.norm[i - 1] === ' ' ? 1 : 3) + (e.type === 'mun' ? 0.5 : 0) + e.norm.length / 300;
      out.push([score, e]);
    }
    return out.sort((a, b) => a[0] - b[0]).slice(0, 8).map((x) => x[1]);
  }
  function renderResults() {
    const open = results.length > 0 || searchEl.value.trim().length > 0;
    resultsEl.hidden = !open;
    searchEl.setAttribute('aria-expanded', String(open));
    if (!results.length) {
      resultsEl.innerHTML = searchEl.value.trim() ? '<li class="ax-r-empty" role="presentation">Sin coincidencias. Prueba con el nombre de un estado o municipio.</li>' : '';
      searchEl.removeAttribute('aria-activedescendant');
      return;
    }
    resultsEl.innerHTML = results.map((r, i) => `<li role="option" id="axr-${i}" data-i="${i}" aria-selected="${i === active}">
      <b>${r.label}</b><span>${r.sub}</span></li>`).join('');
    if (active >= 0) searchEl.setAttribute('aria-activedescendant', `axr-${active}`);
    else searchEl.removeAttribute('aria-activedescendant');
  }
  function closeResults() { results = []; active = -1; resultsEl.hidden = true; searchEl.setAttribute('aria-expanded', 'false'); }
  function pick(r) {
    if (!r) return;
    searchEl.value = '';
    closeResults();
    if (r.type === 'none') { atlas.fit(stateBBox(r.cve), { maxZoom: 8 }); return; }
    if (r.type === 'estado') {
      select(idsOfState(r.cve), 'replace');
      atlas.fit(stateBBox(r.cve), { maxZoom: 9.5 });
      return;
    }
    const it = items.find((i) => i.id === r.id);
    if (!it) return;
    select([it.id], 'replace');
    atlas.fit(it.geom.bbox, { maxZoom: 10.5 });
  }
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
  const onTheme = (e) => {
    themeName = e.detail.theme;
    atlas.setTheme(themeName);
    syncThemeBtn();
    restyle();
  };
  const onKey = (e) => {
    if (e.key !== 'Escape') return;
    if (!layersEl.hidden) { openLayers(false); layersBtn.focus(); return; }
    if (selection.size && !e.target.closest?.('input')) clearSelection();
  };
  const onDocDown = (e) => {
    if (!layersEl.hidden && !layersEl.contains(e.target) && !layersBtn.contains(e.target)) openLayers(false);
  };
  window.addEventListener('mirador:theme', onTheme);
  window.addEventListener('keydown', onKey);
  document.addEventListener('pointerdown', onDocDown, true);

  /* ---------- Arranque ---------- */
  rebuildItems();
  rebuildIndex();
  syncLayerUI();
  renderLegend();
  renderPanel();
  atlas.fit(MEXICO, { instant: true });
  for (let i = 0; i < 4; i++) worker();

  return () => {
    alive = false;
    atlas.destroy();
    window.removeEventListener('mirador:theme', onTheme);
    window.removeEventListener('keydown', onKey);
    document.removeEventListener('pointerdown', onDocDown, true);
    document.body.classList.remove('atlas-mode');
  };
}
