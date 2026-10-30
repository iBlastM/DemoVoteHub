// ============================================================
// views/electoral.js — Dashboard electoral (#/electoral).
// Resultados oficiales por sección en Querétaro (2018, 2021, 2024):
// ayuntamientos, gubernatura y diputaciones locales y federales.
// Datos estáticos generados con build_electoral.py. Plotly (mapa e
// histórico) se carga del CDN solo al abrir esta vista.
// ============================================================

import { PARTIES } from '../config.js';
import { fmtNum, slugify, easeOutCubic, clamp } from '../utils.js';

const PLOTLY_SRC = 'https://cdn.plot.ly/plotly-4.1.2.min.js';
const D = 'data/electoral/';
const G = 'geojsons/electoral/';

const ARCHIVOS = {
  ayuntamiento: { '2024': D + 'Ayuntamientos_2024.json', '2021': D + 'Ayuntamientos_2021.json', '2018': D + 'Ayuntamientos_2018.json' },
  gobernatura: { '2021': D + 'Gubernatura_2021.json' },
  diputacion_local: { '2024': D + 'DiputacionLocal_2024.json', '2021': D + 'DiputacionLocal_2021.json', '2018': D + 'DiputacionLocal_2018.json' },
  diputacion_federal: { '2024': D + 'DiputacionFederal_2024.json', '2021': D + 'DiputacionFederal_2021.json', '2018': D + 'DiputacionFederal_2018.json' },
};
const SECCIONES = { '2024': G + 'secciones_2024.geojson', '2021': G + 'secciones_2021.geojson', '2018': G + 'secciones_2018.geojson' };
const GEO_MUNICIPIOS = G + 'municipios.geojson';
const GEO_DISTRITOS = G + 'distritos_locales.geojson';
const CANDIDATOS = D + 'candidatos.json';

// Columnas de cada archivo (cambian por año y elección).
const COL_MAP = {
  ayuntamiento: {
    '2024': { municipio: 'Municipio', seccion: 'Seccion', listaNominal: 'Lista Nominal', votosEmitidos: 'Votos Emitidos', participacion: 'Participacion (%)', primerLugar: '1er Lugar', nulos: 'Nulos', partidos: ['PAN', 'PRI', 'PRD', 'PAN-PRI-PRD', 'PAN-PRI', 'PAN-PRD', 'PRI-PRD', 'PVEM', 'MORENA', 'PT', 'PVEM-MORENA-PT', 'PVEM-MORENA', 'PVEM-PT', 'MORENA-PT', 'MC', 'QS'] },
    '2021': { municipio: 'MUNICIPIO', seccion: 'SECCION', listaNominal: 'LISTA_NOMINAL', votosEmitidos: 'VOTOS_EMITIDOS', participacion: 'PARTICIPACION_PCN', primerLugar: '1ER_LUGAR', nulos: 'NULOS', partidos: ['PAN', 'PRI', 'PRD', 'MC', 'PVEM', 'MORENA', 'PT', 'QI', 'PES', 'RSP', 'FXM', 'PAN_PRD_QI', 'PAN_PRD', 'PAN_QI', 'PRD_QI', 'PRI_PVEM', 'PVEM_PT', 'PT_QI'] },
    '2018': { municipio: 'MUNICIPIO', seccion: 'SECCION', listaNominal: 'LISTA_NOMINAL', votosEmitidos: 'VOTOS_EMITIDOS', participacion: 'PARTICIPACION_PCN', primerLugar: '1ER_LUGAR', nulos: 'NULOS', partidos: ['PAN', 'PRI', 'PRD', 'MC', 'NA', 'PVEM', 'ES', 'MORENA', 'PT', 'CQ', 'QI', 'PAN_PRD_MC', 'PAN_PRD', 'PAN_MC', 'PRD_MC', 'PRI_PVEM', 'MORENA_PT_PES', 'MORENA_PT', 'MORENA_PES', 'PT_PES'] },
  },
  gobernatura: {
    '2021': { municipio: 'MUNICIPIO', seccion: 'SECCION', listaNominal: 'LISTA_NOMINAL', votosEmitidos: 'VOTOS_EMITIDOS', participacion: 'PARTICIPACION', primerLugar: '1ER_LUGAR', nulos: 'NULOS', partidos: ['PAN', 'PRI', 'PRD', 'MC', 'PVEM', 'MORENA', 'PT', 'QI', 'PES', 'RSP', 'FxM', 'PAN_QI'] },
  },
  diputacion_local: {
    '2024': { municipio: 'DISTRITO', seccion: 'SECCION', listaNominal: 'LISTA_NOMINAL', votosEmitidos: 'VOTOS_EMITIDOS', participacion: 'PARTICIPACION', primerLugar: '1ER_LUGAR', nulos: 'NULOS', partidos: ['PAN', 'PRI', 'PRD', 'PAN-PRI-PRD', 'PAN-PRI', 'PAN-PRD', 'PRI-PRD', 'PVEM', 'MORENA', 'PT', 'PVEM-MORENA-PT', 'PVEM-MORENA', 'PVEM-PT', 'MORENA-PT', 'MC', 'QS'] },
    '2021': { municipio: 'DISTRITO', seccion: 'SECCION', listaNominal: 'LISTA_NOMINAL', votosEmitidos: 'VOTOS_EMITIDOS', participacion: 'PARTICIPACION', primerLugar: '1ER_LUGAR', nulos: 'NULOS', partidos: ['PAN', 'PRI', 'PRD', 'MC', 'PVEM', 'MORENA', 'PT', 'QI', 'PES', 'RSP', 'FM', 'PAN_QI', 'PRI_PVEM', 'PVEM-PT'] },
    '2018': { municipio: 'DISTRITO', seccion: 'SECCION', listaNominal: 'LISTA_NOMINAL', votosEmitidos: 'VOTOS_EMITIDOS', participacion: 'PARTICIPACION', primerLugar: '1ER_LUGAR', nulos: 'NULOS', partidos: ['PAN', 'PRI', 'PRD', 'PVEM', 'PT', 'MC', 'NA', 'MORENA', 'ES', 'CQ', 'QI', 'MORENA-PT-PES', 'P_MORENA-PT', 'P_MORENA-PES', 'P_PT-PES', 'PRI-PVEM', 'CC_PAN-PRD-MC', 'P_PAN-PRD', 'P_PAN-MC', 'P_PRD-MC'] },
  },
  diputacion_federal: {
    '2024': { municipio: 'DISTRITO', seccion: 'SECCION', listaNominal: 'LISTA_NOMINAL', votosEmitidos: 'VOTOS_EMITIDOS', participacion: 'PARTICIPACION', primerLugar: '1ER_LUGAR', nulos: 'NULOS', partidos: ['PAN', 'PRI', 'PRD', 'MC', 'PVEM', 'MORENA', 'PT', 'PVEM-MORENA-PT', 'PVEM-MORENA', 'PVEM-PT', 'MORENA-PT', 'PAN-PRI-PRD', 'PAN-PRI', 'PAN-PRD', 'PRI-PRD'] },
    '2021': { municipio: 'DISTRITO', seccion: 'SECCION', listaNominal: 'LISTA_NOMINAL', votosEmitidos: 'VOTOS_EMITIDOS', participacion: 'PARTICIPACION', primerLugar: '1ER_LUGAR', nulos: 'NULOS', partidos: ['PAN', 'PRI', 'PRD', 'MC', 'PVEM', 'MORENA', 'PT', 'PES', 'RSP', 'FXM', 'CI', 'PVEM-MORENA-PT', 'PVEM-MORENA', 'PVEM-PT', 'MORENA-PT', 'PAN-PRI-PRD', 'PAN-PRI', 'PAN-PRD', 'PRI-PRD'] },
    '2018': { municipio: 'DISTRITO', seccion: 'SECCION', listaNominal: 'LISTA_NOMINAL', votosEmitidos: 'VOTOS_EMITIDOS', participacion: 'PARTICIPACION', primerLugar: '1ER_LUGAR', nulos: 'NULOS', partidos: ['PAN', 'PRI', 'PRD', 'MC', 'PVEM', 'NA', 'ES', 'MORENA', 'PT-MORENA-PES', 'MORENA-PES', 'PT-PES', 'MORENA-PT', 'PT', 'PAN-PRD-MC', 'PAN-MC', 'PAN-PRD', 'PRD-MC', 'PRI-PVEM-NA', 'PRI-PVEM', 'PRI-NA', 'PVEM-NA', 'CI01', 'CI02'] },
  },
};
const ELECCIONES_POR_ANIO = {
  '2024': ['ayuntamiento', 'diputacion_local', 'diputacion_federal'],
  '2021': ['ayuntamiento', 'gobernatura', 'diputacion_local', 'diputacion_federal'],
  '2018': ['ayuntamiento', 'diputacion_local', 'diputacion_federal'],
};
const ETIQUETA_ELECCION = { ayuntamiento: 'Ayuntamiento', gobernatura: 'Gubernatura', diputacion_local: 'Diputación local', diputacion_federal: 'Diputación federal' };
const ESTADOS_MX = ['Aguascalientes', 'Baja California', 'Baja California Sur', 'Campeche', 'Chiapas', 'Chihuahua', 'Ciudad de México', 'Coahuila', 'Colima', 'Durango', 'Estado de México', 'Guanajuato', 'Guerrero', 'Hidalgo', 'Jalisco', 'Michoacán', 'Morelos', 'Nayarit', 'Nuevo León', 'Oaxaca', 'Puebla', 'Querétaro', 'Quintana Roo', 'San Luis Potosí', 'Sinaloa', 'Sonora', 'Tabasco', 'Tamaulipas', 'Tlaxcala', 'Veracruz', 'Yucatán', 'Zacatecas'];

