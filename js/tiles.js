// ============================================================
// tiles.js — Basemap de teselas OpenStreetMap (Web Mercator)
// bajo la capa de datos. La transformación afín del viewport
// coincide con la del SVG (mismas coordenadas Mercator), por lo
// que teselas y polígonos quedan alineados en todo momento.
// ============================================================

const TILE = 256;
const MIN_Z = 3, MAX_Z = 12;
const cache = new Map();

function tileImg(url, onLoad) {
  let img = cache.get(url);
  if (!img) {
    img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = url;
    cache.set(url, img);
  }
  if (!img.complete && onLoad) img.addEventListener('load', onLoad, { once: true });
  return img;
}

/**
 * @param {HTMLCanvasElement} canvas lienzo absoluto bajo el SVG del mapa
 */
export function createTileLayer(canvas) {
  let vb = null;                                  // viewBox Mercator [x, y, w, h]
  let view = { scale: 1, tx: 0, ty: 0 };         // transformación de zoom/pan (px CSS)
  let raf = 0;

  const request = () => { if (!raf) raf = requestAnimationFrame(draw); };

  function draw() {
    raf = 0;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = canvas.clientWidth, H = canvas.clientHeight;
    if (!W || !H || !vb) return;
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // Ajuste del viewBox al lienzo (equivale al preserveAspectRatio del SVG).
    const s0 = Math.min(W / vb[2], H / vb[3]);
    const b0x = (W - vb[2] * s0) / 2 - vb[0] * s0;
    const b0y = (H - vb[3] * s0) / 2 - vb[1] * s0;
    // Composición con zoom/pan: screen = scale * (s0 * p + b0) + t
    const s = s0 * view.scale;
    const ox = view.scale * b0x + view.tx;
    const oy = view.scale * b0y + view.ty;

    // Nivel de zoom de teselas acorde a la escala en pantalla.
    const z = Math.max(MIN_Z, Math.min(MAX_Z, Math.round(Math.log2((s * 2 * Math.PI) / TILE))));
    const world = TILE * Math.pow(2, z);
    const k = world / (2 * Math.PI);            // px de tesela por radián
    const radPerTile = (2 * Math.PI) / Math.pow(2, z);

    // Rango de teselas visibles: nuestra coordenada -> espacio de tesela
    // X = k * (x + π), Y = k * (y + π)  (x=lngRad, y=-mercRad).
    const tx0 = Math.floor((k * (((0 - ox) / s) + Math.PI)) / TILE);
    const tx1 = Math.floor((k * (((W - ox) / s) + Math.PI)) / TILE);
    const ty0 = Math.floor((k * (((0 - oy) / s) + Math.PI)) / TILE);
    const ty1 = Math.floor((k * (((H - oy) / s) + Math.PI)) / TILE);
    const max = Math.pow(2, z);

    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        if (tx < 0 || ty < 0 || tx >= max || ty >= max) continue;
        const url = `https://tile.openstreetmap.org/${z}/${tx}/${ty}.png`;
        const img = tileImg(url, request);
        const x = s * (((tx * TILE) / k) - Math.PI) + ox;
        const y = s * (((ty * TILE) / k) - Math.PI) + oy;
        const size = s * radPerTile;
        if (img.complete && img.naturalWidth) ctx.drawImage(img, x, y, size + 0.5, size + 0.5);
      }
    }
  }

  return {
    setViewBox(list) { vb = list; request(); },
    update(state) { view = state; request(); },
    resize() { request(); },
  };
}
