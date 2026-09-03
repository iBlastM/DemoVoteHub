// ============================================================
// zoom.js — Controlador de zoom y paneo sobre un contenedor.
// Rueda para acercar hacia el cursor, arrastre para desplazar.
// El estado (scale, tx, ty) se entrega en píxeles CSS vía onApply.
// ============================================================

import { clamp } from './utils.js';

export function createZoom(host, { min = 1, max = 16, onApply } = {}) {
  let scale = 1, tx = 0, ty = 0, moved = false, settleT = null;

  function clampPan() {
    const w = host.clientWidth, h = host.clientHeight;
    if (scale <= 1) { tx = 0; ty = 0; return; }
    tx = clamp(tx, w * (1 - scale), 0);
    ty = clamp(ty, h * (1 - scale), 0);
  }

  function apply(settled) {
    clampPan();
    onApply({ scale, tx, ty }, settled);
    if (!settled) {
      clearTimeout(settleT);
      settleT = setTimeout(() => onApply({ scale, tx, ty }, true), 170);
    }
  }

  function zoomAt(cx, cy, ns) {
    ns = clamp(ns, min, max);
    if (ns === scale) return;
    tx = cx - (cx - tx) * (ns / scale);
    ty = cy - (cy - ty) * (ns / scale);
    scale = ns;
    apply(false);
  }

  host.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = host.getBoundingClientRect();
    const factor = Math.exp(-e.deltaY * 0.0016);
    zoomAt(e.clientX - r.left, e.clientY - r.top, scale * factor);
  }, { passive: false });

  // La captura de puntero se activa solo cuando comienza un arrastre real;
  // así un click simple conserva su objetivo (polígonos del mapa) y abre
  // los mismos popups que la lista lateral.
  let dragging = false, captured = false, lx = 0, ly = 0;
  host.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    dragging = true; captured = false; moved = false; lx = e.clientX; ly = e.clientY;
    host.classList.add('grabbing');
  });
  host.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - lx, dy = e.clientY - ly;
    if (Math.abs(dx) + Math.abs(dy) > 3) {
      moved = true;
      if (!captured) {
        captured = true;
        try { host.setPointerCapture(e.pointerId); } catch (_) {}
      }
    }
    lx = e.clientX; ly = e.clientY;
    if (scale > 1) { tx += dx; ty += dy; apply(false); }
  });
  const end = (e) => {
    if (!dragging) return;
    dragging = false; captured = false; host.classList.remove('grabbing');
    try { host.releasePointerCapture(e.pointerId); } catch (_) {}
  };
  host.addEventListener('pointerup', end);
  host.addEventListener('pointercancel', end);
  host.addEventListener('dblclick', (e) => {
    const r = host.getBoundingClientRect();
    zoomAt(e.clientX - r.left, e.clientY - r.top, scale * 1.8);
  });

  return {
    reset() { scale = 1; tx = 0; ty = 0; moved = false; apply(true); },
    zoomBy(f) { const r = host.getBoundingClientRect(); zoomAt(r.width / 2, r.height / 2, scale * f); },
    wasDrag() { return moved; },
    get scale() { return scale; },
  };
}
