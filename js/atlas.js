// ============================================================
// atlas.js — Motor de mapa en <canvas> para el Mapa de dominio.
//
// · Vista Web Mercator continua (centro en coordenadas de mundo 0–1, zoom z).
// · Teselas CARTO en dos capas: base sin etiquetas (debajo de los datos)
//   y solo etiquetas (encima), con tema claro/oscuro.
// · Polígonos como Path2D en coordenadas de mundo con niveles de detalle
//   (decimación radial por zoom) y descarte por caja envolvente.
// · Picking geométrico (punto en polígono, regla par-impar).
// · Perspectiva: el plano del mapa se inclina con CSS 3D; la proyección
//   inversa pantalla → plano se resuelve analíticamente.
// · Picos 3D en espacio de pantalla, flyTo, inercia, pinza táctil,
//   rueda suave, doble clic, teclado y selección por recuadro.
// ============================================================

const TILE = 256;
const MIN_Z = 3.4;
const MAX_Z = 13.5;
const TILT_DEG = 42;
// Zoom de referencia de cada nivel de detalle: uno por zoom entero, para que
// la tolerancia en pantalla quede siempre entre 0.35 y 0.7 px.
const LEVEL_Z = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const MAX_TILES = 700;

/* ---------- Proyección ---------- */
export function lngLatToWorld(lng, lat) {
  const s = Math.sin((Math.max(-85, Math.min(85, lat)) * Math.PI) / 180);
  return [(lng + 180) / 360, 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)];
}

/** GeoJSON (Polygon / MultiPolygon) → polígonos en coordenadas de mundo. */
export function toWorldGeometry(geometry) {
  const src = geometry.type === 'Polygon' ? [geometry.coordinates]
    : geometry.type === 'MultiPolygon' ? geometry.coordinates : [];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const polys = src.map((poly) => poly.map((ring) => {
    const a = new Float64Array(ring.length * 2);
    for (let i = 0; i < ring.length; i++) {
      const [x, y] = lngLatToWorld(ring[i][0], ring[i][1]);
      a[i * 2] = x; a[i * 2 + 1] = y;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    return a;
  }));
  return { polys, bbox: [x0, y0, x1, y1], label: labelPoint(polys, [x0, y0, x1, y1]) };
}

/** Centroide del anillo exterior más grande (punto de etiqueta / pico). */
function labelPoint(polys, bbox) {
  let best = null, bestA = 0;
  for (const rings of polys) {
    const r = rings[0];
    let a = 0, cx = 0, cy = 0;
    for (let i = 0, n = r.length / 2, j = n - 1; i < n; j = i++) {
      const f = r[j * 2] * r[i * 2 + 1] - r[i * 2] * r[j * 2 + 1];
      a += f; cx += (r[j * 2] + r[i * 2]) * f; cy += (r[j * 2 + 1] + r[i * 2 + 1]) * f;
    }
    if (Math.abs(a) > bestA) { bestA = Math.abs(a); best = [cx / (3 * a), cy / (3 * a)]; }
  }
  return best || [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2];
}

export function pointInGeometry(geom, x, y) {
  const b = geom.bbox;
  if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) return false;
  let inside = false;
  for (const rings of geom.polys) for (const r of rings) {
    for (let i = 0, n = r.length / 2, j = n - 1; i < n; j = i++) {
      const yi = r[i * 2 + 1], yj = r[j * 2 + 1];
      if ((yi > y) !== (yj > y) && x < ((r[j * 2] - r[i * 2]) * (y - yi)) / (yj - yi) + r[i * 2]) inside = !inside;
    }
  }
  return inside;
}

export function unionBBox(list) {
  const out = [Infinity, Infinity, -Infinity, -Infinity];
  for (const b of list) {
    if (b[0] < out[0]) out[0] = b[0]; if (b[1] < out[1]) out[1] = b[1];
    if (b[2] > out[2]) out[2] = b[2]; if (b[3] > out[3]) out[3] = b[3];
  }
  return out;
}

/* ---------- Niveles de detalle ---------- */
/** Douglas–Peucker iterativo: conserva los vértices que se desvían más de
 *  `tol` de la línea simplificada. Con tolerancia de 0.35 px en pantalla el
 *  contorno es indistinguible del original y usa ~40 % menos vértices que
 *  una decimación por distancia de 0.7 px. */
function decimate(r, tol) {
  const n = r.length / 2;
  if (!tol || n <= 4) return r;
  const out = decimateLine(r, tol);
  if (out.length >= 8) return out;
  // Anillo diminuto a este zoom: se conservan 4 vértices repartidos para
  // que no desaparezca (evita huecos en municipios pequeños).
  const q = [];
  for (let k = 0; k < 4; k++) { const i = Math.floor((k * (n - 1)) / 4); q.push(r[i * 2], r[i * 2 + 1]); }
  return q;
}

/** Douglas–Peucker sobre una polilínea (los extremos siempre se conservan). */
function decimateLine(r, tol) {
  const n = r.length / 2;
  if (!tol || n <= 2) return r;
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const t2 = tol * tol;
  const stack = [0, n - 1];
  while (stack.length) {
    const b = stack.pop(), a = stack.pop();
    const ax = r[a * 2], ay = r[a * 2 + 1];
    const dx = r[b * 2] - ax, dy = r[b * 2 + 1] - ay, L = dx * dx + dy * dy;
    let md = 0, mi = -1;
    for (let i = a + 1; i < b; i++) {
      const px = r[i * 2] - ax, py = r[i * 2 + 1] - ay;
      let d;
      if (L > 0) {
        const t = Math.max(0, Math.min(1, (px * dx + py * dy) / L));
        const qx = px - t * dx, qy = py - t * dy;
        d = qx * qx + qy * qy;
      } else d = px * px + py * py;
      if (d > md) { md = d; mi = i; }
    }
    if (md > t2 && mi > 0) { keep[mi] = 1; stack.push(a, mi, mi, b); }
  }
  let count = 0;
  for (let i = 0; i < n; i++) count += keep[i];
  const out = new Float64Array(count * 2);
  for (let i = 0, j = 0; i < n; i++) if (keep[i]) { out[j++] = r[i * 2]; out[j++] = r[i * 2 + 1]; }
  return out;
}