/* ---------- Partidos: colores del sitio (config.js) y logotipos ---------- */
const COLOR_BASE = {
  PAN: PARTIES.PAN.color, PRI: PARTIES.PRI.color, MORENA: PARTIES.MORENA.color, PT: PARTIES.PT.color,
  PVEM: PARTIES.PVEM.color, MC: PARTIES.MC.color,
  PRD: '#F2C300', QI: '#D6338A', PES: '#6E3A8C', RSP: '#E8747C', FXM: '#E86FAE', NA: '#14A3B8', CI: '#8A909B',
};
const ALIAS_PARTIDO = { FxM: 'FXM', FM: 'FXM', ES: 'PES', CQ: 'QI', QS: 'QI', CI01: 'CI', CI02: 'CI' };
const COLOR_IND = '#A3A9B3';
const COLOR_OTRO = '#8A909B';
const LOGOS = { PAN: 1, PRI: 1, PRD: 1, MORENA: 1, PT: 1, PVEM: 1, MC: 1 };
const PARTIDOS_INDIVIDUALES = ['PAN', 'PRI', 'MC', 'MORENA', 'PVEM', 'PT'];
const PARTIDOS_IND = ['QI', 'CQ', 'QS', 'CI', 'CI01', 'CI02']; // independientes y locales
const PARTIDOS_HIST = ['PAN', 'PRI', 'PRD', 'PVEM', 'PT', 'MC', 'MORENA'];

const AYUDA = {
  ln: 'Lista oficial de las personas con credencial vigente autorizadas para votar el día de la elección.',
  ve: 'Total de boletas depositadas en las urnas, sin importar cómo se marcaron.',
  nulos: 'Boletas que no cuentan para ninguna candidatura: en blanco o marcadas con errores.',
  part: 'Porcentaje de la lista nominal que acudió a votar.',
};

/* ---------- Utilidades ---------- */
const parseNum = (v) => parseFloat(String(v ?? '').replace(/,/g, '').trim()) || 0;
const normStr = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
const titleCase = (s) => String(s || '').toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const limpiar = (k) => String(k).replace(/^P_|^CC_/, '');
const tokens = (k) => limpiar(k).replace(/_/g, '-').split('-');
const etiqueta = (k) => limpiar(k).replace(/_/g, '-');
const esCoalicion = (p) => p.includes('-') || p.includes('_');
const esIndependiente = (p) => PARTIDOS_IND.includes(p);

/** Color de un partido o coalición (la coalición toma el color de su partido líder). */
function colorDe(p) {
  if (!p) return COLOR_OTRO;
  const k = ALIAS_PARTIDO[p] || p;
  if (COLOR_BASE[k]) return COLOR_BASE[k];
  const t = tokens(p).map((x) => ALIAS_PARTIDO[x] || x);
  return COLOR_BASE[t.includes('MORENA') ? 'MORENA' : t[0]] || COLOR_OTRO;
}
/** Color de relleno de una sección o municipio ganado. */
const colorGanador = (p) => (esIndependiente(p) ? COLOR_IND : p ? colorDe(p) : COLOR_OTRO);

/** Tinta legible (oscura o blanca) sobre un color de fondo. */
function rgbDe(hex) {
  const c = String(hex).trim().replace('#', '');
  const n = parseInt(c.length === 3 ? c.replace(/./g, '$&$&') : c, 16) || 0;
  return [n >> 16, (n >> 8) & 255, n & 255];
}
function tintaSobre(hex) {
  const [r, g, b] = rgbDe(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) > 165 ? '#14161a' : '#ffffff';
}
/** Oscurece un color hex restando `amt` a cada canal (caras laterales de las barras 3D). */
function oscurecer(hex, amt) {
  const [r, g, b] = rgbDe(hex).map((v) => Math.max(0, v - amt));
  return `rgb(${r},${g},${b})`;
}

function logo(id, size = 'xs') {
  return `<span class="plogo plogo-${size}" style="--pc:${colorDe(id)}" title="${id}"><img src="images/partidos/${id.toLowerCase()}.png" alt="${id}"></span>`;
}
function iconosPartido(partido, size = 'xs') {
  if (LOGOS[partido]) return logo(partido, size);
  const partes = [...new Set(tokens(partido))].filter((p) => LOGOS[p]);
  if (partes.length) return partes.map((p) => logo(p, size)).join('');
  return `<span class="el-pdot" style="background:${colorDe(partido)}"></span>`;
}

function colorParticipacion(pct) {
  if (pct < 50) return '#d64545';
  if (pct < 65) return '#e07b16';
  if (pct < 80) return '#c99a06';
  return '#16a35a';
}

function css(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
const esOscuro = () => document.documentElement.dataset.theme === 'dark';

/* ---------- Carga de recursos (caché entre visitas) ---------- */
const jsonCache = new Map();
function getJSON(url) {
  if (!jsonCache.has(url)) {
    const p = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`${r.status} ${url}`);
      return r.json();
    });
    p.catch(() => jsonCache.delete(url));
    jsonCache.set(url, p);
  }
  return jsonCache.get(url);
}

let plotlyPromise = null;
function loadPlotly() {
  if (window.Plotly) return Promise.resolve(window.Plotly);
  if (!plotlyPromise) {
    plotlyPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = PLOTLY_SRC;
      s.async = true;
      s.charset = 'utf-8';
      s.onload = () => resolve(window.Plotly);
      s.onerror = () => { plotlyPromise = null; s.remove(); reject(new Error('No se pudo cargar Plotly')); };
      document.head.appendChild(s);
    });
  }
  return plotlyPromise;
}

/* ---------- Plantilla ---------- */
const CHEVRON = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5.5 8l4.5 4.5L14.5 8"/></svg>';
const ICON_FS = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3.5 7.5v-4h4M16.5 7.5v-4h-4M3.5 12.5v4h4M16.5 12.5v4h-4"/></svg>';

function msField(name, label, lg) {
  return `<div class="el-field${lg ? ' el-field-lg' : ''}">
    <span class="el-label" id="el-label-${name}">${label}</span>
    <div class="el-ms" id="el-ms-${name}">
      <button type="button" class="el-ms-btn" id="el-ms-${name}-btn" aria-haspopup="listbox" aria-expanded="false" aria-labelledby="el-label-${name} el-ms-${name}-btn">
        <span class="el-ms-val">${name === 'seccion' ? 'Todas' : 'Todos'}</span>${CHEVRON}
      </button>
      <div class="el-ms-panel" id="el-ms-${name}-panel" hidden>
        <input type="search" class="el-ms-search" id="el-buscar-${name}" placeholder="Buscar ${name === 'seccion' ? 'sección' : 'municipio o distrito'}…" autocomplete="off">
        <div class="el-ms-list" id="el-ms-${name}-list" role="listbox"></div>
      </div>
    </div>
  </div>`;
}

