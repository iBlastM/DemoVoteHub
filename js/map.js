// ============================================================
// map.js — Mapa SVG de México a partir del GeoJSON de estados.
// Colorea por fuerza líder; intensidad por probabilidad o margen;
// tramado (hatch) para gubernaturas que cambian de partido (flip).
// ============================================================

import { store } from './store.js';
import { PARTIES, SIN_ELECCION } from './config.js';
import { partyLogo } from './components.js';
import { slugify, clamp, svgEl, pct, signed } from './utils.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Carga el GeoJSON de estados una sola vez. */
export async function loadGeoJSON() {
  if (store.geoData) return;
  const res = await fetch('geojsons/estados-poligonos.geojson');
  if (!res.ok) throw new Error('GeoJSON no disponible');
  store.geoData = await res.json();
}

/* ---------- utilidades de color ---------- */
function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}
function mix(hexA, hexB, t) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/** Color de relleno de un estado según la métrica activa. */
export function fillFor(estado, metric) {
  if (!estado) return SIN_ELECCION;
  const party = PARTIES[estado.favorito];
  if (!party) return SIN_ELECCION;
  let strength;
  if (metric === 'margen') {
    strength = clamp(Math.abs(estado.margen) / 20, 0, 1);
  } else {
    strength = clamp((estado.probFav - 0.5) / 0.45, 0, 1);
  }
  // De color suave (contienda cerrada) a color pleno (contienda segura).
  return mix(party.colorSoft, party.color, 0.25 + 0.75 * strength);
}

/* ---------- conversión de geometría ---------- */
function ringToPath(ring) {
  return ring.map(([lng, lat], i) => `${i === 0 ? 'M' : 'L'}${lng},${-lat}`).join(' ') + 'Z';
}
function geometryToPaths(geometry) {
  const out = [];
  if (geometry.type === 'Polygon') out.push(ringToPath(geometry.coordinates[0]));
  else if (geometry.type === 'MultiPolygon')
    for (const poly of geometry.coordinates) out.push(ringToPath(poly[0]));
  return out;
}

/** Calcula el viewBox que encierra todo el GeoJSON (proyección lng, -lat). */
function computeViewBox() {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const f of store.geoData.features) {
    const g = f.geometry;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    for (const poly of polys)
      for (const [lng, lat] of poly[0]) {
        const x = lng, y = -lat;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
  }
  const pad = 0.6;
  return `${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`;
}

/**
 * Renderiza el mapa dentro de un <svg>.
 * @param {SVGElement} svg
 * @param {Object} opts { metric, onSelect, interactive }
 */
export function renderMap(svg, opts = {}) {
  const metric = opts.metric || store.mapMetric;
  svg.innerHTML = '';
  svg.setAttribute('viewBox', computeViewBox());
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

  // Defs: patrones de tramado por color de partido (para flips).
  const defs = svgEl('defs');
  for (const p of Object.values(PARTIES)) {
    const pat = svgEl('pattern', {
      id: `hatch-${p.id}`, width: 0.9, height: 0.9,
      patternTransform: 'rotate(45)', patternUnits: 'userSpaceOnUse',
    });
    pat.appendChild(svgEl('rect', { width: 0.9, height: 0.9, fill: p.color }));
    pat.appendChild(svgEl('rect', { width: 0.32, height: 0.9, fill: '#ffffff', opacity: 0.6 }));
    defs.appendChild(pat);
  }
  svg.appendChild(defs);

  const groups = [];
  for (const feature of store.geoData.features) {
    const geoName = feature.properties.nom_edo;
    const slug = slugify(geoName);
    const estado = store.porSlug[slug];
    const fill = estado ? (estado.flip ? `url(#hatch-${estado.favorito})` : fillFor(estado, metric)) : SIN_ELECCION;

    const g = svgEl('g', { class: 'estado' + (estado ? ' elegible' : ' no-elige') + (estado && estado.flip ? ' flip' : '') });
    g.dataset.slug = slug;
    for (const d of geometryToPaths(feature.geometry)) {
      // Los bordes que separan estados los controla el CSS (var(--map-border)),
      // de modo que el temido claro los muestra negros y el oscuro, claros.
      g.appendChild(svgEl('path', { d, fill }));
    }
    if (estado && opts.interactive !== false) {
      g.style.cursor = 'pointer';
      g.addEventListener('mouseenter', (ev) => showHover(svg, estado, ev));
      g.addEventListener('mousemove', (ev) => moveHover(svg, ev));
      g.addEventListener('mouseleave', () => hideHover(svg));
      g.addEventListener('click', () => opts.onSelect && opts.onSelect(slug));
      g.tabIndex = 0;
      g.addEventListener('keydown', (e) => {
        if ((e.key === 'Enter' || e.key === ' ') && opts.onSelect) { e.preventDefault(); opts.onSelect(slug); }
      });
    }
    svg.appendChild(g);
    groups.push(g);
  }
  return groups;
}