function buildPath(geom, level) {
  const tol = level < LEVEL_Z.length ? 0.35 / (TILE * 2 ** LEVEL_Z[level]) : 0;
  const p = new Path2D();
  for (const rings of geom.polys) for (const ring of rings) {
    const r = decimate(ring, tol);
    p.moveTo(r[0], r[1]);
    for (let i = 2; i < r.length; i += 2) p.lineTo(r[i], r[i + 1]);
    p.closePath();
  }
  return p;
}

function pathOf(item, level) {
  const cache = item._paths || (item._paths = []);
  return cache[level] || (cache[level] = buildPath(item.geom, level));
}

/** Path2D combinado de varios elementos (una entidad): un solo trazo en
 *  lugar de decenas o cientos. Se cachea por nivel de detalle. */
function groupPathOf(group, level, key = 'all', filter = null) {
  const cache = group._paths || (group._paths = {});
  const slot = cache[key] || (cache[key] = []);
  if (!slot[level]) {
    const p = new Path2D();
    for (const it of group.list) if (!filter || filter(it)) p.addPath(pathOf(it, level));
    slot[level] = p;
  }
  return slot[level];
}

/* ---------- Topología por grupo ----------
   Las geometrías municipales comparten vértices exactos en sus fronteras.
   Se extraen las aristas una sola vez: las que aparecen en un solo polígono
   forman el borde exterior de la entidad y el resto son fronteras internas.
   Así cada frontera se traza una vez (no dos, una por municipio vecino) y el
   borde estatal recorre solo el perímetro, no todos los anillos. */
const topoCache = new WeakMap();

function chainsOf(edges, xs, ys) {
  const adj = new Map();
  edges.forEach(([a, b], e) => {
    (adj.get(a) || adj.set(a, []).get(a)).push(e);
    (adj.get(b) || adj.set(b, []).get(b)).push(e);
  });
  const used = new Uint8Array(edges.length);
  const out = [];
  const walk = (start, e0) => {
    const pts = [xs[start], ys[start]];
    let v = start, e = e0;
    while (e !== -1) {
      used[e] = 1;
      const [a, b] = edges[e];
      v = a === v ? b : a;
      pts.push(xs[v], ys[v]);
      const list = adj.get(v);
      e = -1;
      if (list.length === 2) for (const f of list) if (!used[f]) { e = f; break; }
    }
    return Float64Array.from(pts);
  };
  for (const [v, list] of adj) if (list.length !== 2) for (const e of list) if (!used[e]) out.push(walk(v, e));
  for (let e = 0; e < edges.length; e++) if (!used[e]) out.push(walk(edges[e][0], e));
  return out;
}

function topologyOf(group) {
  const hit = topoReady(group);
  if (hit) return hit;
  const head = group.list[0];
  const vid = new Map(), xs = [], ys = [];
  const id = (x, y) => {
    const k = x + ',' + y;
    let v = vid.get(k);
    if (v === undefined) { v = xs.length; vid.set(k, v); xs.push(x); ys.push(y); }
    return v;
  };
  const count = new Map(), pair = new Map();
  const add = (a, b) => {
    if (a === b) return;
    const k = a < b ? a * 1e7 + b : b * 1e7 + a;
    const c = count.get(k);
    if (c === undefined) { count.set(k, 1); pair.set(k, a < b ? [a, b] : [b, a]); } else count.set(k, c + 1);
  };
  for (const it of group.list) for (const rings of it.geom.polys) for (const r of rings) {
    const n = r.length / 2;
    const first = id(r[0], r[1]);
    let prev = first;
    for (let i = 1; i < n; i++) { const cur = id(r[i * 2], r[i * 2 + 1]); add(prev, cur); prev = cur; }
    add(prev, first);
  }
  const ext = [], all = [];
  for (const [k, c] of count) { const e = pair.get(k); all.push(e); if (c === 1) ext.push(e); }
  const t = { n: group.list.length, ext: chainsOf(ext, xs, ys), all: chainsOf(all, xs, ys), paths: { ext: [], all: [] } };
  topoCache.set(head, t);
  return t;
}

/** Topología ya construida del grupo (o null). */
function topoReady(group) {
  const t = topoCache.get(group.list[0]);
  return t && t.n === group.list.length ? t : null;
}

/** Path2D de las cadenas topológicas de un grupo ('ext' | 'all') por nivel. */
function topoPathOf(group, level, kind) {
  const t = topologyOf(group);
  const slot = t.paths[kind];
  if (!slot[level]) {
    const tol = level < LEVEL_Z.length ? 0.35 / (TILE * 2 ** LEVEL_Z[level]) : 0;
    const p = new Path2D();
    for (const chain of t[kind]) {
      const c = chain.length > 8 ? decimateLine(chain, tol) : chain;
      p.moveTo(c[0], c[1]);
      for (let i = 2; i < c.length; i += 2) p.lineTo(c[i], c[i + 1]);
    }
    slot[level] = p;
  }
  return slot[level];
}

function levelFor(z) {
  for (let i = 0; i < LEVEL_Z.length; i++) if (LEVEL_Z[i] >= z) return i;
  return LEVEL_Z.length;
}

/* ---------- Teselas ---------- */
// Esri World Light/Dark Gray Canvas: base sin etiquetas + capa de referencia
// (solo etiquetas). Sin clave de API; atribución obligatoria en la vista.
const tileCache = new Map();
function tileUrl(style, z, x, y) {
  return `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/${style}/MapServer/tile/${z}/${y}/${x}`;
}
function getTile(url, onLoad) {
  let t = tileCache.get(url);
  if (t) { tileCache.delete(url); tileCache.set(url, t); return t; }   // LRU
  const img = new Image();
  t = { img, ok: false };
  img.decoding = 'async';
  // Se decodifica fuera del hilo principal antes de marcarla lista: así el
  // primer drawImage no bloquea el cuadro decodificando JPEG/PNG.
  img.onload = () => {
    const done = () => { t.ok = true; onLoad(); };
    if (img.decode) img.decode().then(done, done); else done();
  };
  img.onerror = () => { t.failed = true; };
  img.src = url;
  tileCache.set(url, t);
  if (tileCache.size > MAX_TILES) tileCache.delete(tileCache.keys().next().value);
  return t;
}

