// ============================================================
// views/dominio.js — Mapa de dominio a pantalla completa, versión
// mexicana del mapa por casilla de VoteHub 2024:
//   · los ~700 municipios de las 17 entidades con elección, coloreados
//     por capa (Margen, Ganador, Cambio, Oportunidad 2021);
//   · panel de resultados con buscador y tabla por fuerza que se
//     recalcula con la selección (clic, ⇧ + clic, recuadro ⇧ / Ctrl);
//   · herramientas de perspectiva, contornos, picos 3D y tema.
// La proyección estatal viene del agregado de encuestas reales; cada
// municipio se estima con sus resultados electorales oficiales ajustados
// a esa proyección (servicio de datos: /api/v1/municipios/estimacion).
// ============================================================

import { store } from '../store.js';
import { PARTIES, PARTY_ORDER } from '../config.js';
import { loadMunicipios } from '../map.js';
import { loadManifest, loadHistGub, avisosGub, unidadesGub } from '../hist_gub.js';
import { apiGet } from '../api.js';
import { fuenteBox } from './atlas_comun.js';
import { statsMunicipio } from '../padron.js';
import { navigate } from '../router.js';
import { createAtlas, toWorldGeometry, unionBBox } from '../atlas.js';
import { resolvedTheme, cycleTheme, themePref, themeLabel, THEME_ICONS } from '../theme.js';
import { slugify, clamp, fmtNum } from '../utils.js';

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
// Resultados reales de la gubernatura anterior (2021; 2022 en Ags. y Q. Roo)
// para las 17 entidades: ver js/hist_gub.js y data/gubernaturas_manifest.json.

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

/* ---------- Estimación municipal (datos reales) ---------- */
function rankShares(shares) {
  return Object.entries(shares).filter(([p]) => PARTIES[p]).sort((a, b) => b[1] - a[1]);
}

/** Estimación por municipio del servicio de datos: Map cvegeo → registro. Se pide una sola vez. */
let _estimacion = null;
function cargarEstimacion() {
  if (!_estimacion) {
    _estimacion = apiGet('/api/v1/municipios/estimacion', { timeoutMs: 20000 })
      .then((lista) => new Map(lista.map((m) => [m.cvegeo, m])))
      .catch((e) => { _estimacion = null; throw e; });
  }
  return _estimacion;
}

/** Texto de la fuente de un municipio para el usuario. */
export function fuenteMunicipio(rec) {
  if (!rec) return 'promedio estatal';
  const b = rec.bases || [];
  const bases = b.length > 1 ? `${b.slice(0, -1).join(', ')} y ${b[b.length - 1]}` : (b[0] || '');
  if (rec.fuente === 'encuesta_municipal+historial') return `encuesta de alcaldía y resultados de ${bases}`;
  if (rec.fuente === 'historial') return `resultados de ${bases}`;
  if (rec.fuente === 'encuesta_municipal+proyeccion_estatal') return 'encuesta de alcaldía + promedio estatal';
  return 'promedio estatal (municipio sin elecciones previas)';
}

/**
 * Municipios de una entidad con la estimación del modelo: historial electoral
 * real del municipio, ajustado a las encuestas estatales actuales (ver Metodología).
 */