/* ---------- tarjeta flotante (hover) ---------- */
function hoverCard(svg) {
  const host = svg.closest('.map-stage') || svg.parentElement;
  let card = host.querySelector('.map-hover');
  if (!card) {
    card = document.createElement('div');
    card.className = 'map-hover';
    host.appendChild(card);
  }
  return card;
}
function showHover(svg, estado, ev) {
  const card = hoverCard(svg);
  const metricLine = store.mapMetric === 'margen'
    ? `margen <b>${signed(estado.margen)}</b>`
    : `prob. <b>${pct(estado.probFav)}</b>`;
  card.innerHTML = `
    <div class="mh-top"><span class="mh-name">${estado.nombre}</span>
      <span class="mh-status">${estado.estatus.label}</span></div>
    <div class="mh-party">${partyLogo(estado.favorito)}
      ${estado.flip ? '<span class="mh-flip">cambia</span>' : ''}</div>
    <div class="mh-metric">${metricLine}</div>`;
  card.classList.add('on');
  moveHover(svg, ev);
}
function moveHover(svg, ev) {
  const host = svg.closest('.map-stage') || svg.parentElement;
  const card = host.querySelector('.map-hover');
  if (!card) return;
  const r = host.getBoundingClientRect();
  let x = ev.clientX - r.left + 14;
  let y = ev.clientY - r.top + 14;
  x = clamp(x, 4, r.width - card.offsetWidth - 4);
  y = clamp(y, 4, r.height - card.offsetHeight - 4);
  card.style.transform = `translate(${x}px, ${y}px)`;
}
function hideHover(svg) {
  const host = svg.closest('.map-stage') || svg.parentElement;
  const card = host && host.querySelector('.map-hover');
  if (card) card.classList.remove('on');
}

/** Leyenda Gana / Cambia por fuerza (con logotipos). */
export function renderLegend(container, parties) {
  const list = parties || ['MORENA', 'PAN', 'PRI', 'MC'];
  let html = '';
  for (const id of list) {
    const p = PARTIES[id];
    if (!p) continue;
    html += `<div class="lg-item" title="${p.nombre}">
      ${partyLogo(id)}
      <span class="lg-sw" style="background:${p.color}" title="gana"></span>
      <span class="lg-sw lg-hatch" style="--c:${p.color}" title="cambia"></span>
    </div>`;
  }
  html += `<div class="lg-key"><span>■ gana</span><span class="lg-key-hatch">▨ cambia</span></div>`;
  container.innerHTML = html;
}



/* ============================================================
   MAPA FINO (códigos postales) — render en <canvas> con
   hit-testing por buffer de índice para hover/click.
   ============================================================ */

/** Carga el geojson simplificado de CP una sola vez. */
export async function loadCP() {
  if (store.cpData) return store.cpData;
  const res = await fetch('geojsons/cp-demo.geojson');
  if (!res.ok) throw new Error('cp-demo.geojson no disponible');
  store.cpData = await res.json();
  return store.cpData;
}

/** Relleno de un CP según su fuerza ganadora e intensidad s. */
function cpFill(win, s) {
  const p = PARTIES[win];
  if (!p) return '#cbd2da';
  return mix(p.colorSoft, p.color, 0.32 + 0.68 * clamp(s, 0, 1));
}

