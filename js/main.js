// ============================================================
// main.js — Arranque de la SPA: datos, rutas y navegación.
// ============================================================

import { store, indexEstados } from './store.js';
import { construirEstados, resumenNacional, fechaAgregado } from './data.js';
import { loadGeoJSON } from './map.js';
import { loadPadron } from './padron.js';
import { route, setNotFound, startRouter, currentTop } from './router.js';
import * as general from './views/general.js';
import * as predicciones from './views/predicciones.js';
import * as dominio from './views/dominio.js';
import * as estado from './views/estado.js';
import * as encuestas from './views/encuestas.js';

const app = document.getElementById('app');

/* ---------- Tema claro / oscuro (persistente en localStorage) ---------- */
const THEME_KEY = 'mirador-theme';

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const icon = document.getElementById('themeIcon');
  const text = document.getElementById('themeText');
  const dark = theme === 'dark';
  if (icon) icon.textContent = dark ? '☀️' : '🌙';
  if (text) text.textContent = dark ? 'Claro' : 'Oscuro';
}

function initTheme() {
  let theme = 'light';
  try { theme = localStorage.getItem(THEME_KEY) || 'light'; } catch { /* sin persistencia */ }
  applyTheme(theme);
  const btn = document.getElementById('themeToggle');
  btn.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try { localStorage.setItem(THEME_KEY, next); } catch { /* sin persistencia */ }
  });
}

initTheme();

function after() {
  window.scrollTo({ top: 0, behavior: 'auto' });
  syncNav();
}

/** Monta una vista simple (sin parámetros). */
function view(fn) {
  return () => { app.innerHTML = ''; fn(app); after(); };
}
/** Monta una vista con un parámetro nombrado. */
function viewP(fn, key) {
  return (params) => { app.innerHTML = ''; fn(app, params[key]); after(); };
}

function syncNav() {
  const top = currentTop();
  document.querySelectorAll('.nav a[data-top]').forEach((a) => a.classList.toggle('on', a.dataset.top === top));
}

const MESES_LABEL = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];

function formatearFechaAgregado(fechaISO) {
  if (!fechaISO) return '';
  const [anio, mes, dia] = fechaISO.split('-').map(Number);
  if (!anio || !mes || !dia) return '';
  return `${dia} ${MESES_LABEL[mes - 1]} ${anio}`;
}

function fatal(msg) {
  app.innerHTML = `<section class="empty">
    <h2>No se pudo iniciar el visualizador</h2><p>${msg}</p>
    <p class="hint">Sirve el proyecto con un servidor local:<br><code>python serve.py</code>
      y abre <code>http://localhost:8000</code></p></section>`;
}

async function boot() {
  try {
    await loadGeoJSON();
    store.padronData = await loadPadron();
    if (!store.padronData?.estados) throw new Error('Padrón no disponible');
    store.estados = await construirEstados(store.padronData);
  } catch (err) {
    fatal('No se pudieron cargar el mapa, la lista nominal o las encuestas. Ábrelo desde un servidor local, no con file://.');
    return;
  }

  indexEstados();
  store.resumen = resumenNacional(store.estados);
  store.updatedLabel = formatearFechaAgregado(fechaAgregado()) || 'sin fecha de corte';

  route('/general', view(general.render));
  route('/predicciones', view(predicciones.render));
  route('/dominio', view(dominio.render));
  route('/encuestas', view(encuestas.render));
  route('/encuestas/:id', viewP(encuestas.renderDetail, 'id'));
  route('/estado/:slug', viewP(estado.render, 'slug'));
  setNotFound(view(general.render));

  startRouter();
}

boot();
