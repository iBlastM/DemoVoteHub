// ============================================================
// theme.js — Preferencia de tema: sistema / claro / oscuro.
// Persiste la preferencia, resuelve "sistema" con prefers-color-scheme
// y emite el evento `mirador:theme` (detail: { pref, theme }) para que
// vistas como el mapa de dominio cambien sus teselas.
// ============================================================

const KEY = 'mirador-theme';
const ORDER = ['system', 'light', 'dark'];
const LABEL = { system: 'Sistema', light: 'Claro', dark: 'Oscuro' };
const media = window.matchMedia('(prefers-color-scheme: dark)');

let pref = 'system';
try { pref = localStorage.getItem(KEY) || 'system'; } catch { /* sin persistencia */ }
if (!ORDER.includes(pref)) pref = 'system';

/** Tema efectivo ('light' | 'dark'). */
export function resolvedTheme() {
  return pref === 'system' ? (media.matches ? 'dark' : 'light') : pref;
}
export function themePref() { return pref; }
export function themeLabel(p = pref) { return LABEL[p]; }

function apply() {
  const theme = resolvedTheme();
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.themePref = pref;
  window.dispatchEvent(new CustomEvent('mirador:theme', { detail: { pref, theme } }));
}

export function setThemePref(next) {
  pref = ORDER.includes(next) ? next : 'system';
  try { localStorage.setItem(KEY, pref); } catch { /* sin persistencia */ }
  apply();
}

/** Avanza sistema → claro → oscuro → sistema. */
export function cycleTheme() {
  setThemePref(ORDER[(ORDER.indexOf(pref) + 1) % ORDER.length]);
}

media.addEventListener('change', () => { if (pref === 'system') apply(); });

/** Iconos SVG (trazo 1.6, 20×20) para cada preferencia. */
export const THEME_ICONS = {
  system: '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="2.5" y="3.5" width="15" height="10" rx="1.5"/><path d="M7 17h6M10 13.5V17"/></svg>',
  light: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="3.4"/><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.3 4.3l1.4 1.4M14.3 14.3l1.4 1.4M4.3 15.7l1.4-1.4M14.3 5.7l1.4-1.4"/></svg>',
  dark: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M16.5 12.3A6.8 6.8 0 0 1 7.7 3.5a6.8 6.8 0 1 0 8.8 8.8Z"/></svg>',
};

apply();
