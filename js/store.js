// ============================================================
// store.js — Estado compartido de la aplicación.
// ============================================================

export const store = {
  geoData: null,       // GeoJSON de estados
  cpData: null,        // GeoJSON simplificado de códigos postales (legado)
  muniGeo: {},         // cache cve_ent -> GeoJSON municipal
  estados: [],         // dataset construido
  porSlug: {},         // índice slug -> estado
  resumen: null,       // resumen nacional
  mapMetric: 'prob',   // 'prob' (probabilidad) | 'margen'
  mapMode: 'estados',  // 'estados' | 'municipios' (CP)
};

export function indexEstados() {
  store.porSlug = Object.fromEntries(store.estados.map((e) => [e.slug, e]));
}