/** Límites proyectados (x=lng, y=-lat) de todo el país. */
function nationalBounds() {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const f of store.geoData.features) {
    const g = f.geometry;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    for (const poly of polys) for (const [lng, lat] of poly[0]) {
      const x = lng, y = -lat;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  return { minX, minY, maxX, maxY };
}

function tracePolys(ctx, geometry, project) {
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  for (const poly of polys) {
    const ring = poly[0];
    ctx.beginPath();
    for (let i = 0; i < ring.length; i++) {
      const [px, py] = project(ring[i][0], ring[i][1]);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }
}

/**
 * Renderiza el mapa fino de CP dentro de un contenedor (.map-stage).
 * @param {HTMLElement} host
 * @param {Object} opts { onSelect(edoSlug) }
 */
export function renderFineMap(host, opts = {}) {
  host.querySelectorAll('canvas').forEach((c) => c.remove());
  const view = opts.view || { scale: 1, tx: 0, ty: 0 };
  const rect = host.getBoundingClientRect();
  const cssW = Math.max(320, rect.width - 2);
  const cssH = Math.max(320, rect.height - 2);
  const dpr = Math.min(2, window.devicePixelRatio || 1);

  const canvas = document.createElement('canvas');
  canvas.className = 'fine-canvas';
  canvas.width = cssW * dpr; canvas.height = cssH * dpr;
  canvas.style.width = cssW + 'px'; canvas.style.height = cssH + 'px';
  host.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  // Buffer de índice (offscreen) para hit-testing.
  const idx = document.createElement('canvas');
  idx.width = canvas.width; idx.height = canvas.height;
  const ictx = idx.getContext('2d', { willReadFrequently: true });
  ictx.imageSmoothingEnabled = false;

  const b = nationalBounds();
  const bw = b.maxX - b.minX, bh = b.maxY - b.minY;
  const pad = 8 * dpr;
  const scale = Math.min((canvas.width - pad * 2) / bw, (canvas.height - pad * 2) / bh);
  const offX = (canvas.width - bw * scale) / 2;
  const offY = (canvas.height - bh * scale) / 2;
  const project = (lng, lat) => [offX + (lng - b.minX) * scale, offY + (-lat - b.minY) * scale];

  // Transformación de vista (zoom/pan) en píxeles de dispositivo.
  ctx.setTransform(view.scale, 0, 0, view.scale, view.tx, view.ty);
  ictx.setTransform(view.scale, 0, 0, view.scale, view.tx, view.ty);
  const lw = (px) => px / view.scale; // grosor de línea constante en pantalla

  // 1) Backdrop: todos los estados en neutro (contexto).
  ctx.save();
  ctx.fillStyle = '#dfe4ea'; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = lw(1 * dpr);
  for (const f of store.geoData.features) { tracePolys(ctx, f.geometry, project); ctx.fill(); ctx.stroke(); }
  ctx.restore();

  // 2) Polígonos de CP coloreados por fuerza ganadora.
  const feats = store.cpData.features;
  for (let i = 0; i < feats.length; i++) {
    const f = feats[i];
    ctx.fillStyle = cpFill(f.properties.w, f.properties.s);
    tracePolys(ctx, f.geometry, project);
    ctx.fill();
    // índice i+1 codificado en RGB
    const k = i + 1;
    ictx.fillStyle = `rgb(${(k >> 16) & 255},${(k >> 8) & 255},${k & 255})`;
    tracePolys(ictx, f.geometry, project);
    ictx.fill();
  }

  // 3) Contorno de estados por encima (define las fronteras).
  ctx.save();
  ctx.strokeStyle = 'rgba(20,22,26,.55)'; ctx.lineWidth = lw(1.1 * dpr);
  for (const f of store.geoData.features) { tracePolys(ctx, f.geometry, project); ctx.stroke(); }
  ctx.restore();

  // Hover / click.
  let hoverK = -1;
  const pick = (ev) => {
    const r = canvas.getBoundingClientRect();
    const x = Math.floor((ev.clientX - r.left) * (canvas.width / r.width));
    const y = Math.floor((ev.clientY - r.top) * (canvas.height / r.height));
    if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return null;
    const d = ictx.getImageData(x, y, 1, 1).data;
    const k = (d[0] << 16) | (d[1] << 8) | d[2];
    return k > 0 && k <= feats.length ? k : null;
  };
  canvas.addEventListener('mousemove', (ev) => {
    const k = pick(ev);
    if (k) { hoverK = k; showCPHover(host, feats[k - 1], ev); canvas.style.cursor = 'pointer'; }
    else { hoverK = -1; hideHover({ closest: () => host, parentElement: host }); canvas.style.cursor = 'default'; }
  });
  canvas.addEventListener('mouseleave', () => hideHover({ closest: () => host, parentElement: host }));
  canvas.addEventListener('click', (ev) => {
    const k = pick(ev);
    if (k && opts.onSelect) opts.onSelect(feats[k - 1].properties.edo);
  });
}

function showCPHover(host, feature, ev) {
  let card = host.querySelector('.map-hover');
  if (!card) { card = document.createElement('div'); card.className = 'map-hover'; host.appendChild(card); }
  const favorito = feature.properties.w;
  card.innerHTML = `
    <div class="mh-top"><span class="mh-name">CP ${feature.properties.cp}</span></div>
    <div class="mh-party">${PARTIES[favorito] ? partyLogo(favorito) : `<span class="chip">${favorito}</span>`}</div>
    <div class="mh-metric">${feature.properties.edo.replace(/-/g, ' ')}</div>`;
  card.classList.add('on');
  const r = host.getBoundingClientRect();
  let x = ev.clientX - r.left + 14, y = ev.clientY - r.top + 14;
  x = clamp(x, 4, r.width - card.offsetWidth - 4);
  y = clamp(y, 4, r.height - card.offsetHeight - 4);
  card.style.transform = `translate(${x}px, ${y}px)`;
}


/* ============================================================
   DRILL-DOWN MUNICIPAL — polígonos municipales por entidad.
   Los resultados electorales son una variación determinista de
   la proyección estatal ficticia, para conservar la naturaleza demo.
   ============================================================ */

const STATE_CVE_BY_SLUG = {
  'aguascalientes': '01', 'baja-california': '02', 'baja-california-sur': '03',
  'campeche': '04', 'colima': '06', 'chihuahua': '08', 'durango': '10',
  'guerrero': '12', 'michoacan-de-ocampo': '16', 'nayarit': '18',
  'nuevo-leon': '19', 'queretaro': '22', 'san-luis-potosi': '24',
  'sinaloa': '25', 'sonora': '26', 'tlaxcala': '29', 'zacatecas': '32',
};

/** Clave INEGI de entidad para un estado con elección en la demo. */
export function stateCve(estado) {
  return estado && STATE_CVE_BY_SLUG[estado.slug];
}

/** Carga y cachea el GeoJSON de municipios de la entidad seleccionada. */
export async function loadMunicipios(estado) {
  const cve = stateCve(estado);
  if (!cve) throw new Error('No hay municipios disponibles para este estado.');
  if (store.muniGeo && store.muniGeo[cve]) return store.muniGeo[cve];
  const res = await fetch(`geojsons/muni/${cve}.geojson`);
  if (!res.ok) throw new Error(`Municipios ${cve} no disponibles`);
  const data = await res.json();
  store.muniGeo = store.muniGeo || {};
  store.muniGeo[cve] = data;
  return data;
}

function unitFromKey(key, salt) {
  let hash = 2166136261;
  const text = `${key}:${salt}`;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 100000) / 100000;
}

/** Proyección municipal ficticia derivada de la proyección estatal. */
function municipalResult(feature, estado) {
  const key = feature.properties.cvegeo;
  const contenders = Object.entries(estado.voto)
    .filter(([party]) => PARTIES[party])
    .map(([party, share], index) => ({
      party,
      // Variación local estable entre recargas, en puntos porcentuales.
      score: share * 100 + (unitFromKey(key, index) - 0.5) * 16,
    }))
    .sort((a, b) => b.score - a.score);
  const winner = contenders[0];
  const runnerUp = contenders[1] || { score: 0 };
  const margin = Math.max(0, winner.score - runnerUp.score);
  return {
    cvegeo: key,
    name: feature.properties.name || `Municipio ${key}`,
    favorito: winner.party,
    margen: margin,
    probFav: clamp(0.5 + margin / 34, 0.5, 0.97),
  };
}

function isBackgroundGeometry(geometry, extentArea) {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return polygons.some((polygon) => {
    const ring = polygon[0];
    const xs = ring.map(([lng]) => lng);
    const ys = ring.map(([, lat]) => lat);
    return ((Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys))) >= extentArea * 0.35;
  });
}