function buildMunicipios(estado, geo, est) {
  const list = [];
  for (const f of geo.features || []) {
    const geom = toWorldGeometry(f.geometry);
    if (!geom.polys.length) continue;
    const cv = String(f.properties.cvegeo).padStart(5, '0');
    const st = statsMunicipio(store.padronData, cv);
    const rec = est.get(cv) || null;
    let shares;
    if (rec) {
      shares = {};
      for (const [p, v] of Object.entries(rec.estimacion)) {
        if (p === 'OTROS') shares.Otros = v / 100;
        else if (PARTIES[p]) shares[p] = v / 100;
      }
    } else {
      shares = { ...estado.voto };
    }
    const r = rankShares(shares);
    list.push({
      id: 'm:' + cv, kind: 'mun', group: estado.cve, border: true, cvegeo: cv, name: f.properties.name || `Municipio ${cv}`,
      estado, cve: estado.cve, geom, ln: st ? Number(st[1]) || 0 : 0, padron: st ? Number(st[0]) || 0 : 0, lnKnown: !!st,
      shares, rec,
      leader: rec ? rec.ganador : r[0][0],
      margin: rec ? rec.margen : (r[0][1] - (r[1] ? r[1][1] : 0)) * 100,
      prob: rec && Number.isFinite(rec.prob_ganador) ? rec.prob_ganador : null,
    });
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
    <svg class="ax-tip-lead" id="axLead" aria-hidden="true" hidden><path class="ax-lead-halo"/><path class="ax-lead-line"/></svg>

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
          <button type="button" role="radio" data-base="2021">Gubernatura anterior</button>
        </div>
      </div>
      <div class="ax-sub" data-for="oportunidad">
        <p class="ax-sub-h">Voto en la gubernatura anterior</p>
        <div class="ax-chips ax-chips-party" role="radiogroup" aria-label="Partido">
          ${PARTY_ORDER.map((p) => `<button type="button" role="radio" data-party="${p}"><span class="ax-dot" style="--c:${PARTIES[p].color}"></span>${p === 'MORENA' ? 'Morena' : p}</button>`).join('')}
        </div>
        ${fuenteBox('<p>Resultados oficiales de la gubernatura anterior por municipio en las 17 entidades (2021; 2022 en Aguascalientes y Quintana Roo), publicados por cada instituto electoral local.</p><p>En Sonora, Colima y Baja California Sur el instituto no publicó todos los partidos por separado: ahí se muestra el voto de la coalición que los incluye.</p>', { clave: 'capas-gub' })}
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
  const mapEl = $('#axMap'), tipEl = $('#axTip'), leadEl = $('#axLead'), statusEl = $('#axStatus');
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

  // hist: Map cve → { muni, meta } (null hasta cargar). Cada entidad tiene sus
  // "unidades": la columna del partido o, si no se publicó, la de su coalición.
  const unitsCache = new Map();
  function unitsOf(cve) {
    if (!unitsCache.has(cve)) unitsCache.set(cve, unidadesGub(hist?.get(cve)?.meta));
    return unitsCache.get(cve);
  }
  /** Unidades distintas (una por columna) de una entidad. */
  function unitList(cve) {
    const seen = new Map();
    for (const u of Object.values(unitsOf(cve))) if (!seen.has(u.key)) seen.set(u.key, u);
    return [...seen.values()];
  }
  const metaOf = (cve) => hist?.get(cve)?.meta || null;
  const anioOf = (cve) => metaOf(cve)?.anio || 2021;

  function histOf(it) {
    if (!hist || it.kind !== 'mun') return null;
    return hist.get(it.cve)?.muni[slugify(it.name)] || null;
  }
  /** Proporción 2027 (municipal) de los partidos base de una unidad. */
  const share27 = (it, u) => u.members.reduce((a, p) => a + (it.shares[p] || 0), 0);
  /** Partido de una unidad usado para el color (el primero en el orden de despliegue). */
  const unitParty = (u) => PARTY_ORDER.find((p) => u.members.includes(p)) || u.members[0];
  function gainOf(it, h) {
    let best = null;
    if (!h.votos) return null;
    for (const u of unitList(it.cve)) {
      if (!(u.key in h.partidos)) continue;
      const members = u.members.filter((p) => p in it.shares);
      if (!members.length) continue;
      const g = share27(it, u) - h.partidos[u.key] / h.votos;
      if (!best || g > best.gain) best = { party: [...members].sort((a, b) => it.shares[b] - it.shares[a])[0], gain: g, unit: u };
    }
    return best;
  }
  /** Proporción del voto anterior de `party` (o de su coalición) en el municipio. */
  function opShare(it, h) {
    const u = unitsOf(it.cve)[opParty];
    if (!u || !h.votos) return null;
    return (h.partidos[u.key] || 0) / h.votos;
  }
  let opRange = [0, 1];
  function computeOpRange() {
    const vals = [];
    for (const munis of munisByCve.values()) for (const m of munis) {
      const h = histOf(m);
      const s = h ? opShare(m, h) : null;
      if (s != null) vals.push(s);
    }
    opRange = vals.length ? [Math.min(...vals), Math.max(...vals)] : [0, 1];
  }

  function fillOf(it) {
    const N = NEUTRAL[themeName];
    if (it.kind === 'none') return N.none;
    if (mode === 'margen') {
      const t = metric === 'prob' && it.prob != null ? (it.prob - 0.5) / 0.47 : it.margin / MARGIN_CAP;
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
    const s = opShare(it, h);
    if (s == null) return N.nodata;
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
  const pending = [...store.estados];
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

  let sinEstimacion = false;
  async function worker() {
    while (alive && pending.length) {
      const estado = pending.shift();
      try {
        const [geo, est] = await Promise.all([loadMunicipios(estado), cargarEstimacion().catch(() => null)]);
        if (!alive) return;
        if (!est) { sinEstimacion = true; throw new Error('sin estimación'); }
        const munis = buildMunicipios(estado, geo, est);
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
      else if (sinEstimacion) setStatus('No se pudo cargar la estimación por municipio; se muestran solo los estados. Intenta recargar la página.', 'warn');
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
  /** Suma por unidad (columna de partido o coalición) del resultado anterior y
   *  del apoyo 2027 de los mismos partidos, ponderado por lista nominal. */
  function hist2021Of(list) {
    const sums = {}, est27 = {}, units = new Map();
    let votos = 0, ln = 0, n = 0, w27 = 0;
    const cves = new Set(), anios = new Set();
    for (const m of list) {
      const h = histOf(m);
      if (!h) continue;
      n++; votos += h.votos; ln += h.nominal;
      cves.add(m.cve); anios.add(anioOf(m.cve));
      const w = m.ln || 1;
      w27 += w;
      for (const u of unitList(m.cve)) {
        if (!(u.key in h.partidos)) continue;
        if (!units.has(u.key)) units.set(u.key, u);
        sums[u.key] = (sums[u.key] || 0) + h.partidos[u.key];
        est27[u.key] = (est27[u.key] || 0) + share27(m, u) * w;
      }
    }
    return { sums, est27, w27, units, votos, ln, n, cves, anios };
  }
  const coalTxt = (key) => key.replace(/_/g, '·<wbr>');
  const unitLabel = (u) => (u.coalicion
    ? `<span class="ax-coal-n">${coalTxt(u.key)}</span><span class="ax-coal">coalición</span>` : partyName(u.key));
  const anioTxt = (anios) => (anios.size === 1 ? String([...anios][0]) : 'anterior');
  /** Avisos (coaliciones, año, municipios estimados…) de las entidades de la selección. */
  function avisosHTML(cves, soloClave = false) {
    const out = [];
    for (const cve of [...cves].sort((a, b) => a - b)) {
      const av = avisosGub(metaOf(cve)).filter((a) => !soloClave || a.tipo === 'coalicion');
      if (!av.length) continue;
      const nombre = ENTIDADES[cve][0];
      out.push(`<p class="ax-note ax-note-${av[0].tipo}"><b>${nombre}:</b> ${av.map((a) => a.texto).join(' ')}</p>`);
    }
    return out.join('');
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
    if (!h.n) return emptyNote('Sin resultado de la gubernatura anterior para esta selección (municipios creados después de esa elección).');
    const rows = [...h.units.values()].map((u) => {
      const s21 = h.sums[u.key] / h.votos, s27 = h.est27[u.key] / h.w27;
      return { u, p: unitParty(u), s21, s27, d: s27 - s21 };
    }).sort((a, b) => b.s27 - a.s27);
    const best = [...rows].sort((a, b) => b.d - a.d)[0];
    return `<table class="ax-t ax-t4">
      <thead><tr><th scope="col">Fuerza</th><th scope="col">${anioTxt(h.anios)}</th><th scope="col">2027</th><th scope="col">Cambio</th></tr></thead>
      <tbody>${rows.map((r) => `<tr><th scope="row">${dot(r.p)}<span class="ax-pn"><span>${unitLabel(r.u)}</span></span></th>
        <td>${pct1(r.s21)}</td><td>${pct1(r.s27)}</td><td class="${r.d >= 0 ? 'is-up' : 'is-down'}">${pp(r.d)}</td></tr>`).join('')}</tbody>
    </table>
    <p class="ax-shift">Mayor avance <b style="--c:${PARTIES[best.p].color}">${best.u.coalicion ? best.u.key.replace(/_/g, '·') : partyName(best.p)} ${pp(best.d)}</b></p>`;
  }

  function tableOportunidad(list) {
    const h = hist2021Of(list);
    if (!h.n) return emptyNote('Sin resultado de la gubernatura anterior para esta selección (municipios creados después de esa elección).');
    const rows = [...h.units.values()].map((u) => [u, h.sums[u.key]]).sort((a, b) => b[1] - a[1]);
    return `<table class="ax-t">
      <thead><tr><th scope="col">Partido</th><th scope="col">Votos ${anioTxt(h.anios)}</th><th scope="col">%</th></tr></thead>
      <tbody>${rows.map(([u, v]) => `<tr class="${u.members.includes(opParty) ? 'is-on' : ''}"><th scope="row">${dot(unitParty(u))}<span class="ax-pn"><span>${unitLabel(u)}</span></span></th>
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
    else scopeEl.textContent = qro2021 ? 'Gubernatura anterior · 17 estados' : 'Gubernaturas 2027 · México';

    if (!has && !introEl.dataset.built) {
      introEl.innerHTML = `<h1 class="ax-title">Las 17 gubernaturas de 2027, municipio por municipio</h1>
        <p class="ax-by">Proyección con encuestas públicas (corte ${updated}). Encuestas de alcaldía por municipio: <a href="#/alcaldias">Alcaldías 2027</a>.</p>
        ${seatsBar()}
        ${fuenteBox(textoFuenteGeneral(), { clave: 'dominio-general' })}`;
      introEl.dataset.built = '1';
    }

    // Tabla
    const scopeQro = has ? list : items.filter((i) => i.kind === 'mun');
    if (qro2021 && !hist) tableEl.innerHTML = emptyNote('Cargando resultados de la gubernatura anterior…');
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
      const cves = has ? new Set(list.map((i) => i.cve)) : new Set(store.estados.map((e) => e.cve));
      foot = h.n ? `<p>Votos emitidos (${anioTxt(h.anios)}): <b>${fmtNum(h.votos)}</b> · lista nominal: <b>${fmtNum(h.ln)}</b></p>` : '';
      if (hist) foot += avisosHTML(cves, !has);
      foot += fuenteBox('<p><b>Gubernatura anterior:</b> resultados oficiales de cada instituto electoral local, sumados por municipio (2021; 2022 en Aguascalientes y Quintana Roo).</p><p><b>2027:</b> estimación por municipio a partir de las encuestas estatales y del historial electoral del municipio. <a href="#/metodologia">Metodología</a>.</p>', { clave: 'dominio-gub' });
    } else if (!has) {
      const agg = nationalAggregate();
      foot = `<p>Lista nominal en juego: <b>${fmtNum(agg.ln)}</b></p>`;
    } else if (est) {
      const prob = est.prob?.[est.favorito] ?? est.probFav;
      foot = `<p>Probabilidad de victoria: <b>${partyName(est.favorito)} ${Math.round(prob * 100)}%</b> · margen <b>+${est.margen.toFixed(1)} pp</b> · ${est.estatus.label.toLowerCase()}</p>
        ${mode === 'cambio' ? `<p>Gobierna ${partyName(est.gob)} · ${est.flip ? `<b>cambiaría a ${partyName(est.favorito)}</b>` : 'retendría'}</p>` : ''}
        <p>Lista nominal: <b>${fmtNum(est.listaNominal)}</b></p>
        ${fuenteBox(`<p>Promedio de las encuestas públicas de gubernatura en ${est.nombre}. La probabilidad sale de simular miles de veces la elección con el margen de error de esas encuestas.</p><p>La suma de sus municipios reproduce exactamente este promedio.</p>`, { clave: 'dominio-estado' })}
        ${link(est)}`;
    } else {
      const agg = aggregate(list);
      const unknown = list.filter((i) => i.kind === 'mun' && !i.lnKnown).length;
      const uno = list.length === 1 && list[0].kind === 'mun' ? list[0] : null;
      foot = `<p>Lista nominal: <b>${agg.ln ? fmtNum(agg.ln) : '—'}</b>${unknown ? ` · ${unknown} sin dato INE` : ''}</p>
        ${uno && uno.rec ? `<p>Ventaja estimada: <b>${partyName(uno.leader)} +${uno.margin.toFixed(1)} pp</b>${Number.isFinite(uno.prob) ? ` · confianza <b>${Math.round(uno.prob * 100)}%</b>` : ''}</p>` : ''}
        ${list.length === 1 && mode === 'cambio' ? `<p>Gobierna el estado ${partyName(list[0].estado.gob)} · ${list[0].leader !== list[0].estado.gob ? `aquí lidera <b>${partyName(list[0].leader)}</b>` : 'aquí retiene'}</p>` : ''}
        ${fuenteBox(uno ? textoFuenteMunicipio(uno) : '<p>Suma de las estimaciones de los municipios seleccionados, ponderada por su lista nominal.</p><p>Cada municipio se estima con sus resultados electorales oficiales, ajustados a las encuestas actuales de su estado. <a href="#/metodologia">Metodología</a>.</p>', { clave: 'dominio-municipio' })}
        ${oneState ? link(oneState) : ''}`;
    }
    footEl.innerHTML = foot;
  }

  /* ---------- Textos de fuente ---------- */
  let metodo = null;   // /api/v1/metodologia (error del modelo, pesos)
  apiGet('/api/v1/metodologia').then((m) => { metodo = m; if (!alive) return; introEl.dataset.built = ''; renderPanel(); }).catch(() => {});
  const NOMBRE_BASE = { misma_eleccion: 'la gubernatura anterior', federal: 'las diputaciones federales de 2024', otra_local: 'el ayuntamiento de 2024' };
  function basesUsadas() {
    const p = metodo?.modelo_municipal?.pesos;
    if (!p) return 'sus resultados electorales oficiales anteriores';
    const n = Object.keys(NOMBRE_BASE).filter((k) => p[k] > 0).map((k) => NOMBRE_BASE[k]);
    return n.length ? `sus resultados oficiales reales (${n.join(' y ')})` : 'sus resultados electorales oficiales anteriores';
  }
  function errorModelo() {
    return metodo?.modelo_municipal?.prueba_gubernatura?.modelos?.combinado?.mae_pp;
  }
  function textoFuenteGeneral() {
    const e = errorModelo();
    return `<p><b>Por estado:</b> promedio de las encuestas públicas de gubernatura 2027. Pesan más las más recientes, las de muestra más grande y las de casas con mejor metodología.</p>
      <p><b>Por municipio:</b> no existen encuestas de gubernatura por municipio. Cada municipio se estima con ${basesUsadas()}, ajustados a lo que hoy dicen las encuestas de su estado. Donde hay encuesta de alcaldía (Rubrum) también se toma en cuenta. Los municipios suman exactamente el promedio estatal.</p>
      ${e ? `<p><b>Margen de error:</b> probado con la gubernatura anterior, el reparto entre municipios se desvió en promedio <b>±${e.toFixed(1)} puntos</b> por partido.</p>` : ''}
      <p>Lista nominal: INE, corte 20 ago 2026. <a href="#/metodologia">Metodología completa</a>.</p>`;
  }
  function textoFuenteMunicipio(m) {
    const r = m.rec;
    if (!r) return '<p>Este municipio usa el promedio estatal.</p>';
    const err = r.error_tipico_pp?.[m.leader];
    return `<p><b>Estimado con:</b> ${fuenteMunicipio(r)}, ajustado a las encuestas estatales actuales.</p>
      ${r.n_encuestas_municipales ? `<p>Incluye ${r.n_encuestas_municipales} ${r.n_encuestas_municipales === 1 ? 'sondeo' : 'sondeos'} de alcaldía de Rubrum (último: ${r.fecha_ultima_encuesta}). Detalle en <a href="#/alcaldias">Alcaldías 2027</a>.</p>` : ''}
      ${err ? `<p><b>Error típico:</b> ±${err.toFixed(1)} puntos para ${partyName(m.leader)}. La confianza indica qué tan probable es que el líder estimado vaya realmente adelante, suponiendo que el promedio estatal es correcto.</p>` : ''}
      <p>Es una estimación, no una encuesta del municipio. <a href="#/metodologia">Metodología</a>.</p>`;
  }

  /* ---------- Tooltip ----------
     Tarjeta con pleca negra (municipio + ESTADO), tabla con logotipo y
     nombre de cada fuerza, y una flecha curva que la une con el punto
     señalado. La tarjeta se separa del cursor para no tapar el municipio. */
  const TIP_GAP_X = 84, TIP_GAP_Y = 40;          // separación tarjeta ↔ cursor (px)
  const tipLogo = (p) => (PARTIES[p]?.logo
    ? `<span class="ax-tip-logo${p === 'MORENA' ? ' is-wordmark' : ''}"><img src="${PARTIES[p].logo}" alt="" width="${p === 'MORENA' ? 40 : 24}" height="24" decoding="async"></span>`
    : dot(p));
  // Precarga: el primer hover ya tiene los logotipos decodificados.
  for (const p of PARTY_ORDER) if (PARTIES[p].logo) { const im = new Image(); im.src = PARTIES[p].logo; }

  /** Tabla del tooltip. rows: [[party, valor, valor2, clase, etiqueta?]]; cols: encabezados. */
  function tipTable(cols, rows, cls = '') {
    return `<table class="ax-tip-t ${cls}">
      <thead><tr>${cols.map((c) => `<th scope="col">${c}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(([p, a, b, k, label]) => `<tr><th scope="row">${tipLogo(p)}<span>${label || partyName(p)}</span></th>
        <td>${a}</td><td class="${k || ''}">${b}</td></tr>`).join('')}</tbody>
    </table>`;
  }
  const num1 = (x) => (x * 100).toFixed(1);

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
    // Preferencia: arriba a la derecha del cursor; se voltea en cada eje si
    // no cabe. El ancla es la esquina de la tarjeta más cercana al cursor.
    const right = p.x + TIP_GAP_X + tipW <= w - 8 || p.x - TIP_GAP_X - tipW < 8;
    const above = p.y - TIP_GAP_Y - tipH >= 8 || p.y + TIP_GAP_Y + tipH > h - 8;
    let x = right ? p.x + TIP_GAP_X : p.x - TIP_GAP_X - tipW;
    let y = above ? p.y - TIP_GAP_Y - tipH : p.y + TIP_GAP_Y;
    x = Math.max(8, Math.min(w - tipW - 8, x));
    y = Math.max(8, Math.min(h - tipH - 8, y));
    tipEl.style.transform = `translate(${x}px, ${y}px)`;
    drawLead(p, x, y, right, above);
  }

  /** Flecha curva: sale del costado de la tarjeta y baja (o sube) hasta el
   *  punto, dejando un pequeño respiro para no tapar el municipio. */
  function drawLead(p, x, y, right, above) {
    const sx = right ? x : x + tipW;
    const sy = above ? y + tipH - 22 : y + 22;
    const ex = p.x + (right ? 3 : -3);
    const ey = p.y + (above ? -7 : 7);
    const cxp = ex, cyp = sy;                     // control: codo horizontal → vertical
    const d = `M${sx},${sy} Q${cxp},${cyp} ${ex},${ey}`;
    // Punta: tangente final = (end - control).
    const tx = ex - cxp, ty = ey - cyp, L = Math.hypot(tx, ty) || 1;
    const ux = tx / L, uy = ty / L, s = 7;
    const head = `M${ex - ux * s - uy * s * 0.6},${ey - uy * s + ux * s * 0.6} L${ex},${ey} L${ex - ux * s + uy * s * 0.6},${ey - uy * s - ux * s * 0.6}`;
    leadEl.querySelectorAll('path').forEach((el) => el.setAttribute('d', `${d} ${head}`));
    // En <svg> la propiedad `hidden` no existe (solo en elementos HTML): se usa el atributo.
    leadEl.removeAttribute('hidden');
  }

  function tipHTML(it) {
    const state = it.kind === 'mun' ? ENTIDADES[it.cve][0] : it.kind === 'estado' ? 'Gubernatura 2027' : '';
    let html = `<div class="ax-tip-h"><b>${it.name}</b>${state ? `<span>${state}</span>` : ''}</div><div class="ax-tip-b">`;
    if (it.kind === 'none') {
      html += '<p class="ax-tip-f">Sin elección de gubernatura en 2027</p>';
    } else if (mode === 'oportunidad' || (mode === 'cambio' && baseline === '2021')) {
      const h = histOf(it);
      const meta = metaOf(it.cve);
      const anio = anioOf(it.cve);
      if (!h) html += `<p class="ax-tip-f">${!hist ? 'Cargando resultados anteriores…' : it.kind === 'mun' ? `Sin resultado ${anio}: municipio creado después de esa elección` : 'Cargando municipios…'}</p>`;
      else if (mode === 'oportunidad') {
        const rows = unitList(it.cve).filter((u) => u.key in h.partidos).map((u) => [u, h.partidos[u.key]])
          .sort((a, b) => b[1] - a[1]).slice(0, 4)
          .map(([u, v]) => [unitParty(u), fmtNum(v), num1(v / h.votos), '', u.coalicion ? u.key.replace(/_/g, '·') : null]);
        html += tipTable(['Partido', `Votos ${anio}`, '%'], rows) + `<p class="ax-tip-f">Votos emitidos ${anio}: ${fmtNum(h.votos)}</p>`;
      } else {
        const rows = unitList(it.cve).filter((u) => u.key in h.partidos && u.members.some((p) => p in it.shares))
          .map((u) => [u, share27(it, u) - h.partidos[u.key] / h.votos]).sort((a, b) => b[1] - a[1]).slice(0, 4)
          .map(([u, d]) => [unitParty(u), num1(share27(it, u)), pp(d), d >= 0 ? 'is-up' : 'is-down', u.coalicion ? u.key.replace(/_/g, '·') : null]);
        html += tipTable(['Partido', '2027 %', 'Cambio'], rows) + `<p class="ax-tip-f">2027 estimado vs. ${anio} real</p>`;
      }
      if (meta && meta.desglose_partidos !== 'COMPLETO') {
        html += `<p class="ax-tip-w">${meta.desglose_partidos === 'SOLO_COALICIONES' ? 'Solo hay voto por coalición' : 'Algunos partidos solo como coalición'}: el instituto no publicó el desglose por partido.</p>`;
      }
    } else {
      const rows = rankShares(it.shares).slice(0, 4).map(([q, s]) => [q, it.ln ? fmtNum(Math.round(s * it.ln)) : '—', num1(s)]);
      html += tipTable(['Partido', 'Votos est.', '%'], rows);
      if (mode === 'cambio') {
        const g = it.estado.gob;
        html += `<p class="ax-tip-g">Gobierna ${partyName(g)} · ${it.leader !== g ? `<b>lidera ${partyName(it.leader)}</b>` : 'retiene'}</p>`;
      }
      html += `<p class="ax-tip-f">Lista nominal ${it.ln ? fmtNum(it.ln) : 'sin dato INE'}${it.kind === 'mun' ? (Number.isFinite(it.prob) ? ` · confianza ${Math.round(it.prob * 100)}%` : '') : ' · encuestas estatales'}</p>`;
      if (it.kind === 'mun') html += `<p class="ax-tip-s">Estimación con ${fuenteMunicipio(it.rec)}</p>`;
    }
    return html + '</div>';
  }
  function hideTip() {
    if (!tipEl.hidden) tipEl.hidden = true;
    if (!leadEl.hasAttribute('hidden')) leadEl.setAttribute('hidden', '');
  }

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
      html = `<p class="ax-lg-h">Mayor avance: gubernatura anterior → 2027</p><div class="ax-lg-grid">${PARTY_ORDER.slice(0, 4).map((p) => `<span class="ax-lg-n">${p === 'MORENA' ? 'Morena' : p}</span><span class="ax-lg-ramp">${steps(p, [0.12, 0.4, 0.7, 1])}</span>`).join('')}</div>
        <div class="ax-lg-scale"><span>0</span><span>+25 pp</span></div>`;
    } else {
      html = `<p class="ax-lg-h">${partyName(opParty)} · voto anterior</p><span class="ax-lg-ramp ax-lg-wide">${steps(opParty, [0.06, 0.3, 0.52, 0.74, 0.96])}</span>
        <div class="ax-lg-scale"><span>${pct1(opRange[0])}</span><span>${pct1(opRange[1])}</span></div>
        <p class="ax-lg-note">Son., Col. y B.C.S.: voto de coalición donde no hay desglose</p>`;
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
      setStatus('Cargando resultados de la gubernatura anterior…');
      histPromise = (async () => {
        const man = await loadManifest();
        const cves = store.estados.map((e) => e.cve).filter((c) => man[String(c)]);
        let n = 0;
        const res = await Promise.all(cves.map(async (c) => {
          const r = await loadHistGub(c).catch(() => null);
          n++;
          if (alive) setStatus(`Cargando resultados de la gubernatura anterior · ${n} de ${cves.length}`);
          return [c, r];
        }));
        const map = new Map(res.filter(([, r]) => r));
        unitsCache.clear();
        hist = map;
        const faltan = cves.length - map.size;
        setStatus(faltan ? `No se cargaron los resultados anteriores de ${faltan} ${faltan === 1 ? 'estado' : 'estados'}.`
          : loaded < total ? loadingText() : '', faltan ? 'warn' : 'info');
        return map;
      })().catch(() => { histPromise = null; setStatus('No se pudieron cargar los resultados de la gubernatura anterior.', 'warn'); return null; });
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
    await ensureHist();
    if (!alive) return;
    restyle();
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