function kpi(id, label, ayuda) {
  return `<div class="el-kpi">
    <span class="el-kpi-v" id="el-kpi-${id}">—</span>
    <span class="el-kpi-l">${label}<span class="el-help" tabindex="0" title="${ayuda}" aria-label="${ayuda}">?</span></span>
  </div>`;
}

function plantilla() {
  return `<div class="el">
  <section class="el-hero">
    <p class="eyebrow">Resultados oficiales por sección · <span class="fuente-real">Querétaro · 2018 · 2021 · 2024</span></p>
    <h1 class="el-h">Dashboard electoral</h1>
    <p class="el-sub">Ayuntamientos, gubernatura y diputaciones locales y federales. Filtra por año, elección, municipio o distrito y sección, o haz clic en el mapa.</p>
  </section>

  <section class="el-filtros" aria-label="Filtros">
    <label class="el-field el-field-lg"><span class="el-label">Entidad federativa</span>
      <select id="el-estado" class="el-select"></select></label>
    <label class="el-field"><span class="el-label">Año</span>
      <select id="el-anio" class="el-select"><option value="2024">2024</option><option value="2021">2021</option><option value="2018">2018</option></select></label>
    <label class="el-field"><span class="el-label">Elección</span>
      <select id="el-eleccion" class="el-select"></select></label>
    ${msField('municipio', 'Municipio', true)}
    ${msField('seccion', 'Sección', false)}
    <button type="button" class="el-btn" id="el-limpiar">Limpiar filtros</button>
  </section>

  <p class="el-error" id="el-error" hidden></p>

  <section class="el-kpis" aria-label="Indicadores">
    ${kpi('ln', 'Lista nominal', AYUDA.ln)}
    ${kpi('ve', 'Votos emitidos', AYUDA.ve)}
    ${kpi('nulos', 'Votos nulos', AYUDA.nulos)}
    ${kpi('part', 'Participación', AYUDA.part)}
  </section>

  <section class="el-grid">
    <div class="panel el-col">
      <div class="panel-head"><h3>Top candidatos</h3><span class="panel-sub">más votados</span></div>
      <div class="el-cands" id="el-top"></div>
    </div>
    <div class="panel el-col">
      <div class="panel-head"><h3>Votos por partido político</h3></div>
      <div class="el-partidos" id="el-partidos"></div>
    </div>
    <div class="panel el-col el-col-mapa" id="el-mapa-panel">
      <div class="panel-head">
        <h3>Distribución de secciones ganadas</h3>
        <div class="el-tools">
          <select id="el-mapa-vista" class="el-select el-select-sm" aria-label="Unidad del mapa"></select>
          <button type="button" class="el-icon-btn" id="el-mapa-fs" title="Pantalla completa" aria-label="Pantalla completa">${ICON_FS}</button>
        </div>
      </div>
      <div class="el-mapa" id="el-mapa"><p class="el-loading">Cargando mapa…</p></div>
    </div>
  </section>

  <section class="panel">
    <div class="panel-head">
      <h3>Distribución de votos</h3>
      <div class="el-tools">
        <div class="metric-toggle" id="el-barras-vista" role="group" aria-label="Agrupación">
          <button type="button" data-v="individual" class="on">Individual</button><button type="button" data-v="coalicion">Coalición</button>
        </div>
        <div class="metric-toggle" id="el-barras-modo" role="group" aria-label="Partidos mostrados">
          <button type="button" data-v="top" class="on">Top</button><button type="button" data-v="comparativa">Comparativa</button>
        </div>
        <select id="el-barras-n" class="el-select el-select-sm" aria-label="Cantidad del top">
          <option value="2">2</option><option value="3" selected>3</option><option value="5">5</option>
        </select>
      </div>
    </div>
    <div class="el-barras" id="el-barras"></div>
  </section>

  <section class="panel">
    <div class="panel-head"><h3>Comparativo histórico</h3><span class="panel-sub">votos por partido en cada elección</span></div>
    <div class="el-hist" id="el-hist"><p class="el-loading">Cargando gráfica…</p></div>
  </section>

  <section class="panel">
    <div class="panel-head">
      <h3>Resultados por sección</h3>
      <div class="el-tools">
        <span class="panel-sub" id="el-tabla-sub"></span>
        <div class="metric-toggle" id="el-tabla-vista" role="group" aria-label="Agrupación de la tabla">
          <button type="button" data-v="individual" class="on">Individual</button><button type="button" data-v="coalicion">Coalición</button>
        </div>
      </div>
    </div>
    <div class="el-table-wrap" id="el-tabla"></div>
  </section>

  <div class="el-modal" id="el-modal" role="dialog" aria-modal="true" aria-labelledby="el-modal-t" hidden>
    <div class="el-modal-card">
      <div class="el-modal-head">
        <h3 id="el-modal-t">Seleccionar partidos</h3>
        <button type="button" class="el-icon-btn" data-act="close" aria-label="Cerrar">×</button>
      </div>
      <div class="el-modal-quick">
        <button type="button" class="el-btn el-btn-sm" data-act="all">Todos</button>
        <button type="button" class="el-btn el-btn-sm" data-act="none">Ninguno</button>
      </div>
      <div class="el-modal-checks" id="el-modal-checks"></div>
      <div class="el-modal-foot">
        <button type="button" class="el-btn" data-act="close">Cancelar</button>
        <button type="button" class="el-btn el-btn-primary" data-act="apply">Aplicar</button>
      </div>
    </div>
  </div>
</div>`;
}

/* ============================================================
   Vista
   ============================================================ */