function geometryToEvenOddPath(geometry) {
  const paths = [];
  if (geometry.type === 'Polygon') {
    for (const ring of geometry.coordinates) paths.push(ringToPath(ring));
  } else if (geometry.type === 'MultiPolygon') {
    for (const polygon of geometry.coordinates)
      for (const ring of polygon) paths.push(ringToPath(ring));
  }
  return paths.join(' ');
}

function municipalityRings(geometry) {
  if (geometry.type === 'Polygon') return [geometry.coordinates[0]];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.map((polygon) => polygon[0]);
  return [];
}

function municipalFill(resultado) {
  const party = PARTIES[resultado.favorito];
  // El color directo evita que algunos motores interpreten una interpolación
  // RGB aplicada a paths municipales como un relleno negro inválido.
  return party ? party.color : SIN_ELECCION;
}

/** Renderiza los municipios de una entidad y devuelve sus resultados. */
export function renderMunicipios(svg, estado, geoData, opts = {}) {
  const metric = opts.metric || store.mapMetric;
  const features = geoData.features || [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const feature of features) {
    const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
    for (const polygon of polygons) for (const [lng, lat] of polygon[0]) {
      minX = Math.min(minX, lng); maxX = Math.max(maxX, lng);
      minY = Math.min(minY, -lat); maxY = Math.max(maxY, -lat);
    }
  }
  const width = maxX - minX, height = maxY - minY;
  const extentArea = width * height;
  const padding = Math.max(width, height) * 0.05;
  const viewBox = `${minX - padding} ${minY - padding} ${width + padding * 2} ${height + padding * 2}`;
  svg.innerHTML = '';
  svg.setAttribute('viewBox', viewBox);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

  let selected = null;
  const results = [];
  for (const feature of features) {
    if (isBackgroundGeometry(feature.geometry, extentArea)) continue;
    const resultado = municipalResult(feature, estado);
    const fill = municipalFill(resultado, metric);
    results.push(resultado);
    const g = svgEl('g', { class: `municipio party-${resultado.favorito}`, fill });
    g.style.fill = fill;
    g.dataset.cvegeo = resultado.cvegeo;
    const d = geometryToEvenOddPath(feature.geometry);
    if (d) {
      const path = svgEl('path', { d, fill, 'fill-rule': 'evenodd', 'clip-rule': 'evenodd' });
      path.style.fill = fill;
      path.setAttribute('stroke', '#ffffff');
      path.setAttribute('stroke-width', 0.035);
      path.setAttribute('vector-effect', 'non-scaling-stroke');
      g.appendChild(path);
    }
    g.style.cursor = 'pointer';
    g.tabIndex = 0;
    g.setAttribute('role', 'button');
    g.setAttribute('aria-label', resultado.name);
    g.addEventListener('mouseenter', (ev) => showMunicipioHover(svg, resultado, estado, ev));
    g.addEventListener('mousemove', (ev) => moveHover(svg, ev));
    g.addEventListener('mouseleave', () => hideHover(svg));
    const select = () => {
      if (selected) selected.classList.remove('selected');
      g.classList.add('selected'); selected = g;
      if (opts.onSelect) opts.onSelect(resultado);
    };
    g.addEventListener('click', select);
    g.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(); }
    });
    svg.appendChild(g);
  }
  return {
    results,
    select(cvegeo) {
      const group = [...svg.querySelectorAll('.municipio')].find((item) => item.dataset.cvegeo === cvegeo);
      if (group) group.dispatchEvent(new MouseEvent('click'));
    },
  };
}

