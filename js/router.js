// ============================================================
// router.js — Router hash minimalista para la SPA.
// ============================================================

const routes = [];
let notFound = null;

/** Registra una ruta: patrón como '/estado/:slug'. */
export function route(pattern, handler) {
  const keys = [];
  const rx = new RegExp(
    '^' + pattern.replace(/:[^/]+/g, (m) => { keys.push(m.slice(1)); return '([^/]+)'; }) + '$'
  );
  routes.push({ rx, keys, handler });
}

export function setNotFound(fn) { notFound = fn; }

export function navigate(path) {
  if (location.hash !== '#' + path) location.hash = path;
  else resolve();
}

function resolve() {
  const path = location.hash.replace(/^#/, '') || '/general';
  for (const r of routes) {
    const m = path.match(r.rx);
    if (m) {
      const params = {};
      r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
      r.handler(params, path);
      return;
    }
  }
  if (notFound) notFound(path);
}

export function startRouter() {
  window.addEventListener('hashchange', resolve);
  resolve();
}

export function currentTop() {
  const path = location.hash.replace(/^#/, '') || '/general';
  return '/' + (path.split('/')[1] || 'general');
}