export function render(root) {
  root.innerHTML = plantilla();
  document.body.classList.add('el-wide');

  const $ = (id) => root.querySelector('#el-' + id);
  const elEstado = $('estado');
  const elAnio = $('anio');
  const elElec = $('eleccion');
  const elVista = $('mapa-vista');
  const elMapa = $('mapa');
  const elHist = $('hist');
  const elBarras = $('barras');
  const elModal = $('modal');
  const elChecks = $('modal-checks');
  const elTopN = $('barras-n');

  let alive = true;
  const limpiezas = [];
  const on = (target, ev, fn, opts) => {
    target.addEventListener(ev, fn, opts);
    limpiezas.push(() => target.removeEventListener(ev, fn, opts));
  };

  const st = {
    datos: [], cols: null, cand: null,
    geoSecciones: null, geoMun: null, geoDist: null,
    selMun: new Set(), selSec: new Set(),
    barrasVista: 'individual', barrasModo: 'top', barrasTop: 3,
    barrasSel: new Set(), barrasSelTmp: new Set(),
    tablaVista: 'individual', hits: [], seq: 0, histSeq: 0,
  };

  /* ---------- Filtros ---------- */
  function initEstados() {
    elEstado.innerHTML = ESTADOS_MX.map((e) => `<option value="${e}"${e === 'Querétaro' ? ' selected' : ''}>${e}</option>`).join('');
  }
  function actualizarElecciones() {
    const elecciones = ELECCIONES_POR_ANIO[elAnio.value] || ['ayuntamiento'];
    elElec.innerHTML = elecciones.map((e) => `<option value="${e}">${ETIQUETA_ELECCION[e] || e}</option>`).join('');
  }

  function setMsLabel(name, texto) { $(`ms-${name}-btn`).querySelector('.el-ms-val').textContent = texto; }
  function cerrarPaneles() {
    root.querySelectorAll('.el-ms-panel').forEach((p) => {
      p.hidden = true;
      const wrap = p.closest('.el-ms');
      wrap?.classList.remove('open');
      wrap?.querySelector('.el-ms-btn')?.setAttribute('aria-expanded', 'false');
    });
  }
  function msToggle(name) {
    const panel = $(`ms-${name}-panel`);
    const abierto = !panel.hidden;
    cerrarPaneles();
    if (abierto) return;
    panel.hidden = false;
    $(`ms-${name}`).classList.add('open');
    $(`ms-${name}-btn`).setAttribute('aria-expanded', 'true');
    $(`buscar-${name}`).focus();
  }

  function buildMsList(name, items, sel, onSelect) {
    const list = $(`ms-${name}-list`);
    const search = $(`buscar-${name}`);
    search.value = '';
    function pintar(q) {
      const filtrados = q ? items.filter((v) => v.toLowerCase().includes(q)) : items;
      list.innerHTML = filtrados.length
        ? filtrados.map((v) => `<label class="el-ms-opt"><input type="radio" name="el-radio-${name}" value="${esc(v)}"${sel.has(v) || sel.has(normStr(v)) ? ' checked' : ''}><span>${esc(v)}</span></label>`).join('')
        : '<p class="el-ms-empty">Sin coincidencias</p>';
      list.querySelectorAll('input[type=radio]').forEach((rb) => rb.addEventListener('change', () => { if (rb.checked) onSelect(rb.value); }));
    }
    search.oninput = () => pintar(search.value.toLowerCase());
    pintar('');
  }

  function actualizarMunicipios() {
    st.selMun.clear();
    st.selSec.clear();
    const tipo = elElec.value;
    const esDistrito = tipo === 'diputacion_local' || tipo === 'diputacion_federal';
    $('label-municipio').textContent = esDistrito ? 'Distrito' : 'Municipio';
    let raw = [...new Set(st.datos.map((r) => r[st.cols.municipio]).filter(Boolean))];
    raw = esDistrito
      ? raw.sort((a, b) => (parseInt(String(a).match(/\d+/)) || 0) - (parseInt(String(b).match(/\d+/)) || 0))
      : raw.sort();
    const muns = raw.map((m) => titleCase(m));
    const items = tipo === 'gobernatura' ? ['Todos', ...muns] : muns;
    if (tipo === 'gobernatura') setMsLabel('municipio', 'Todos');
    else if (muns.length) { st.selMun.add(normStr(muns[0])); setMsLabel('municipio', muns[0]); }
    const selInicial = tipo === 'gobernatura' ? new Set(['Todos']) : st.selMun;
    buildMsList('municipio', items, selInicial, (val) => {
      st.selMun.clear();
      if (val !== 'Todos') st.selMun.add(normStr(val));
      setMsLabel('municipio', val);
      cerrarPaneles();
      actualizarSecciones();
      renderDashboard();
    });
    actualizarSecciones();
  }

  function actualizarSecciones() {
    st.selSec.clear();
    const secs = [...new Set(getDatosFiltrados(true).map((r) => r[st.cols.seccion]).filter(Boolean))]
      .sort((a, b) => parseNum(a) - parseNum(b)).map(String);
    buildMsList('seccion', ['Todas', ...secs], new Set(['Todas']), (val) => {
      st.selSec.clear();
      if (val !== 'Todas') st.selSec.add(val);
      setMsLabel('seccion', val);
      cerrarPaneles();
      renderDashboard();
    });
    setMsLabel('seccion', 'Todas');
  }

  function getDatosFiltrados(soloMun = false) {
    let d = st.datos;
    if (st.selMun.size) d = d.filter((r) => st.selMun.has(normStr(r[st.cols.municipio])));
    if (!soloMun && st.selSec.size) d = d.filter((r) => st.selSec.has(String(r[st.cols.seccion])));
    return d;
  }

  function totalesPor(datos, cols) {
    const t = {};
    cols.partidos.forEach((p) => { t[p] = 0; });
    datos.forEach((r) => cols.partidos.forEach((p) => { t[p] += parseNum(r[p]); }));
    return t;
  }

  function mostrarError(msg) {
    const el = $('error');
    el.textContent = msg;
    el.hidden = !msg;
  }

  /* ---------- Carga ---------- */
  async function cargarDatos() {
    const tipo = elElec.value, anio = elAnio.value;
    if (!ARCHIVOS[tipo]?.[anio]) return;
    const seq = ++st.seq;
    root.querySelector('.el').classList.add('is-loading');
    try {
      const [datos, cand] = await Promise.all([getJSON(ARCHIVOS[tipo][anio]), getJSON(CANDIDATOS)]);
      if (!alive || seq !== st.seq) return;
      mostrarError('');
      st.cols = COL_MAP[tipo][anio];
      st.datos = datos;
      st.cand = cand;
      actualizarMunicipios();
      actualizarMapaVista();
      renderDashboard();
      cargarMapa(seq);
    } catch (err) {
      if (alive && seq === st.seq) mostrarError('No se pudieron cargar los resultados electorales. Abre el sitio desde un servidor local (python serve.py), no con file://.');
    } finally {
      if (seq === st.seq) root.querySelector('.el')?.classList.remove('is-loading');
    }
  }

  function animateCount(id, target, isPct = false) {
    const el = $('kpi-' + id);
    const t0 = performance.now();
    function step(now) {
      if (!alive) return;
      const p = clamp((now - t0) / 1000, 0, 1);
      const v = target * easeOutCubic(p);
      el.textContent = isPct ? v.toFixed(2) + '%' : fmtNum(Math.round(v));
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  /* ---------- Render ---------- */
  function renderDashboard() {
    const datos = getDatosFiltrados(), cols = st.cols;
    if (!cols) return;
    const listaNominal = datos.reduce((s, r) => s + parseNum(r[cols.listaNominal]), 0);
    const votosEmitidos = datos.reduce((s, r) => s + parseNum(r[cols.votosEmitidos]), 0);
    const nulos = datos.reduce((s, r) => s + parseNum(r[cols.nulos]), 0);
    const participacion = listaNominal > 0 ? (votosEmitidos / listaNominal) * 100 : 0;

    animateCount('ln', listaNominal);
    animateCount('ve', votosEmitidos);
    animateCount('nulos', nulos);
    animateCount('part', participacion, true);
    $('kpi-part').style.color = colorParticipacion(participacion);

    renderTop3(datos, cols);
    renderPartidos(datos, cols);
    renderBarras(datos, cols);
    renderHistorico();
    renderTabla(datos, cols);
    actualizarMapa();
  }

  /* ---------- Top 3 candidaturas (agrupa los votos de cada candidatura) ---------- */
  function sumaCol(datos, col) { return datos.reduce((s, r) => s + parseNum(r[col]), 0); }
  function colPrincipal(datos, columnas) {
    return columnas.reduce((best, col) => {
      const v = sumaCol(datos, col);
      return v > best[1] ? [col, v] : best;
    }, ['', 0])[0];
  }
  function top3DeCandidatos(candData, datos, municipio) {
    return Object.entries(candData).map(([nombre, columnas]) => {
      if (!columnas.length) return null;
      const votos = columnas.reduce((s, col) => s + sumaCol(datos, col), 0);
      return { nombre, votos, mainCol: colPrincipal(datos, columnas), columnas, municipio };
    }).filter((c) => c && c.votos > 0).sort((a, b) => b.votos - a.votos).slice(0, 3);
  }

  function fotoCandidato(c, tipo, anio) {
    if (c.esPartido || (anio !== '2021' && anio !== '2024')) return null;
    if (tipo === 'gobernatura') return `images/candidatos/${anio}/gobernatura/${slugify(c.nombre)}.jpg`;
    if (!c.municipio) return null;
    return `images/candidatos/${anio}/${tipo}/${slugify(c.municipio)}/${slugify(c.nombre)}.jpg`;
  }
  /** Iniciales de nombre y primer apellido ("Mauricio Kuri González" -> "MK"). */
  function iniciales(nombre) {
    const w = String(nombre).split(/\s+/).filter(Boolean);
    const apellido = w.length >= 3 ? w[w.length - 2] : w[1];
    return ((w[0]?.[0] || '') + (apellido?.[0] || '')).toUpperCase();
  }

  function renderTop3(datos, cols) {
    const tipo = elElec.value, anio = elAnio.value;
    const totalVotos = datos.reduce((s, r) => s + parseNum(r[cols.votosEmitidos]), 0);

    let top3 = null;
    const data = st.cand?.[tipo]?.[anio];
    if (data) {
      if (tipo === 'gobernatura') {
        top3 = top3DeCandidatos(data, datos);
      } else if (st.selMun.size === 1) {
        const munKey = [...st.selMun][0];
        if (data[munKey]) top3 = top3DeCandidatos(data[munKey], datos, munKey);
      } else {
        // Varios municipios: cada candidatura suma solo las filas de su municipio.
        const todos = [];
        Object.entries(data).forEach(([munKey, munCands]) => {
          const filas = datos.filter((r) => normStr(r[cols.municipio]) === munKey);
          if (!filas.length) return;
          Object.entries(munCands).forEach(([nombre, columnas]) => {
            if (!columnas.length) return;
            const votos = columnas.reduce((s, col) => s + sumaCol(filas, col), 0);
            if (votos <= 0) return;
            todos.push({ nombre, votos, mainCol: colPrincipal(filas, columnas), columnas, municipio: munKey });
          });
        });
        top3 = todos.sort((a, b) => b.votos - a.votos).slice(0, 3);
      }
    }

    // Si faltan candidaturas, se completa con partidos y coaliciones.
    if (!top3 || top3.length < 3) {
      const usadas = new Set((top3 || []).flatMap((c) => c.columnas));
      const libres = { ...cols, partidos: cols.partidos.filter((col) => !usadas.has(col)) };
      const extra = Object.entries(gruposCoalicion(libres)).map(([key, columnas]) => ({
        nombre: etiqueta(key),
        votos: columnas.reduce((s, col) => s + sumaCol(datos, col), 0),
        mainCol: colPrincipal(datos, columnas),
        columnas,
        esPartido: true,
      })).filter((c) => c.votos > 0);
      top3 = [...(top3 || []), ...extra].sort((a, b) => b.votos - a.votos).slice(0, 3);
    }

    const cont = $('top');
    if (!top3.length) { cont.innerHTML = '<p class="el-empty">Sin datos para este filtro.</p>'; return; }
    cont.innerHTML = top3.map((c, i) => {
      const pct = totalVotos > 0 ? ((c.votos / totalVotos) * 100).toFixed(1) : '0.0';
      const partidos = [...new Set(c.columnas.flatMap(tokens))];
      const conLogo = partidos.filter((p) => LOGOS[p]);
      const iconos = conLogo.length ? conLogo.map((p) => logo(p)).join('') : iconosPartido(c.mainCol);
      const foto = fotoCandidato(c, tipo, anio);
      const nombre = c.esPartido ? c.nombre : titleCase(c.nombre);
      const ph = `<span class="el-cand-ph" aria-hidden="true">${esc(c.esPartido ? '' : iniciales(c.nombre))}</span>`;
      return `<article class="el-cand" style="--c:${colorDe(c.mainCol)}">
        <div class="el-cand-foto">${ph}${foto ? `<img src="${esc(foto)}" alt="${esc(nombre)}" loading="lazy">` : ''}<span class="el-cand-pos">${i + 1}°</span></div>
        <div class="el-cand-body">
          <div class="el-cand-logos">${iconos}</div>
          <h4 class="el-cand-nombre">${esc(nombre)}</h4>
          <p class="el-cand-partido">${esc(partidos.join(' + '))}</p>
          <dl class="el-cand-stats">
            <div><dt>Votos</dt><dd>${fmtNum(c.votos)}</dd></div>
            <div><dt>Porcentaje</dt><dd>${pct}%</dd></div>
          </dl>
        </div>
      </article>`;
    }).join('');
    cont.querySelectorAll('.el-cand-foto img').forEach((img) => img.addEventListener('error', () => img.remove(), { once: true }));
  }

  /* ---------- Votos por partido (individuales + IND + OTROS) ---------- */
  function renderPartidos(datos, cols) {
    const totales = totalesPor(datos, cols);
    const votosTotal = Object.values(totales).reduce((a, b) => a + b, 0);
    const panel = {};
    PARTIDOS_INDIVIDUALES.forEach((p) => { panel[p] = totales[p] || 0; });
    panel.IND = PARTIDOS_IND.reduce((s, p) => s + (totales[p] || 0), 0);
    const usados = new Set([...PARTIDOS_INDIVIDUALES, ...PARTIDOS_IND]);
    const otros = Object.entries(totales).reduce((s, [p, v]) => (usados.has(p) ? s : s + v), 0);
    const filas = Object.entries(panel).sort((a, b) => b[1] - a[1]);
    filas.push(['OTROS', otros]);

    $('partidos').innerHTML = filas.map(([partido, votos]) => {
      const pct = votosTotal > 0 ? ((votos / votosTotal) * 100).toFixed(1) : '0.0';
      const color = partido === 'OTROS' ? COLOR_OTRO : partido === 'IND' ? COLOR_IND : colorDe(partido);
      const icono = LOGOS[partido] ? logo(partido, '2xs') : `<span class="el-pdot" style="background:${color}"></span>`;
      return `<div class="el-part" style="--c:${color}">
        <div class="el-part-head">${icono}<b>${partido}</b></div>
        <div class="el-part-v">${fmtNum(votos)}</div>
        <div class="el-part-bar"><span style="width:${pct}%"></span></div>
        <span class="el-part-pct">${pct}%</span>
      </div>`;
    }).join('');
  }

  /* ---------- Mapa (Plotly choroplethmap sobre teselas OpenFreeMap) ---------- */
  function actualizarMapaVista() {
    const tipo = elElec.value;
    elVista.innerHTML = tipo === 'diputacion_local'
      ? '<option value="secciones">Secciones</option><option value="distritos">Distritos</option>'
      : tipo === 'diputacion_federal'
        ? '<option value="secciones">Secciones</option>'
        : '<option value="secciones">Secciones</option><option value="municipios">Municipios</option>';
  }

  async function cargarMapa(seq) {
    const tipo = elElec.value, anio = elAnio.value;
    const url = SECCIONES[anio];
    if (!url) return;
    try {
      const [, secciones, municipios, distritos] = await Promise.all([
        loadPlotly(), getJSON(url), getJSON(GEO_MUNICIPIOS),
        tipo === 'diputacion_local' ? getJSON(GEO_DISTRITOS) : Promise.resolve(st.geoDist),
      ]);
      if (!alive || seq !== st.seq) return;
      st.geoSecciones = secciones;
      st.geoMun = municipios;
      st.geoDist = distritos;
      actualizarMapa();
    } catch {
      if (alive) elMapa.innerHTML = '<p class="el-loading">No se pudo cargar el mapa. Revisa la conexión a internet.</p>';
    }
  }

  function ganadorPor(campo) {
    const conteo = {};
    st.datos.forEach((r) => {
      const k = normStr(r[campo]);
      const p = r[st.cols.primerLugar];
      if (!p) return;
      (conteo[k] ||= {})[p] = (conteo[k][p] || 0) + 1;
    });
    const out = {};
    Object.entries(conteo).forEach(([k, ps]) => { out[k] = Object.entries(ps).sort((a, b) => b[1] - a[1])[0]?.[0] || ''; });
    return out;
  }

  function actualizarMapa() {
    const Plotly = window.Plotly;
    if (!Plotly || !st.geoSecciones || !st.cols || !alive) return;
    elMapa.querySelector('.el-loading')?.remove();
    const vista = elVista.value;
    const datos = getDatosFiltrados();
    const oscuro = esOscuro();
    const cols = st.cols;

    let geo, colors, texts;
    if (vista === 'municipios' && st.geoMun) {
      const gan = ganadorPor(cols.municipio);
      const feats = st.selMun.size
        ? st.geoMun.features.filter((f) => st.selMun.has(normStr(f.properties.NOM_MUN)))
        : st.geoMun.features;
      geo = { type: 'FeatureCollection', features: feats.map((f, i) => ({ ...f, id: String(i) })) };
      colors = geo.features.map((f) => colorGanador(gan[normStr(f.properties.NOM_MUN)] || ''));
      texts = geo.features.map((f) => `${f.properties.NOM_MUN}: ${etiqueta(gan[normStr(f.properties.NOM_MUN)] || 'Sin datos')}`);
    } else if (vista === 'distritos' && st.geoDist) {
      const gan = ganadorPor(cols.municipio);
      let feats = st.geoDist.features;
      if (st.selMun.size) feats = feats.filter((f) => st.selMun.has(normStr(`DISTRITO ${f.properties.DISTRITO_L}`)));
      geo = { type: 'FeatureCollection', features: feats.map((f, i) => ({ ...f, id: String(i) })) };
      colors = geo.features.map((f) => colorGanador(gan[normStr(`DISTRITO ${f.properties.DISTRITO_L}`)] || ''));
      texts = geo.features.map((f) => `Distrito ${f.properties.DISTRITO_L}: ${etiqueta(gan[normStr(`DISTRITO ${f.properties.DISTRITO_L}`)] || 'Sin datos')}`);
    } else {
      const lookup = {};
      datos.forEach((r) => {
        lookup[String(parseInt(r[cols.seccion]) || 0)] = { partido: r[cols.primerLugar], municipio: titleCase(r[cols.municipio]) };
      });
      const secs = new Set(Object.keys(lookup));
      const feats = secs.size < st.geoSecciones.features.length
        ? st.geoSecciones.features.filter((f) => secs.has(f.id))
        : st.geoSecciones.features;
      geo = { type: 'FeatureCollection', features: feats };
      colors = feats.map((f) => colorGanador(lookup[f.id]?.partido || ''));
      texts = feats.map((f) => {
        const info = lookup[f.id];
        return info ? `${info.municipio} · Sección ${f.id}<br>${etiqueta(info.partido || '')}` : `Sección ${f.id}`;
      });
    }
    if (!geo.features.length) return;

    const unicos = [...new Set(colors)];
    const idx = {};
    unicos.forEach((c, i) => { idx[c] = i; });
    const N = unicos.length;
    const cscale = N === 1 ? [[0, unicos[0]], [1, unicos[0]]] : unicos.map((c, i) => [i / (N - 1), c]);

    let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
    geo.features.forEach((f) => {
      const coords = f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates.flat(2) : f.geometry.coordinates.flat(1);
      coords.forEach(([lon, lat]) => {
        if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
        if (lon < minLon) minLon = lon; if (lon > maxLon) maxLon = lon;
      });
    });
    const span = Math.max(maxLat - minLat, maxLon - minLon);
    const conFiltro = st.selMun.size || st.selSec.size;
    const zoom = conFiltro ? (span > 0.5 ? 8.5 : span > 0.1 ? 10 : 10.5) : (span > 1.5 ? 6.8 : span > 0.5 ? 7.6 : 10);

    Plotly.react(elMapa, [{
      type: 'choroplethmap', geojson: geo, locations: geo.features.map((f) => f.id), z: colors.map((c) => idx[c]),
      below: '', colorscale: cscale, zmin: 0, zmax: Math.max(N - 1, 1),
      showscale: false, text: texts, hoverinfo: 'text',
      marker: { opacity: 0.88, line: { width: 0.6, color: oscuro ? 'rgba(255,255,255,.35)' : 'rgba(20,22,26,.45)' } },
    }], {
      map: { style: `https://tiles.openfreemap.org/styles/${oscuro ? 'dark' : 'positron'}`, center: { lat: (minLat + maxLat) / 2, lon: (minLon + maxLon) / 2 }, zoom },
      paper_bgcolor: css('--surface-2'), margin: { t: 0, b: 0, l: 0, r: 0 }, showlegend: false,
      hoverlabel: { bgcolor: css('--surface'), bordercolor: css('--hair'), font: { family: 'Inter, system-ui, sans-serif', size: 12, color: css('--ink') } },
    }, { responsive: true, displayModeBar: false });

    elMapa.removeAllListeners?.('plotly_click');
    elMapa.on('plotly_click', (ev) => {
      const pt = ev.points?.[0];
      if (!pt) return;
      if (vista === 'secciones') {
        if (!pt.location) return;
        st.selSec.clear();
        st.selSec.add(pt.location);
        setMsLabel('seccion', pt.location);
        renderDashboard();
        return;
      }
      const feat = geo.features[pt.pointIndex];
      if (!feat) return;
      const nombre = vista === 'municipios' ? feat.properties.NOM_MUN : `Distrito ${feat.properties.DISTRITO_L}`;
      st.selMun.clear();
      st.selMun.add(normStr(nombre));
      setMsLabel('municipio', titleCase(nombre));
      actualizarSecciones();
      renderDashboard();
    });
  }

  /* ---------- Distribución de votos (barras horizontales en canvas) ---------- */
  function gruposCoalicion(cols) {
    const indiv = cols.partidos.filter((c) => !esCoalicion(c));
    const coal = cols.partidos.filter(esCoalicion).map((col) => {
      const comps = new Set(tokens(col)
        .filter((t) => indiv.includes(t) || (t === 'PES' && indiv.includes('ES')))
        .map((t) => (t === 'PES' ? 'ES' : t)));
      return { col, comps };
    }).sort((a, b) => b.comps.size - a.comps.size);
    const anclas = [];
    const asignado = {};
    coal.forEach(({ col, comps }) => {
      if (comps.size < 2) return;
      const padre = anclas.find((a) => [...comps].every((c) => a.members.has(c)));
      if (padre) asignado[col] = padre.key;
      else { anclas.push({ key: col, members: comps }); asignado[col] = col; }
    });
    indiv.forEach((p) => {
      const a = anclas.find((x) => x.members.has(p));
      asignado[p] = a ? a.key : p;
    });
    coal.forEach(({ col }) => { if (!asignado[col]) asignado[col] = col; });
    const grupos = {};
    cols.partidos.forEach((col) => {
      const key = asignado[col] || col;
      (grupos[key] ||= []).push(col);
    });
    return grupos;
  }

  function filasBarras(datos, cols) {
    const totales = totalesPor(datos, cols);
    const comparar = st.barrasModo === 'comparativa' && st.barrasSel.size;
    if (st.barrasVista === 'coalicion') {
      let filas = Object.entries(gruposCoalicion(cols))
        .filter(([, columnas]) => columnas.length > 1)
        .map(([key, columnas]) => {
          const segs = columnas.map((col) => ({ col, votos: totales[col] || 0 })).filter((s) => s.votos > 0).sort((a, b) => b.votos - a.votos);
          return { key, segs, total: segs.reduce((s, x) => s + x.votos, 0) };
        })
        .filter((g) => g.total > 0)
        .sort((a, b) => b.total - a.total);
      filas = comparar ? filas.filter((g) => st.barrasSel.has(g.key)) : filas.slice(0, st.barrasTop);
      const max = Object.values(totales).reduce((a, b) => a + b, 0) || 1;
      return { filas, max, coalicion: true };
    }
    let filas = Object.entries(totales).filter(([p, v]) => v > 0 && !esCoalicion(p)).sort((a, b) => b[1] - a[1]);
    filas = comparar ? filas.filter(([p]) => st.barrasSel.has(p)) : filas.slice(0, st.barrasTop);
    const max = filas.reduce((s, [, v]) => s + v, 0) || 1;
    return { filas: filas.map(([p, v]) => ({ key: p, segs: [{ col: p, votos: v }], total: v })), max, coalicion: false };
  }

  let tip = null;
  function initTooltip(canvas) {
    tip = document.createElement('div');
    tip.className = 'el-tip';
    elBarras.appendChild(tip);
    canvas.addEventListener('mousemove', (e) => {
      const r = canvas.getBoundingClientRect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      const hit = st.hits.find((a) => mx >= a.x && mx <= a.x + a.w && my >= a.y && my <= a.y + a.h);
      if (!hit) { tip.style.opacity = '0'; return; }
      tip.textContent = `${etiqueta(hit.partido)} · ${fmtNum(hit.votos)} votos (${hit.pct}%)`;
      tip.style.left = clamp(mx + 12, 0, r.width - tip.offsetWidth) + 'px';
      tip.style.top = Math.max(0, my - 34) + 'px';
      tip.style.opacity = '1';
    });
    canvas.addEventListener('mouseleave', () => { tip.style.opacity = '0'; });
  }

  function renderBarras(datos, cols) {
    const { filas, max, coalicion } = filasBarras(datos, cols);
    let canvas = elBarras.querySelector('canvas');
    if (!canvas) {
      canvas = document.createElement('canvas');
      elBarras.appendChild(canvas);
      initTooltip(canvas);
    }
    st.hits = [];
    const H = 380;
    const W = elBarras.clientWidth;
    if (!W) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.style.height = H + 'px';
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const oscuro = esOscuro();
    const ink = css('--ink'), ink2 = css('--ink-2'), muted = css('--muted');
    const fData = css('--font-data') || 'sans-serif';
    const fBody = css('--font-body') || 'sans-serif';
    if (!filas.length) {
      ctx.fillStyle = muted;
      ctx.font = `500 13px ${fBody}`;
      ctx.textBaseline = 'middle';
      ctx.fillText(st.barrasModo === 'comparativa' ? 'Ningún partido seleccionado.' : 'Sin votos para este filtro.', 4, H / 2);
      return;
    }

    // Barras en 3D (frente, cara superior y cara lateral). La pista toma los tonos del tema.
    const pistaFrente = css('--hair-2'), pistaTapa = css('--hair'), pistaLado = oscurecer(css('--hair'), oscuro ? 14 : 24);
    const tapaBarra = oscuro ? '#2a2d3a' : '#3a3d4a';
    const n = filas.length;
    const padTop = 20, padBot = 20, padL = coalicion ? 150 : 130, padR = 100;
    const chartW = Math.max(40, W - padL - padR);
    const barAreaH = (H - padTop - padBot) / n;
    const barH = Math.min(barAreaH * 0.55, 60);
    const d = barH * 0.22; // profundidad del efecto 3D
    const poligono = (pts, color) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      pts.slice(1).forEach(([px, py]) => ctx.lineTo(px, py));
      ctx.closePath();
      ctx.fill();
    };
    const caraSuperior = (x, w, y, color) => poligono([[x, y], [x + d, y - d], [x + w + d, y - d], [x + w, y]], color);
    const caraLateral = (x, y, color) => poligono([[x, y], [x + d, y - d], [x + d, y + barH - d], [x, y + barH]], color);

    filas.forEach((f, i) => {
      const cy = padTop + barAreaH * i + barAreaH / 2;
      const y0 = cy - barH / 2;
      const x0 = padL;
      const barW = (f.total / max) * chartW;

      // Pista completa (100 %).
      ctx.fillStyle = pistaFrente;
      ctx.fillRect(x0, y0, chartW, barH);
      caraSuperior(x0, chartW, y0, pistaTapa);
      caraLateral(x0 + chartW, y0, pistaLado);

      // Segmentos (uno por partido; varios en coalición), cada uno con su cara lateral.
      let x = x0;
      f.segs.forEach((s, si) => {
        const w = (s.votos / max) * chartW;
        const color = colorDe(s.col);
        ctx.fillStyle = color;
        ctx.fillRect(x, y0, w, barH);
        caraLateral(x + w, y0, oscurecer(color, 60));
        const pct = ((s.votos / (coalicion ? f.total : max)) * 100).toFixed(1);
        st.hits.push({ x, y: y0, w, h: barH, partido: s.col, votos: s.votos, pct });
        if (coalicion && si === 0 && w > 30) {
          ctx.fillStyle = tintaSobre(color);
          ctx.font = `700 ${Math.max(9, Math.min(12, barH * 0.35))}px ${fData}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(etiqueta(s.col), x + w / 2, cy, w - 6);
        }
        x += w;
      });
      caraSuperior(x0, barW, y0, tapaBarra);

      if (!coalicion && barW > 80) {
        ctx.fillStyle = tintaSobre(colorDe(f.key));
        ctx.font = `700 ${Math.max(12, barH * 0.35)}px ${fData}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${((f.total / max) * 100).toFixed(1)}%`, x0 + 10, cy);
      }

      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillStyle = ink2;
      ctx.font = `600 ${Math.max(11, barH * 0.22)}px ${fData}`;
      ctx.fillText(fmtNum(f.total), x0 + barW + d + 6, cy - d / 2);

      ctx.textAlign = 'right';
      ctx.fillStyle = ink;
      ctx.font = `600 ${Math.max(11, barH * 0.28)}px ${fBody}`;
      ctx.fillText(etiqueta(f.key), padL - 8, cy, padL - 12);
    });
  }

  /* ---------- Modal de comparativa ---------- */
  function clavesBarras() {
    const datos = getDatosFiltrados(), cols = st.cols;
    const totales = totalesPor(datos, cols);
    if (st.barrasVista === 'individual') {
      return Object.entries(totales).filter(([p, v]) => v > 0 && !esCoalicion(p)).sort((a, b) => b[1] - a[1]).map(([p]) => p);
    }
    return Object.entries(gruposCoalicion(cols))
      .filter(([, columnas]) => columnas.length > 1)
      .map(([key, columnas]) => ({ key, total: columnas.reduce((s, col) => s + (totales[col] || 0), 0) }))
      .filter((g) => g.total > 0)
      .sort((a, b) => b.total - a.total)
      .map((g) => g.key);
  }
  function abrirModal() {
    if (!st.cols) return;
    const claves = clavesBarras();
    st.barrasSelTmp = new Set(st.barrasSel.size ? st.barrasSel : claves.slice(0, 5));
    elChecks.innerHTML = claves.map((k) => `<label class="el-check" style="--c:${colorDe(k)}">
      <input type="checkbox" value="${esc(k)}"${st.barrasSelTmp.has(k) ? ' checked' : ''}><span class="el-check-sw"></span><span>${esc(etiqueta(k))}</span></label>`).join('')
      || '<p class="el-empty">No hay partidos con votos en este filtro.</p>';
    elChecks.querySelectorAll('input').forEach((cb) => cb.addEventListener('change', () => {
      if (cb.checked) st.barrasSelTmp.add(cb.value); else st.barrasSelTmp.delete(cb.value);
    }));
    elModal.hidden = false;
    elModal.querySelector('[data-act="apply"]').focus();
  }
  function cerrarModal() { elModal.hidden = true; }

  /* ---------- Comparativo histórico (Plotly) ---------- */
  async function renderHistorico() {
    const hs = ++st.histSeq;
    const tipo = elElec.value, anioActual = elAnio.value;
    const anios = Object.keys(ARCHIVOS[tipo] || {}).sort();
    const Plotly = window.Plotly;
    if (anios.length < 2) {
      if (Plotly) Plotly.purge(elHist);
      elHist.innerHTML = '<p class="el-loading">No hay datos históricos para este tipo de elección.</p>';
      return;
    }
    let datosPorAnio;
    try {
      const [P, ...porAnio] = await Promise.all([
        loadPlotly(),
        ...anios.map((a) => (a === anioActual ? Promise.resolve(st.datos) : getJSON(ARCHIVOS[tipo][a]))),
      ]);
      if (!alive || hs !== st.histSeq || !P) return;
      datosPorAnio = porAnio;
    } catch {
      if (alive && hs === st.histSeq) elHist.innerHTML = '<p class="el-loading">No se pudo cargar la gráfica histórica.</p>';
      return;
    }

    const series = {};
    PARTIDOS_HIST.forEach((p) => { series[p] = []; });
    anios.forEach((anio, i) => {
      const cols = COL_MAP[tipo][anio];
      let datos = datosPorAnio[i];
      if (st.selMun.size) datos = datos.filter((r) => st.selMun.has(normStr(r[cols.municipio])));
      if (st.selSec.size) datos = datos.filter((r) => st.selSec.has(String(r[cols.seccion])));
      PARTIDOS_HIST.forEach((p) => {
        series[p].push(cols.partidos.includes(p) && datos.length ? sumaCol(datos, p) : null);
      });
    });

    const x = anios.map(Number);
    const traces = PARTIDOS_HIST.filter((p) => series[p].some((v) => v !== null && v > 0)).map((p) => ({
      x, y: series[p], name: p, type: 'scatter', mode: 'lines+markers', connectgaps: true,
      line: { color: colorDe(p), width: 3 },
      marker: { size: x.map((a) => (a === +anioActual ? 13 : 7)), color: colorDe(p), line: { width: 2, color: css('--surface') } },
      hovertemplate: '%{customdata}<extra></extra>',
      customdata: series[p].map((v, i) => (v !== null ? `${p} ${anios[i]}: ${fmtNum(v)} votos` : '')),
    }));

    const ink2 = css('--ink-2'), grid = css('--hair-2'), hair = css('--hair'), muted = css('--muted');
    elHist.querySelector('.el-loading')?.remove();
    window.Plotly.react(elHist, traces, {
      paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
      font: { family: 'Inter, system-ui, sans-serif', color: ink2, size: 12 },
      margin: { t: 30, b: 50, l: 70, r: 20 },
      xaxis: { tickvals: x, ticktext: anios, gridcolor: grid, linecolor: hair, range: [x[0] - 0.5, x[x.length - 1] + 0.5], tickfont: { family: 'Space Grotesk, Inter, sans-serif' } },
      yaxis: { gridcolor: grid, zerolinecolor: hair, title: { text: 'Votos', font: { color: muted } }, tickformat: ',', tickfont: { family: 'Space Grotesk, Inter, sans-serif' } },
      legend: { orientation: 'h', y: -0.18, x: 0.5, xanchor: 'center' },
      hoverlabel: { bgcolor: css('--surface'), bordercolor: hair, font: { family: 'Inter, system-ui, sans-serif', color: css('--ink') } },
      shapes: [{ type: 'line', x0: +anioActual, x1: +anioActual, y0: 0, y1: 1, yref: 'paper', line: { color: hair, width: 2, dash: 'dash' } }],
      annotations: [{ x: +anioActual, y: 1, yref: 'paper', yshift: 12, showarrow: false, text: `${anioActual} (seleccionado)`, font: { size: 11, color: muted } }],
    }, { responsive: true, displayModeBar: false });
  }

  /* ---------- Tabla por sección ---------- */
  function badge(k) {
    const c = colorDe(k);
    return `<span class="el-badge" style="--c:${c};--t:${tintaSobre(c)}">${esc(etiqueta(k))}</span>`;
  }
  function renderTabla(datos, cols) {
    const el = $('tabla');
    $('tabla-sub').textContent = datos.length > 50 ? `primeras 50 de ${fmtNum(datos.length)} secciones` : `${fmtNum(datos.length)} secciones`;
    if (!datos.length) { el.innerHTML = '<p class="el-empty">Sin datos</p>'; return; }
    const lugar = elElec.value === 'diputacion_local' || elElec.value === 'diputacion_federal' ? 'Distrito' : 'Municipio';
    const thead = `<thead><tr><th>Sección</th><th>${lugar}</th><th>Lista nominal</th><th>Votos</th><th>Part.</th><th>1er lugar</th><th>Votos</th><th>2do lugar</th><th>Votos</th><th>3er lugar</th><th>Votos</th></tr></thead>`;
    const grupos = st.tablaVista === 'coalicion' ? Object.entries(gruposCoalicion(cols)).filter(([, c]) => c.length > 1) : null;
    const indiv = cols.partidos.filter((p) => !esCoalicion(p));
    const filas = datos.slice(0, 50).map((r) => {
      const part = parseNum(r[cols.participacion]);
      const top3 = grupos
        ? grupos.map(([key, columnas]) => [key, columnas.reduce((s, c) => s + parseNum(r[c]), 0)])
        : indiv.map((p) => [p, parseNum(r[p])]);
      const t = top3.filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 3);
      const celdas = [0, 1, 2].map((i) => (t[i] ? `<td>${badge(t[i][0])}</td><td>${fmtNum(t[i][1])}</td>` : '<td>—</td><td>—</td>')).join('');
      return `<tr><td>${esc(r[cols.seccion])}</td><td>${esc(titleCase(r[cols.municipio]))}</td>
        <td>${fmtNum(parseNum(r[cols.listaNominal]))}</td><td>${fmtNum(parseNum(r[cols.votosEmitidos]))}</td>
        <td>${(part <= 1 ? part * 100 : part).toFixed(1)}%</td>${celdas}</tr>`;
    }).join('');
    el.innerHTML = `<table class="el-table">${thead}<tbody>${filas}</tbody></table>`;
  }

  /* ---------- Eventos ---------- */
  function toggleOn(group, btn) {
    group.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === btn));
  }

  $('ms-municipio-btn').addEventListener('click', () => msToggle('municipio'));
  $('ms-seccion-btn').addEventListener('click', () => msToggle('seccion'));
  on(document, 'click', (e) => { if (!e.target.closest('.el-ms')) cerrarPaneles(); });
  on(document, 'keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!elModal.hidden) cerrarModal();
    else cerrarPaneles();
  });

  elEstado.addEventListener('change', cargarDatos);
  elAnio.addEventListener('change', () => { actualizarElecciones(); cargarDatos(); });
  elElec.addEventListener('change', cargarDatos);
  elVista.addEventListener('change', actualizarMapa);
  $('limpiar').addEventListener('click', () => {
    elEstado.value = 'Querétaro';
    elAnio.value = '2024';
    actualizarElecciones();
    st.selMun.clear();
    st.selSec.clear();
    cargarDatos();
  });

  $('barras-vista').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-v]');
    if (!b || !st.cols) return;
    st.barrasVista = b.dataset.v;
    toggleOn($('barras-vista'), b);
    renderBarras(getDatosFiltrados(), st.cols);
  });
  $('barras-modo').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-v]');
    if (!b || !st.cols) return;
    st.barrasModo = b.dataset.v;
    toggleOn($('barras-modo'), b);
    elTopN.hidden = st.barrasModo !== 'top';
    if (st.barrasModo === 'top') {
      st.barrasTop = +elTopN.value;
      renderBarras(getDatosFiltrados(), st.cols);
    } else {
      abrirModal();
    }
  });
  elTopN.addEventListener('change', () => {
    if (st.barrasModo !== 'top' || !st.cols) return;
    st.barrasTop = +elTopN.value;
    renderBarras(getDatosFiltrados(), st.cols);
  });
  $('tabla-vista').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-v]');
    if (!b || !st.cols) return;
    st.tablaVista = b.dataset.v;
    toggleOn($('tabla-vista'), b);
    renderTabla(getDatosFiltrados(), st.cols);
  });

  elModal.addEventListener('click', (e) => {
    if (e.target === elModal) { cerrarModal(); return; }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'close') cerrarModal();
    else if (act === 'all') { clavesBarras().forEach((k) => st.barrasSelTmp.add(k)); elChecks.querySelectorAll('input').forEach((cb) => { cb.checked = true; }); }
    else if (act === 'none') { st.barrasSelTmp.clear(); elChecks.querySelectorAll('input').forEach((cb) => { cb.checked = false; }); }
    else if (act === 'apply') {
      st.barrasSel = new Set(st.barrasSelTmp);
      cerrarModal();
      renderBarras(getDatosFiltrados(), st.cols);
    }
  });

  $('mapa-fs').addEventListener('click', () => {
    const panel = $('mapa-panel');
    if (document.fullscreenElement) document.exitFullscreen();
    else panel.requestFullscreen?.();
  });
  on(document, 'fullscreenchange', () => {
    if (window.Plotly && elMapa.data) window.Plotly.Plots.resize(elMapa);
  });

  // Redibuja lo que depende del tema (mapa base, colores de canvas y Plotly).
  on(window, 'mirador:theme', () => {
    if (!st.cols) return;
    const datos = getDatosFiltrados();
    renderBarras(datos, st.cols);
    renderHistorico();
    actualizarMapa();
  });
  let rz = 0;
  on(window, 'resize', () => {
    clearTimeout(rz);
    rz = setTimeout(() => { if (st.cols) renderBarras(getDatosFiltrados(), st.cols); }, 120);
  });

  /* ---------- Inicio ---------- */
  initEstados();
  actualizarElecciones();
  cargarDatos();

  return () => {
    alive = false;
    clearTimeout(rz);
    limpiezas.forEach((fn) => fn());
    document.body.classList.remove('el-wide');
    if (document.fullscreenElement && root.contains(document.fullscreenElement)) document.exitFullscreen().catch(() => {});
    if (window.Plotly) [elMapa, elHist].forEach((el) => { try { window.Plotly.purge(el); } catch { /* sin gráfica */ } });
  };
}