function showMunicipioHover(svg, municipio, estado, event) {
  const card = hoverCard(svg);
  const probability = pct(municipio.probFav);
  const margin = `+${municipio.margen.toFixed(1)} pp`;
  card.innerHTML = `<div class="mh-top"><span class="mh-name">${municipio.name}</span></div>
    <div class="mh-party">${partyLogo(municipio.favorito)}</div>
    <div class="mh-metric"><b>${probability}</b> probabilidad · <b>${margin}</b> margen</div>
    <div class="mh-sub">${estado.nombre}</div>`;
  card.classList.add('on');
  moveHover(svg, event);
}


/**
 * Renderiza municipios sobre canvas. Evita artefactos de composición de SVG
 * observados con geometrías municipales extensas en algunos navegadores.
 */
export function renderMunicipiosCanvas(host, estado, geoData, opts = {}) {
  host.querySelectorAll('.municipal-canvas').forEach((canvas) => canvas.remove());
  const features = geoData.features || [];
  const rect = host.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const canvas = document.createElement('canvas');
  canvas.className = 'municipal-canvas';
  canvas.width = Math.max(1, Math.round(rect.width * dpr));
  canvas.height = Math.max(1, Math.round(rect.height * dpr));
  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;
  host.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#eef1f5';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const feature of features) {
    const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
    for (const polygon of polygons) for (const [lng, lat] of polygon[0]) {
      minX = Math.min(minX, lng); maxX = Math.max(maxX, lng);
      minY = Math.min(minY, -lat); maxY = Math.max(maxY, -lat);
    }
  }
  const extentWidth = maxX - minX;
  const extentHeight = maxY - minY;
  const extentArea = extentWidth * extentHeight;
  const padding = Math.max(extentWidth, extentHeight) * 0.05;
  minX -= padding; maxX += padding; minY -= padding; maxY += padding;
  const mapArea = (maxX - minX) * (maxY - minY);
  const scale = Math.min(canvas.width / (maxX - minX), canvas.height / (maxY - minY));
  const offsetX = (canvas.width - (maxX - minX) * scale) / 2;
  const offsetY = (canvas.height - (maxY - minY) * scale) / 2;
  const project = (lng, lat) => [offsetX + (lng - minX) * scale, offsetY + (-lat - minY) * scale];

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const regions = [];
  const results = [];
  for (const feature of features) {
    const resultado = municipalResult(feature, estado);
    const path = new Path2D();
    const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
    for (const polygon of polygons) {
      const outerRing = polygon[0];
      const outerXs = outerRing.map(([lng]) => lng);
      const outerYs = outerRing.map(([, lat]) => lat);
      const outerArea = (Math.max(...outerXs) - Math.min(...outerXs)) * (Math.max(...outerYs) - Math.min(...outerYs));
      // Algunos archivos incluyen una geometría de cobertura estatal con
      // agujeros. No se puede dibujar sin su exterior: se omite completa.
      if (outerArea >= mapArea * 0.35) continue;
      for (const ring of polygon) {
        ring.forEach(([lng, lat], index) => {
          const [x, y] = project(lng, lat);
          if (index === 0) path.moveTo(x, y); else path.lineTo(x, y);
        });
        path.closePath();
      }
    }
    const fill = municipalFill(resultado);
    // Canvas conserva negro por defecto si recibe un color inválido; se parte
    // de un neutro seguro y solo se aplica una cadena hexadecimal válida.
    ctx.fillStyle = SIN_ELECCION;
    if (typeof fill === 'string' && /^#[0-9a-f]{6}$/i.test(fill)) ctx.fillStyle = fill;
    ctx.fill(path, 'evenodd');
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(0.6 * dpr, 0.8);
    ctx.stroke(path);
    results.push(resultado);
    regions.push({ path, resultado });
  }

  const pick = (event) => {
    const bounds = canvas.getBoundingClientRect();
    const x = (event.clientX - bounds.left) * (canvas.width / bounds.width);
    const y = (event.clientY - bounds.top) * (canvas.height / bounds.height);
    return regions.find((region) => ctx.isPointInPath(region.path, x, y));
  };
  canvas.addEventListener('click', (event) => {
    const region = pick(event);
    if (region && opts.onSelect) opts.onSelect(region.resultado);
  });
  canvas.addEventListener('mousemove', (event) => {
    const region = pick(event);
    canvas.style.cursor = region ? 'pointer' : 'grab';
    if (region) showCanvasMunicipioHover(host, estado, region.resultado, event);
    else hideCanvasMunicipioHover(host);
  });
  canvas.addEventListener('mouseleave', () => hideCanvasMunicipioHover(host));

  return {
    results,
    select(cvegeo) {
      const region = regions.find((item) => item.resultado.cvegeo === cvegeo);
      if (region && opts.onSelect) opts.onSelect(region.resultado);
    },
  };
}


