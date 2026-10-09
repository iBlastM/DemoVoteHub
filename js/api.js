// ============================================================
// api.js — Cliente mínimo de la API de mirador-backend.
// ============================================================

import { API_BASE } from './config.js';

const _cache = new Map();

/** GET JSON con timeout; cachea por ruta durante la sesión. */
export function apiGet(path, { timeoutMs = 12000, fresh = false } = {}) {
  if (!fresh && _cache.has(path)) return _cache.get(path);
  const p = (async () => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(API_BASE + path, { signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(t);
    }
  })();
  p.catch(() => _cache.delete(path));
  _cache.set(path, p);
  return p;
}

export function apiUrl(path) { return API_BASE + path; }