const THEMES = {
  light: {
    base: 'World_Light_Gray_Base', labels: 'World_Light_Gray_Reference',
    outline: 'rgba(24,28,36,.5)', outlineStrong: 'rgba(24,28,36,.85)',
    border: '#7b8089', borderStrong: '#262a32',
    sep: 'rgba(255,255,255,.62)', sepGroup: 'rgba(255,255,255,.86)', dim: 'rgba(12,14,20,.52)', select: '#ffffff',
  },
  dark: {
    base: 'World_Dark_Gray_Base', labels: 'World_Dark_Gray_Reference',
    outline: 'rgba(230,236,245,.36)', outlineStrong: 'rgba(240,244,250,.8)',
    border: '#686e79', borderStrong: '#d6dbe3',
    sep: 'rgba(8,10,14,.5)', sepGroup: 'rgba(8,10,14,.75)', dim: 'rgba(0,0,0,.6)', select: '#ffffff',
  },
};

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/**
 * @param {HTMLElement} host contenedor (position:relative) que recibe los eventos
 * @param {Object} opts { onHover(item, p), onClick(item, info), onBox(items, mode), onView(), padding() }
 */
export function createAtlas(host, opts = {}) {
  host.classList.add('atlas-viewport');
  host.tabIndex = 0;
  host.innerHTML = `
    <div class="atlas-plane">
      <canvas class="atlas-c atlas-base"></canvas>
      <canvas class="atlas-c atlas-data"></canvas>
      <canvas class="atlas-c atlas-labels"></canvas>
      <canvas class="atlas-c atlas-fx"></canvas>
    </div>
    <canvas class="atlas-spikes"></canvas>
    <div class="atlas-box" hidden></div>`;
  const plane = host.querySelector('.atlas-plane');
  const cBase = host.querySelector('.atlas-base');
  const cData = host.querySelector('.atlas-data');
  const cLabels = host.querySelector('.atlas-labels');
  const cFx = host.querySelector('.atlas-fx');
  const cSpikes = host.querySelector('.atlas-spikes');
  const boxEl = host.querySelector('.atlas-box');

  // Estado de vista
  let cx = 0.27, cy = 0.43, z = 5;
  let tilt = 0, tiltOn = false, P = 1000;
  let Vw = 1, Vh = 1, W = 1, H = 1, oX = 0, oY = 0, dpr = 1, spDpr = 1;
  let theme = THEMES.light, themeName = 'light';
  let limits = null;                            // [x0,y0,x1,y1] para acotar el centro

  // Contenido
  let items = [];                               // capa coloreada (orden de dibujo)
  let groups = [];                              // items agrupados por entidad
  let outlines = [];                            // contornos estatales
  let outlineGroup = { list: [] };
  let selection = new Set();
  let hoverItem = null;
  let showOutlines = false;
  let spikes = null;                            // fn(item) -> { h:0–1, color } | null

  const dirty = { tiles: true, data: true, fx: true, spikes: true };
  let viewMoved = false;                        // la vista cambió sin cambiar el contenido
  let raf = 0;
  let fly = null, zoomAnim = null, inertia = null, tiltAnim = null;

  // Capa de datos con margen: se pinta una vez más grande que el plano y,
  // mientras la vista se mueve, se reubica con una transformación CSS (GPU)
  // en lugar de volver a trazar cientos de miles de vértices por cuadro.
  // Se vuelve a pintar al detenerse, al salir del margen o al cambiar mucho
  // el zoom, de modo que en reposo la imagen es idéntica a un pintado directo.
  let M = 0, dprD = 1;                          // margen (px CSS) y densidad de la capa
  let rv = null;                                // vista con la que se pintó: { z, cx, cy }
  let lastRender = 0, settleTimer = 0;
  const DATA_BUDGET = 9e6;                      // píxeles de dispositivo máx. de la capa

  const request = () => { if (!raf) raf = requestAnimationFrame(frame); };
  const markAll = () => { dirty.tiles = dirty.data = dirty.fx = dirty.spikes = true; request(); };
  /** Cambio de vista (paneo / zoom): no invalida el contenido de la capa de datos. */
  const markView = () => { dirty.tiles = dirty.fx = dirty.spikes = true; viewMoved = true; request(); };

  /* ---------- Geometría de pantalla ---------- */
  const S = () => TILE * 2 ** z;
  const rad = () => (tilt * Math.PI) / 180;

  /** Pantalla (px relativos al host) → desplazamiento de mundo respecto al centro. */
  function screenToOffset(px, py) {
    const X = px - Vw / 2, Y = py - Vh / 2;
    const a = rad(), sa = Math.sin(a), ca = Math.cos(a);
    const den = ca + (Y * sa) / P;
    if (den <= 0.04) return null;                    // por encima del horizonte
    const v = Y / den;
    const u = X * (1 - (v * sa) / P);
    const s = S();
    return [u / s, v / s];
  }
  function unproject(px, py) {
    const o = screenToOffset(px, py);
    if (!o) return null;
    const u = o[0] * S(), v = o[1] * S();
    if (u < -oX || u > W - oX || v < -oY || v > H - oY) return null;  // fuera del plano
    return [cx + o[0], cy + o[1]];
  }
  /** Mundo → pantalla, con factor de escala de perspectiva. */
  function project(wx, wy) {
    const s = S();
    const u = (wx - cx) * s, v = (wy - cy) * s;
    const a = rad();
    const w = 1 - (v * Math.sin(a)) / P;
    return [Vw / 2 + u / w, Vh / 2 + (v * Math.cos(a)) / w, 1 / w];
  }
  function planeWorldBounds() {
    const s = S();
    return [cx - oX / s, cy - oY / s, cx + (W - oX) / s, cy + (H - oY) / s];
  }
  const overlaps = (b, v) => !(b[2] < v[0] || b[0] > v[2] || b[3] < v[1] || b[1] > v[3]);

  /* ---------- Layout ---------- */
  function layout() {
    Vw = Math.max(1, host.clientWidth); Vh = Math.max(1, host.clientHeight);
    P = Math.max(700, Vh * 1.15);
    const over = tiltOn || tilt > 0;
    W = Math.round(over ? Vw * 1.5 : Vw);
    const top = Math.round(over ? Vh * 0.8 : Vh / 2);
    const bottom = Math.round(over ? Vh * 0.55 : Vh / 2);
    H = top + bottom; oX = W / 2; oY = top;
    const dev = Math.min(window.devicePixelRatio || 1, 2);
    dpr = Math.min(dev, Math.sqrt(5.2e6 / (W * H)));
    spDpr = dev;
    Object.assign(plane.style, {
      width: `${W}px`, height: `${H}px`, left: `${(Vw - W) / 2}px`, top: `${Vh / 2 - top}px`,
      transformOrigin: `${oX}px ${oY}px`,
    });
    for (const c of [cBase, cLabels, cFx]) {
      c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
      c.style.width = `${W}px`; c.style.height = `${H}px`;
    }
    // Margen de la capa de datos: se prioriza conservar la densidad de píxeles
    // del resto de capas y se recorta el margen hasta caber en el presupuesto.
    let m = Math.round(Math.max(W, H) * 0.3);
    while (m > 96 && (W + 2 * m) * (H + 2 * m) * dpr * dpr > DATA_BUDGET) m = Math.round(m * 0.85);
    M = m;
    dprD = Math.min(dpr, Math.sqrt(DATA_BUDGET / ((W + 2 * M) * (H + 2 * M))));
    cData.width = Math.round((W + 2 * M) * dprD); cData.height = Math.round((H + 2 * M) * dprD);
    Object.assign(cData.style, { width: `${W + 2 * M}px`, height: `${H + 2 * M}px`, left: `${-M}px`, top: `${-M}px`, transformOrigin: '0 0', transform: '' });
    rv = null;
    cSpikes.width = Math.round(Vw * spDpr); cSpikes.height = Math.round(Vh * spDpr);
    cSpikes.style.width = `${Vw}px`; cSpikes.style.height = `${Vh}px`;
    applyTiltCss();
    markAll();
  }
  function applyTiltCss() {
    plane.style.transform = tilt > 0 ? `perspective(${P}px) rotateX(${tilt}deg)` : '';
    host.classList.toggle('is-tilted', tilt > 0);
  }

  function worldTransform(ctx) {
    const s = S() * dpr;
    ctx.setTransform(s, 0, 0, s, dpr * oX - cx * s, dpr * oY - cy * s);
  }

  /* ---------- Dibujo ---------- */
  function drawTiles(canvas, style, fallback = true) {
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const tz = Math.max(0, Math.min(18, Math.round(z)));
    const n = 2 ** tz;
    const vb = planeWorldBounds();
    const x0 = Math.max(0, Math.floor(vb[0] * n)), x1 = Math.min(n - 1, Math.floor(vb[2] * n));
    const y0 = Math.max(0, Math.floor(vb[1] * n)), y1 = Math.min(n - 1, Math.floor(vb[3] * n));
    const s = S() * dpr;
    const size = s / n;
    ctx.imageSmoothingQuality = 'high';
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      const dx = (tx / n - cx) * s + dpr * oX, dy = (ty / n - cy) * s + dpr * oY;
      const t = getTile(tileUrl(style, tz, tx, ty), onTileLoad);
      if (t.ok) { ctx.drawImage(t.img, dx, dy, size + 0.6, size + 0.6); continue; }
      if (!fallback) continue;            // etiquetas: mejor ausentes que borrosas
      // Respaldo: el ancestro cargado más cercano, recortado.
      for (let d = 1; d <= 5 && tz - d >= 0; d++) {
        const k = 2 ** d;
        const at = tileCache.get(tileUrl(style, tz - d, tx >> d, ty >> d));
        if (at && at.ok) {
          const sw = at.img.naturalWidth / k;
          ctx.drawImage(at.img, (tx - (tx >> d) * k) * sw, (ty - (ty >> d) * k) * sw, sw, sw, dx, dy, size + 0.6, size + 0.6);
          break;
        }
      }
    }
  }
  let tileTimer = 0;
  function onTileLoad() {
    if (tileTimer) return;
    tileTimer = setTimeout(() => { tileTimer = 0; dirty.tiles = true; request(); }, 40);
  }

  /** Pinta la capa de datos completa para la vista actual (con margen). */
  function renderData() {
    lastRender = performance.now();
    const ctx = cData.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cData.width, cData.height);
    const Sv = S(), s = Sv * dprD;
    ctx.setTransform(s, 0, 0, s, dprD * (oX + M) - cx * s, dprD * (oY + M) - cy * s);
    const vb = [cx - (oX + M) / Sv, cy - (oY + M) / Sv, cx + (W - oX + M) / Sv, cy + (H - oY + M) / Sv];
    drawData(ctx, cData.width, cData.height, vb);
    cData.style.transform = '';
    rv = { z, cx, cy };
    schedulePrebuild(levelFor(z));
  }

  /* Los Path2D de cada nivel de detalle se construyen la primera vez que se
     usan (decimación + trazado: 10–20 ms para todo el mapa). Para que un zoom
     no tropiece con ese costo, tras cada pintado se preparan en tiempo ocioso
     los niveles vecinos, en lotes pequeños que no bloquean la interacción. */
  let prebuildHandle = 0;
  const idle = window.requestIdleCallback || ((fn) => setTimeout(() => fn({ timeRemaining: () => 8 }), 60));
  const cancelIdle = window.cancelIdleCallback || clearTimeout;
  function schedulePrebuild(lvl) {
    if (prebuildHandle) cancelIdle(prebuildHandle);
    // 1) topología de cada entidad (una por lote: ≤ ~50 ms la más grande);
    // 2) Path2D del nivel actual y de los vecinos.
    const topo = groups.filter((g) => g.border && !topoReady(g));
    const queue = [];
    for (const l of [lvl, lvl + 1, lvl - 1, lvl + 2]) if (l >= 0 && l <= LEVEL_Z.length) queue.push(l);
    let li = 0, gi = 0, ii = 0;
    const step = (deadline) => {
      prebuildHandle = 0;
      while (topo.length && deadline.timeRemaining() > 4) topologyOf(topo.shift());
      while (!topo.length && li < queue.length && deadline.timeRemaining() > 2) {
        const l = queue[li], g = groups[gi];
        if (!g) { li++; gi = 0; ii = 0; continue; }
        if (ii < g.list.length) { pathOf(g.list[ii++], l); continue; }
        if (g.border && topoReady(g)) { topoPathOf(g, l, 'ext'); topoPathOf(g, l, 'all'); }
        gi++; ii = 0;
      }
      if (topo.length || li < queue.length) prebuildHandle = idle(step);
    };
    prebuildHandle = idle(step);
  }

  /** Reubica la capa ya pintada para la vista actual. Devuelve false si ya no
   *  cubre el plano o si el cambio de escala degradaría la nitidez. */
  function placeData() {
    if (!rv) return false;
    const k = 2 ** (z - rv.z);
    if (k < 0.7 || k > 1.42) return false;
    const Sv = S();
    const tx = oX + M - k * (oX + M) + (rv.cx - cx) * Sv;
    const ty = oY + M - k * (oY + M) + (rv.cy - cy) * Sv;
    const left = -M + tx, top = -M + ty;
    if (left > 0.5 || top > 0.5 || left + k * (W + 2 * M) < W - 0.5 || top + k * (H + 2 * M) < H - 0.5) return false;
    cData.style.transform = `translate(${tx}px, ${ty}px) scale(${k})`;
    return true;
  }

  /** Tras detenerse la vista, repinta para recuperar la nitidez exacta. */
  function scheduleSettle() {
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      settleTimer = 0;
      if (gesture || fly || zoomAnim || inertia || tiltAnim) { scheduleSettle(); return; }
      if (rv && (rv.z !== z || rv.cx !== cx || rv.cy !== cy)) { dirty.data = true; request(); }
    }, 140);
  }

  /** Dibuja la capa de datos en `ctx` (transformación de mundo ya aplicada),
   *  limitada a la caja de mundo `vb`. `cw`/`ch`: tamaño del lienzo destino. */
  function drawData(ctx, cw, ch, vb) {
    const lvl = levelFor(z);
    const px = 1 / S();
    const visibleIn = (it) => it.fill && overlaps(it.geom.bbox, vb);
    const strong = showOutlines;
    // Biselado en líneas finas: a 0.5–1.8 px es indistinguible del redondeado
    // y le cuesta al rasterizador bastante menos por vértice.
    ctx.lineJoin = strong ? 'round' : 'bevel';

    // 1) Contornos aproximados (estados sin geometría municipal). Van debajo
    //    de los rellenos y se desvanecen al acercar: su trazo es burdo y, a
    //    zoom alto, el mapa base ya dibuja esas fronteras con precisión.
    const coarseAlpha = Math.max(0, Math.min(1, (7 - z) / 1.2));
    if (coarseAlpha > 0 && outlineGroup.list.length) {
      ctx.globalAlpha = coarseAlpha;
      ctx.lineWidth = px * (strong ? 1.7 : 0.9);
      ctx.strokeStyle = strong ? theme.outlineStrong : theme.outline;
      ctx.stroke(groupPathOf(outlineGroup, lvl, 'coarse', (o) => !o.covered));
      ctx.globalAlpha = 1;
    }

    // 2) Rellenos por grupo (entidad). En los grupos con `border`, el grupo
    //    se traza ANTES de rellenarse: los rellenos tapan la mitad interior
    //    del trazo y solo sobrevive la mitad exterior, que coincide
    //    exactamente con el borde de la geometría municipal (sin huecos).
    const borderW = px * (strong ? 3.4 : 1.8);
    const borderC = strong ? theme.borderStrong : theme.border;
    const live = [];
    for (const g of groups) {
      if (!overlaps(g.bbox, vb)) continue;
      live.push(g);
      if (g.border) {
        ctx.lineWidth = borderW; ctx.strokeStyle = borderC;
        // Solo el perímetro de la entidad; mientras la topología se construye
        // (tiempo ocioso) se usa la unión de anillos, con el mismo resultado.
        ctx.stroke(topoReady(g) ? topoPathOf(g, lvl, 'ext') : groupPathOf(g, lvl));
      }
      for (const it of g.list) if (visibleIn(it)) { ctx.fillStyle = it.fill; ctx.fill(pathOf(it, lvl), 'evenodd'); }
    }

    if (showOutlines || z >= 7.2) {
      // Un trazo por grupo y cada frontera una sola vez: las aristas
      // compartidas ya no se pintan dos veces, así que se usa la opacidad
      // equivalente a la doble pasada.
      ctx.lineWidth = px * (showOutlines ? 0.8 : 0.5);
      ctx.strokeStyle = theme.sepGroup;
      for (const g of live) {
        if (g.list[0].separator === false) continue;
        ctx.stroke(topoReady(g) ? topoPathOf(g, lvl, 'all') : groupPathOf(g, lvl, 'sep', (it) => it.separator !== false));
      }
    }

    if (selection.size) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = theme.dim;
      ctx.fillRect(0, 0, cw, ch);
      ctx.restore();
      const sel = [];
      for (const g of live) for (const it of g.list) if (selection.has(it.id) && visibleIn(it)) sel.push(it);
      const selPath = selectionPath(lvl);
      ctx.lineWidth = borderW; ctx.strokeStyle = borderC;
      if (selPath.border) ctx.stroke(selPath.border);
      for (const it of sel) { ctx.fillStyle = it.fill; ctx.fill(pathOf(it, lvl), 'evenodd'); }
      ctx.lineWidth = px * 0.6; ctx.strokeStyle = theme.sepGroup;
      ctx.stroke(selPath.all);
      // Solo el contorno exterior de selecciones pequeñas; en selecciones
      // grandes el contraste con el velo ya delimita el área.
      if (selection.size <= 24) {
        ctx.lineWidth = px * 1.4; ctx.strokeStyle = 'rgba(255,255,255,.85)';
        for (const it of sel) ctx.stroke(pathOf(it, lvl));
      }
    }
  }

  /** Path2D combinados de la selección actual, cacheados por nivel. Las
   *  entidades seleccionadas completas usan su topología (perímetro y
   *  fronteras únicas); el resto, los anillos de cada municipio. */
  let selCache = { set: null, paths: [] };
  function selectionPath(lvl) {
    if (selCache.set !== selection) selCache = { set: selection, paths: [] };
    if (!selCache.paths[lvl]) {
      const all = new Path2D(), border = new Path2D();
      let hasBorder = false;
      for (const g of groups) {
        let n = 0;
        for (const it of g.list) if (selection.has(it.id)) n++;
        if (!n) continue;
        if (n === g.list.length && g.border && topoReady(g)) {
          all.addPath(topoPathOf(g, lvl, 'all'));
          border.addPath(topoPathOf(g, lvl, 'ext'));
          hasBorder = true;
          continue;
        }
        for (const it of g.list) {
          if (!selection.has(it.id)) continue;
          const p = pathOf(it, lvl);
          all.addPath(p);
          if (it.border) { border.addPath(p); hasBorder = true; }
        }
      }
      selCache.paths[lvl] = { all, border: hasBorder ? border : null };
    }
    return selCache.paths[lvl];
  }

  /** Agrupa elementos consecutivos por `group` (orden de dibujo intacto). */
  function buildGroups() {
    groups = [];
    let cur = null;
    for (const it of items) {
      const key = it.group ?? it.id;
      if (!cur || cur.key !== key) {
        cur = { key, list: [], border: !!it.border, bbox: [Infinity, Infinity, -Infinity, -Infinity] };
        groups.push(cur);
      }
      cur.list.push(it);
      const b = it.geom.bbox, gb = cur.bbox;
      if (b[0] < gb[0]) gb[0] = b[0]; if (b[1] < gb[1]) gb[1] = b[1];
      if (b[2] > gb[2]) gb[2] = b[2]; if (b[3] > gb[3]) gb[3] = b[3];
    }
  }

  // Las capas de resalte y de picos solo se limpian si tienen algo dibujado:
  // en un paneo sin hover ni picos no se tocan los lienzos en cada cuadro.
  let fxDrawn = true, spikesDrawn = true;
  function drawFx() {
    if (!hoverItem && !fxDrawn) return;
    const ctx = cFx.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cFx.width, cFx.height);
    fxDrawn = !!hoverItem;
    if (!hoverItem) return;
    worldTransform(ctx);
    const p = pathOf(hoverItem, levelFor(z));
    const px = 1 / S();
    ctx.lineJoin = 'round';
    ctx.lineWidth = px * 3.2; ctx.strokeStyle = 'rgba(8,10,14,.7)'; ctx.stroke(p);
    ctx.lineWidth = px * 1.6; ctx.strokeStyle = '#ffffff'; ctx.stroke(p);
  }

  function drawSpikes() {
    if (!spikes && !spikesDrawn) return;
    const ctx = cSpikes.getContext('2d');
    ctx.setTransform(spDpr, 0, 0, spDpr, 0, 0);
    ctx.clearRect(0, 0, Vw, Vh);
    spikesDrawn = !!spikes;
    if (!spikes) return;
    const k = 150 * 2 ** ((z - 5) * 0.42) * Math.min(1, Vh / 820);
    const list = [];
    for (const it of items) {
      if (!it.fill || it.spike === false) continue;
      const sp = spikes(it);
      if (!sp || !(sp.h > 0)) continue;
      const [sx, sy, f] = project(it.geom.label[0], it.geom.label[1]);
      if (sx < -40 || sx > Vw + 40 || sy < -20 || sy > Vh + 400) continue;
      if (tilt > 0 && !screenToOffset(sx, sy)) continue;
      list.push({ sx, sy, f, h: sp.h * k * f, color: sp.color, dim: selection.size && !selection.has(it.id) });
    }
    list.sort((a, b) => a.sy - b.sy);
    ctx.lineJoin = 'round';
    for (const s of list) {
      const bw = Math.max(1.6, 3.6 * s.f * Math.min(1.6, 2 ** ((z - 5) * 0.25)));
      ctx.globalAlpha = s.dim ? 0.18 : 1;
      ctx.beginPath();
      ctx.moveTo(s.sx - bw, s.sy); ctx.lineTo(s.sx, s.sy - s.h); ctx.lineTo(s.sx + bw, s.sy); ctx.closePath();
      ctx.fillStyle = s.color; ctx.fill();
      ctx.lineWidth = 0.8; ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.stroke();
      // Cara iluminada: media pirámide más clara para leer el volumen.
      ctx.beginPath();
      ctx.moveTo(s.sx - bw, s.sy); ctx.lineTo(s.sx, s.sy - s.h); ctx.lineTo(s.sx, s.sy); ctx.closePath();
      ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- Bucle ---------- */
  let lastT = 0;
  function frame(t) {
    raf = 0;
    const dt = lastT ? Math.min(64, t - lastT) : 16;
    lastT = t;
    let moving = false;

    if (fly) {
      const k = Math.min(1, (t - fly.t0) / fly.dur);
      const e = ease(k);
      z = fly.z0 + (fly.z1 - fly.z0) * e - fly.arc * Math.sin(Math.PI * k);
      cx = fly.c0[0] + (fly.c1[0] - fly.c0[0]) * e;
      cy = fly.c0[1] + (fly.c1[1] - fly.c0[1]) * e;
      if (k >= 1) fly = null;
      moving = true;
    }
    if (zoomAnim) {
      const diff = zoomAnim.target - z;
      z = Math.abs(diff) < 0.003 ? zoomAnim.target : z + diff * Math.min(1, dt / 70);
      const o = screenToOffset(zoomAnim.ax, zoomAnim.ay);
      if (o) { cx = zoomAnim.wx - o[0]; cy = zoomAnim.wy - o[1]; }
      if (z === zoomAnim.target) zoomAnim = null;
      moving = true;
    }
    if (inertia) {
      const decay = Math.exp(-dt / 260);
      const dx = inertia.vx * dt, dy = inertia.vy * dt;
      panByScreen(dx, dy);
      inertia.vx *= decay; inertia.vy *= decay;
      if (Math.hypot(inertia.vx, inertia.vy) < 0.015) inertia = null;
      moving = true;
    }
    if (tiltAnim) {
      const k = Math.min(1, (t - tiltAnim.t0) / tiltAnim.dur);
      tilt = tiltAnim.from + (tiltAnim.to - tiltAnim.from) * ease(k);
      applyTiltCss();
      if (k >= 1) { tiltAnim = null; if (!tiltOn) { tilt = 0; layout(); } }
      dirty.spikes = true;
      moving = true;
    }
    if (moving) { clampView(); dirty.tiles = dirty.fx = dirty.spikes = true; viewMoved = true; }

    if (dirty.tiles) { drawTiles(cBase, theme.base); drawTiles(cLabels, theme.labels, false); dirty.tiles = false; }
    if (dirty.data) { renderData(); dirty.data = false; viewMoved = false; }
    else if (viewMoved) {
      viewMoved = false;
      // Durante un zoom continuo se repinta como mucho cada ~120 ms; el resto
      // de cuadros solo reubica la capa ya pintada.
      const zooming = !!(fly || zoomAnim);
      if (!placeData() || (zooming && rv && rv.z !== z && performance.now() - lastRender > 120 && Math.abs(z - rv.z) > 0.25)) renderData();
      scheduleSettle();
    }
    if (dirty.fx) { drawFx(); dirty.fx = false; }
    if (dirty.spikes) { drawSpikes(); dirty.spikes = false; }

    if (moving) opts.onView?.();
    if (fly || zoomAnim || inertia || tiltAnim) request(); else lastT = 0;
  }

  function clampView() {
    z = Math.max(MIN_Z, Math.min(MAX_Z, z));
    if (limits) {
      cx = Math.max(limits[0], Math.min(limits[2], cx));
      cy = Math.max(limits[1], Math.min(limits[3], cy));
    }
  }
  function panByScreen(dx, dy) {
    const a = screenToOffset(Vw / 2, Vh / 2), b = screenToOffset(Vw / 2 + dx, Vh / 2 + dy);
    if (!a || !b) return;
    cx -= b[0] - a[0]; cy -= b[1] - a[1];
  }
  function stopAnims() { fly = null; zoomAnim = null; inertia = null; }

  function zoomAround(ax, ay, target) {
    const o = screenToOffset(ax, ay) || [0, 0];
    zoomAnim = { target: Math.max(MIN_Z, Math.min(MAX_Z, target)), ax, ay, wx: cx + o[0], wy: cy + o[1] };
    request();
  }

  /* ---------- Picking ---------- */
  function pickAt(px, py) {
    const w = unproject(px, py);
    if (!w) return null;
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      if (it.pickable === false) continue;
      if (pointInGeometry(it.geom, w[0], w[1])) return it;
    }
    return null;
  }

  /* ---------- Eventos ---------- */
  const pointers = new Map();
  let gesture = null;
  let hoverRaf = 0, hoverPt = null;
  const local = (e) => { const r = host.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

  function onDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    host.focus({ preventScroll: true });
    stopAnims();
    const p = local(e);
    pointers.set(e.pointerId, p);
    try { host.setPointerCapture(e.pointerId); } catch { /* sin captura */ }
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const o = screenToOffset(mx, my);
      gesture = { type: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, z0: z, wx: o ? cx + o[0] : cx, wy: o ? cy + o[1] : cy };
      return;
    }
    if (pointers.size > 2) return;
    if (e.pointerType === 'mouse' && (e.shiftKey || e.ctrlKey || e.metaKey) && opts.onBox) {
      gesture = { type: 'box', mode: e.shiftKey ? 'add' : 'remove', x0: p.x, y0: p.y, x1: p.x, y1: p.y, shift: e.shiftKey, moved: false };
      return;
    }
    const o = screenToOffset(p.x, p.y);
    gesture = { type: 'pan', x0: p.x, y0: p.y, moved: false, wx: o ? cx + o[0] : cx, wy: o ? cy + o[1] : cy, samples: [{ x: p.x, y: p.y, t: performance.now() }], shift: e.shiftKey };
  }

  function onMove(e) {
    const p = local(e);
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, p);
    if (!gesture) {
      if (e.pointerType !== 'touch') scheduleHover(p);
      return;
    }
    if (gesture.type === 'pinch' && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      z = Math.max(MIN_Z, Math.min(MAX_Z, gesture.z0 + Math.log2(d / gesture.d0)));
      const o = screenToOffset((a.x + b.x) / 2, (a.y + b.y) / 2);
      if (o) { cx = gesture.wx - o[0]; cy = gesture.wy - o[1]; }
      clampView(); markView(); opts.onView?.();
      return;
    }
    if (gesture.type === 'box') {
      gesture.x1 = p.x; gesture.y1 = p.y;
      if (Math.abs(p.x - gesture.x0) + Math.abs(p.y - gesture.y0) > 4) gesture.moved = true;
      const x = Math.min(gesture.x0, p.x), y = Math.min(gesture.y0, p.y);
      Object.assign(boxEl.style, { left: `${x}px`, top: `${y}px`, width: `${Math.abs(p.x - gesture.x0)}px`, height: `${Math.abs(p.y - gesture.y0)}px` });
      boxEl.dataset.mode = gesture.mode;
      boxEl.hidden = !gesture.moved;
      return;
    }
    if (gesture.type === 'pan') {
      if (!gesture.moved && Math.abs(p.x - gesture.x0) + Math.abs(p.y - gesture.y0) > 4) {
        gesture.moved = true; host.classList.add('is-grabbing');
        setHover(null); opts.onHover?.(null);
      }
      if (!gesture.moved) return;
      const o = screenToOffset(p.x, p.y);
      if (o) { cx = gesture.wx - o[0]; cy = gesture.wy - o[1]; }
      const now = performance.now();
      gesture.samples.push({ x: p.x, y: p.y, t: now });
      while (gesture.samples.length > 2 && now - gesture.samples[0].t > 90) gesture.samples.shift();
      clampView(); markView(); opts.onView?.();
    }
  }

  function onUp(e) {
    const p = local(e);
    pointers.delete(e.pointerId);
    try { host.releasePointerCapture(e.pointerId); } catch { /* ya liberado */ }
    const g = gesture;
    if (!g) return;
    if (g.type === 'pinch') { if (pointers.size === 0) gesture = null; return; }
    gesture = null;
    host.classList.remove('is-grabbing');
    if (g.type === 'box') {
      boxEl.hidden = true;
      if (!g.moved) { opts.onClick?.(pickAt(p.x, p.y), { shift: g.shift, remove: g.mode === 'remove', x: p.x, y: p.y }); return; }
      const x0 = Math.min(g.x0, g.x1), x1 = Math.max(g.x0, g.x1), y0 = Math.min(g.y0, g.y1), y1 = Math.max(g.y0, g.y1);
      const hit = items.filter((it) => {
        if (it.pickable === false || it.selectable === false) return false;
        const [sx, sy] = project(it.geom.label[0], it.geom.label[1]);
        return sx >= x0 && sx <= x1 && sy >= y0 && sy <= y1;
      });
      opts.onBox?.(hit, g.mode);
      return;
    }
    if (!g.moved) {
      if (e.type === 'pointerup') opts.onClick?.(pickAt(p.x, p.y), { shift: g.shift || e.shiftKey, x: p.x, y: p.y });
      return;
    }
    const s = g.samples;
    if (s.length >= 2) {
      const a = s[0], b = s[s.length - 1];
      const dt = Math.max(1, b.t - a.t);
      if (performance.now() - b.t < 60) {
        // velocidad en px/ms en el sentido del arrastre (el contenido sigue al dedo)
        inertia = { vx: (b.x - a.x) / dt, vy: (b.y - a.y) / dt };
        if (Math.hypot(inertia.vx, inertia.vy) < 0.2) inertia = null; else request();
      }
    }
  }

  function scheduleHover(p) {
    hoverPt = p;
    if (hoverRaf) return;
    hoverRaf = requestAnimationFrame(() => {
      hoverRaf = 0;
      if (!hoverPt || gesture) return;
      const it = pickAt(hoverPt.x, hoverPt.y);
      setHover(it);
      opts.onHover?.(it, hoverPt);
    });
  }
  function setHover(it) {
    if (it === hoverItem) return;
    hoverItem = it;
    host.classList.toggle('is-pointing', !!(it && it.pickable !== false));
    dirty.fx = true; request();
  }

  function onWheel(e) {
    e.preventDefault();
    const p = local(e);
    const unit = e.deltaMode === 1 ? 32 : e.deltaMode === 2 ? Vh : 1;
    const dz = -(e.deltaY * unit) * (e.ctrlKey ? 0.01 : 0.0024);
    fly = null; inertia = null;
    const base = zoomAnim ? zoomAnim.target : z;
    zoomAround(p.x, p.y, base + Math.max(-1, Math.min(1, dz)));
  }
  function onDbl(e) {
    e.preventDefault();
    const p = local(e);
    zoomAround(p.x, p.y, z + (e.shiftKey ? -1 : 1));
  }
  function onKey(e) {
    if (e.target !== host) return;
    const step = 90;
    const map = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (map[e.key]) {
      e.preventDefault(); stopAnims();
      inertia = { vx: map[e.key][0] / 160, vy: map[e.key][1] / 160 }; request();
    } else if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomAround(Vw / 2, Vh / 2, z + 1); }
    else if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomAround(Vw / 2, Vh / 2, z - 1); }
  }
  function onLeave() {
    hoverPt = null;
    if (!gesture) { setHover(null); opts.onHover?.(null); }
  }

  host.addEventListener('pointerdown', onDown);
  host.addEventListener('pointermove', onMove);
  host.addEventListener('pointerup', onUp);
  host.addEventListener('pointercancel', onUp);
  host.addEventListener('pointerleave', onLeave);
  host.addEventListener('wheel', onWheel, { passive: false });
  host.addEventListener('dblclick', onDbl);
  host.addEventListener('keydown', onKey);
  host.addEventListener('contextmenu', (e) => { if (gesture?.type === 'box') e.preventDefault(); });

  const ro = new ResizeObserver(() => layout());
  ro.observe(host);
  layout();

  /* ---------- Encuadre ---------- */
  function viewFor(bbox, { maxZoom = 11, pad = 36 } = {}) {
    const p = opts.padding ? opts.padding() : { top: 0, right: 0, bottom: 0, left: 0 };
    const aw = Math.max(80, Vw - p.left - p.right - pad * 2);
    const ah = Math.max(80, Vh - p.top - p.bottom - pad * 2);
    const bw = Math.max(1e-7, bbox[2] - bbox[0]), bh = Math.max(1e-7, bbox[3] - bbox[1]);
    const nz = Math.max(MIN_Z, Math.min(maxZoom, Math.log2(Math.min(aw / (bw * TILE), ah / (bh * TILE)))));
    const s = TILE * 2 ** nz;
    const offX = (p.left - p.right) / 2, offY = (p.top - p.bottom) / 2;
    return { c: [(bbox[0] + bbox[2]) / 2 - offX / s, (bbox[1] + bbox[3]) / 2 - offY / s], z: nz };
  }

  return {
    setItems(list) { items = list; buildGroups(); selCache = { set: null, paths: [] }; dirty.data = dirty.fx = dirty.spikes = true; request(); },
    setOutlines(list) { outlines = list; outlineGroup = { list }; dirty.data = true; request(); },
    restyle() { dirty.data = dirty.spikes = dirty.fx = true; request(); },
    setSelection(set) { selection = set; selCache = { set: null, paths: [] }; dirty.data = dirty.spikes = true; request(); },
    setOutlinesStrong(on) { showOutlines = on; dirty.data = true; request(); },
    setSpikes(fn) { spikes = fn; dirty.spikes = true; request(); },
    setTheme(name) { themeName = THEMES[name] ? name : 'light'; theme = THEMES[themeName]; markAll(); },
    setLimits(b) { limits = b; },
    setTilt(on) {
      if (on === tiltOn) return;
      tiltOn = on;
      if (on) layout();
      tiltAnim = { from: tilt, to: on ? TILT_DEG : 0, t0: performance.now(), dur: 650 };
      request();
    },
    get tilted() { return tiltOn; },
    fit(bbox, o = {}) {
      const v = viewFor(bbox, o);
      if (o.instant) { stopAnims(); cx = v.c[0]; cy = v.c[1]; z = v.z; clampView(); markAll(); opts.onView?.(); return; }
      this.flyTo(v.c, v.z, o.duration);
    },
    flyTo(c, nz, dur = 950) {
      stopAnims();
      const dist = Math.hypot(c[0] - cx, c[1] - cy) * S();
      const arc = Math.max(0, Math.min(1.6, Math.log2(Math.max(1, dist / Math.max(Vw, Vh))) * 0.7));
      fly = { c0: [cx, cy], z0: z, c1: c, z1: Math.max(MIN_Z, Math.min(MAX_Z, nz)), t0: performance.now(), dur: reduceMotion() ? 1 : dur, arc };
      request();
    },
    zoomBy(d) { zoomAround(Vw / 2, Vh / 2, (zoomAnim ? zoomAnim.target : z) + d); },
    project,
    hover: setHover,
    get zoom() { return z; },
    get size() { return { w: Vw, h: Vh }; },
    destroy() {
      ro.disconnect();
      cancelAnimationFrame(raf); cancelAnimationFrame(hoverRaf); clearTimeout(tileTimer); clearTimeout(settleTimer);
      raf = 0; items = []; outlines = [];
      if (prebuildHandle) cancelIdle(prebuildHandle);
    },
  };
}

function reduceMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