/* ============================================================
   ÁREAS DE OPORTUNIDAD — mapa de calor con el voto real de 2021
   por municipio para el partido seleccionado.
   ============================================================ */

/**
 * Pinta los municipios como mapa de calor según la proporción de
 * voto 2021 del partido indicado (más intenso = mayor proporción).
 * @param {SVGElement} svg
 * @param {Object} geoData GeoJSON municipal
 * @param {Object} opts { partido, hist, onSelect(entry) }
 */
export function renderMunicipiosHist(svg, geoData, opts = {}) {
  const partido = opts.partido;
  const hist = opts.hist || {};
  const p = PARTIES[partido];
  const features = geoData.features || [];

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const feature of features) {
    const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
    for (const polygon of polygons) for (const [lng, lat] of polygon[0]) {
      minX = Math.min(minX, lng); maxX = Math.max(maxX, lng);
      minY = Math.min(minY, -lat); maxY = Math.max(maxY, -lat);
    }
  }
  const width = maxX - minX, height = maxY - minY;
  const extentArea = width * height;
  const padding = Math.max(width, height) * 0.05;
  svg.innerHTML = '';
  svg.setAttribute('viewBox', `${minX - padding} ${minY - padding} ${width + padding * 2} ${height + padding * 2}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

  const entries = [];
  for (const feature of features) {
    if (isBackgroundGeometry(feature.geometry, extentArea)) continue;
    const key = slugify(feature.properties.name || '');
    const m = hist[key];
    const votos = m ? (m.partidos[partido] || 0) : 0;
    const share = m && m.votos > 0 ? votos / m.votos : 0;
    entries.push({ feature, key, nombre: feature.properties.name || key, m, votos, share, partido });
  }
  const shares = entries.map((e) => e.share);
  const min = Math.min(...shares);
  const max = Math.max(...shares);

  let selected = null;
  for (const entry of entries) {
    const t = max > min ? 0.12 + 0.88 * ((entry.share - min) / (max - min)) : 0.5;
    const fill = mix(p.colorSoft, p.color, t);
    const g = svgEl('g', { class: 'municipio' });
    g.dataset.key = entry.key;
    const d = geometryToEvenOddPath(entry.feature.geometry);
    if (d) {
      const path = svgEl('path', { d, fill, 'fill-rule': 'evenodd', 'clip-rule': 'evenodd' });
      path.setAttribute('stroke', '#ffffff');
      path.setAttribute('stroke-width', 0.035);
      path.setAttribute('vector-effect', 'non-scaling-stroke');
      g.appendChild(path);
    }
    g.style.cursor = 'pointer';
    g.addEventListener('mouseenter', (ev) => showHistHover(svg, entry, ev));
    g.addEventListener('mousemove', (ev) => moveHover(svg, ev));
    g.addEventListener('mouseleave', () => hideHover(svg));
    const select = () => {
      if (selected) selected.classList.remove('selected');
      g.classList.add('selected'); selected = g;
      if (opts.onSelect) opts.onSelect(entry);
    };
    g.addEventListener('click', select);
    svg.appendChild(g);
  }
  return {
    entries,
    select(key) {
      const group = [...svg.querySelectorAll('.municipio')].find((item) => item.dataset.key === key);
      if (group) group.dispatchEvent(new MouseEvent('click'));
    },
  };
}

function showHistHover(svg, entry, ev) {
  const card = hoverCard(svg);
  const pctShare = (entry.share * 100).toFixed(1) + '%';
  card.innerHTML = `<div class="mh-top"><span class="mh-name">${entry.nombre}</span></div>
    <div class="mh-party">${partyLogo(entry.partido)}</div>
    <div class="mh-metric"><b>${pctShare}</b> del voto 2021 · <b>${entry.votos.toLocaleString('es-MX')}</b> votos</div>`;
  card.classList.add('on');
  moveHover(svg, ev);
}

function showCanvasMunicipioHover(host, estado, municipio, event) {
  let card = host.querySelector('.map-hover');
  if (!card) {
    card = document.createElement('div');
    card.className = 'map-hover';
    host.appendChild(card);
  }
  const party = PARTIES[municipio.favorito];
  const metricLine = store.mapMetric === 'margen'
    ? `margen <b>+${municipio.margen.toFixed(1)} pp</b>`
    : `prob. <b>${pct(municipio.probFav)}</b>`;
  card.innerHTML = `<div class="mh-top"><span class="mh-name">${municipio.name}</span></div>
    <div class="mh-party">${party ? partyLogo(municipio.favorito) : `<span class="chip">${municipio.favorito}</span>`}</div>
    <div class="mh-metric">${metricLine}</div>
    <div class="mh-metric">${estado.nombre}</div>`;
  card.classList.add('on');
  const bounds = host.getBoundingClientRect();
  let x = event.clientX - bounds.left + 14;
  let y = event.clientY - bounds.top + 14;
  x = clamp(x, 4, bounds.width - card.offsetWidth - 4);
  y = clamp(y, 4, bounds.height - card.offsetHeight - 4);
  card.style.transform = `translate(${x}px, ${y}px)`;
}

function hideCanvasMunicipioHover(host) {
  host.querySelector('.map-hover')?.classList.remove('on');
}
