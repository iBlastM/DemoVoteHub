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
  padronData: null,    // padrón/lista nominal INE agregados por entidad y municipio
  updatedLabel: '',    // fecha real del corte de encuestas (data/agregado.csv)
  mapMetric: 'prob',   // 'prob' (probabilidad) | 'margen'
  mapMode: 'estados',  // 'estados' | 'municipios' (CP)
};

export function indexEstados() {
  store.porSlug = Object.fromEntries(store.estados.map((e) => [e.slug, e]));
}
