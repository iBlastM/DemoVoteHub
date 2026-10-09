// ============================================================
// views/alcaldias.js — Preferencia para presidencia municipal 2027.
// Encuestas REALES por municipio de Rubrum ("Si el día de hoy fuera la
// elección para presidente municipal, ¿por cuál partido votaría?"),
// servidas por mirador-backend: GET /api/v1/alcaldias.
// Misma interacción que el Mapa de dominio; los municipios sin encuesta
// se dejan en gris (no se rellenan con datos inventados).
// ============================================================

import { store } from '../store.js';
import { apiGet } from '../api.js';
import { loadMunicipios } from '../map.js';
import { toWorldGeometry } from '../atlas.js';
import { statsMunicipio } from '../padron.js';
import {
  montarMapa, ENTIDADES, NEUTRAL, ramp, baseColor, partyName, shortParty, dot, pct1, fechaLarga, rankEntries,
  tipTable, syncRadios, partyChips, legendFor, escapeHTML, fmtNum, PARTY_ORDER, PARTIES, isParty, fuenteBox,
} from './atlas_comun.js';

const MARGIN_CAP = 30;
const ETIQUETA = { NO_DECIDE: 'Aún no decide', OTRO: 'Otros / locales' };

export function render(root) {
  let mode = 'margen', party = 'MORENA';
  let data = null, error = null;
  const encuestas = new Map();           // cvegeo → registro de /alcaldias
  const munisByCve = new Map();
  const stateItems = [];
  const estadosByCve = new Map(store.estados.map((e) => [e.cve, e]));

  const ctx = montarMapa(root, {
    aria: 'Mapa de preferencia para presidencia municipal',
    placeholder: 'Busca un municipio o estado…',
    covered: (cve) => estadosByCve.has(cve),
    layersHTML: `
      <div class="ax-modes" role="radiogroup" aria-label="Capa">
        <button type="button" role="radio" data-mode="margen">Margen</button>
        <button type="button" role="radio" data-mode="ganador">Ganador</button>
        <button type="button" role="radio" data-mode="partido">Partido</button>
        <button type="button" role="radio" data-mode="indecisos">Indecisos</button>
      </div>
      <div class="ax-sub" data-for="partido">
        <p class="ax-sub-h">Preferencia municipal por partido</p>
        <div class="ax-chips ax-chips-party" role="radiogroup" aria-label="Partido">${partyChips()}</div>
      </div>
      ${fuenteBox('<p>Solo se colorean los municipios con encuesta publicada por Rubrum. Es la preferencia para <b>presidencia municipal</b>, no para gubernatura.</p>', { clave: 'alcaldias-capas' })}
      <button class="ax-toggle" type="button" data-act="spikes" aria-pressed="false">
        <span class="ax-toggle-box" aria-hidden="true"></span>Picos 3D · lista nominal
      </button>`,
    onLayers(b) {
      if (b.dataset.mode) mode = b.dataset.mode;
      else if (b.dataset.party) { mode = 'partido'; party = b.dataset.party; }
      else return;
      syncLayers();
      ctx.restyle();
    },
    fill(it, theme) {
      const N = NEUTRAL[theme];
      if (it.kind === 'none') return N.none;
      const e = it.enc;
      if (!e) return N.nodata;
      if (mode === 'ganador') return baseColor(e.lider);
      if (mode === 'partido' || mode === 'indecisos') {
        const key = mode === 'indecisos' ? 'NO_DECIDE' : party;
        const v = e.partidos[key];
        if (v == null) return N.nodata;
        const [a, b] = rango(key);
        return ramp(key, 0.06 + 0.9 * (b > a ? (v - a) / (b - a) : 0.5));
      }
      return ramp(e.lider, 0.1 + 0.9 * Math.min(1, (e.margen || 0) / MARGIN_CAP));
    },
    tipKey: () => `${mode}|${party}|${data ? 1 : 0}`,
    tip(it) {
      if (it.kind === 'none') return '<p class="ax-tip-f">Sin elección de gubernatura en 2027 (fuera de esta vista)</p>';
      if (it.kind === 'estado') return '<p class="ax-tip-f">Cargando municipios…</p>';
      if (!data) return `<p class="ax-tip-f">${error ? 'Datos no disponibles' : 'Cargando encuestas…'}</p>`;
      const e = it.enc;
      if (!e) return '<p class="ax-tip-f">Sin encuesta municipal publicada</p>';
      const rows = rankEntries(e.partidos).slice(0, 5).map(([p, v]) => [p, pct1(v), '']);
      return tipTable(['Partido', '%', ''], rows)
        + `<p class="ax-tip-f">Rubrum · ${e.n_sondeos} ${e.n_sondeos === 1 ? 'sondeo' : 'sondeos'} · último ${fechaLarga(e.fecha_ultima)}</p>`;
    },
    panel,
    legend() {
      const leaders = PARTY_ORDER.filter((p) => [...encuestas.values()].some((e) => e.lider === p));
      const base = mode === 'indecisos'
        ? legendFor('partido', { party: 'NO_DECIDE', range: rango('NO_DECIDE') })
        : legendFor(mode, { leaders, cap: MARGIN_CAP, party, range: rango(party) });
      const nod = NEUTRAL[ctx.theme].nodata;
      return `${base}<p class="ax-lg-note"><span class="ax-hatch-sw" style="--c:${nod}"></span>Sin encuesta municipal</p>`;
    },
    index() {
      const out = [];
      for (const s of stateItems) {
        const munis = munisByCve.get(s.cve) || [];
        const n = munis.filter((m) => m.enc).length;
        out.push({ label: s.name, sub: `Estado · ${n} de ${munis.length || '—'} municipios con encuesta`, ids: munis.map((m) => m.id), bbox: s.geom.bbox, maxZoom: 9.5, rank: 0.2 });
      }
      for (const munis of munisByCve.values()) for (const m of munis) {
        out.push({ label: m.name, sub: `Municipio · ${ENTIDADES[m.cve][0]}${m.enc ? ` · encuesta: lidera ${shortParty(m.enc.lider)}` : ' · sin encuesta'}`, ids: [m.id], bbox: m.geom.bbox, maxZoom: 10.5, rank: m.enc ? 0 : 0.6 });
      }
      return out;
    },
    spike(it) {
      if (it.kind !== 'mun' || !it.enc || !it.ln) return null;
      return { h: Math.pow(it.ln / maxLn, 0.72), color: PARTIES[it.enc.lider]?.color || '#888' };
    },
  });

  let maxLn = 1;
  function rango(key) {
    const vals = [...encuestas.values()].map((e) => e.partidos[key]).filter((v) => v != null);
    return vals.length ? [Math.min(...vals), Math.max(...vals)] : [0, 1];
  }
  function syncLayers() {
    const layers = root.querySelector('#axLayers');
    syncRadios(layers, 'mode', mode);
    syncRadios(layers, 'party', party);
    layers.querySelectorAll('.ax-sub').forEach((s) => { s.hidden = s.dataset.for !== mode; });
  }

  /* ---------- Items: estados (hasta cargar) y municipios ---------- */
  const noneItems = [];
  for (const f of store.geoData.features) {
    const cve = parseInt(f.properties.cvegeo, 10);
    const geom = toWorldGeometry(f.geometry);
    if (estadosByCve.has(cve)) stateItems.push({ id: 's:' + cve, kind: 'estado', group: cve, border: true, cve, name: estadosByCve.get(cve).nombre, geom, selectable: false });
    else noneItems.push({ id: 'n:' + cve, kind: 'none', cve, name: ENTIDADES[cve]?.[0] || f.properties.nom_edo, geom, selectable: false, spike: false });
  }
  function rebuild() {
    const list = [...noneItems];
    for (const s of stateItems) list.push(...(munisByCve.get(s.cve) || [s]));
    for (const it of list) if (it.kind === 'mun') it.enc = encuestas.get(it.cvegeo) || null;
    maxLn = Math.max(1, ...list.filter((i) => i.enc && i.ln).map((i) => i.ln));
    ctx.setItems(list);
    ctx.renderLegend();
    ctx.renderPanel();
  }

  /* ---------- Panel ---------- */
  function fuenteHTML() {
    const pregunta = data?.pregunta || 'Si el día de hoy fuera la elección para presidente municipal, ¿por cuál partido político votaría usted?';
    return fuenteBox(`
      <p><b>Qué encuesta se muestra:</b> las encuestas telefónicas de <b>Rubrum</b> sobre la elección de <b>presidencia municipal (alcaldía) 2027</b>. La pregunta es: <q>${escapeHTML(pregunta)}</q></p>
      <p><b>Cómo se obtienen:</b> Rubrum publica sus resultados como imágenes. Se leen automáticamente y solo se aceptan si los porcentajes suman cerca de 100 %; las que no pasan esa revisión se descartan.</p>
      <p><b>Cómo se combinan:</b> si un municipio tiene varios sondeos, se promedian dando más peso a los más recientes.</p>
      <p>No es intención de voto para gubernatura y no cubre todos los municipios: los que no tienen encuesta quedan en gris.${data?.fecha_calculo ? ` Último sondeo: ${fechaLarga(data.fecha_calculo)}.` : ''} <a href="#/metodologia">Metodología completa</a>.</p>`, { clave: 'alcaldias-general' });
  }

  function tablaPartidos(partidos, extraCol) {
    const rows = rankEntries(partidos);
    const lead = rows.find(([p]) => isParty(p))?.[0];
    return `<table class="ax-t${extraCol ? ' ax-t4' : ''}">
      <thead><tr><th scope="col">Partido</th><th scope="col">%</th>${extraCol ? `<th scope="col">${extraCol.title}</th>` : ''}</tr></thead>
      <tbody>${rows.map(([p, v]) => `<tr><th scope="row">${dot(p)}<span class="ax-pn"><span>${ETIQUETA[p] || partyName(p)}${p === lead ? '<span class="ax-lead">lidera</span>' : ''}</span></span></th>
        <td>${pct1(v)}</td>${extraCol ? `<td>${extraCol.val(p)}</td>` : ''}</tr>`).join('')}</tbody>
    </table>`;
  }

  function panel(list) {
    if (error) {
      return {
        scope: 'Alcaldías 2027 · Rubrum',
        intro: `<h1 class="ax-title">Preferencia para presidencia municipal 2027</h1>
          <p class="ax-note">No se pudieron cargar las encuestas municipales. Intenta recargar la página en unos momentos.</p>`,
        table: '', foot: '',
      };
    }
    if (!data) return { scope: 'Alcaldías 2027 · Rubrum', intro: '<p class="ax-by">Cargando encuestas municipales…</p>', table: '', foot: '' };
    const muns = list.filter((i) => i.kind === 'mun');
    if (!muns.length) {
      const cuenta = {};
      for (const e of encuestas.values()) cuenta[e.lider] = (cuenta[e.lider] || 0) + 1;
      const sondeos = [...encuestas.values()].reduce((a, e) => a + e.n_sondeos, 0);
      const top = [...encuestas.values()].sort((a, b) => (b.lista_nominal || 0) - (a.lista_nominal || 0)).slice(0, 10);
      return {
        scope: 'Alcaldías 2027 · Rubrum',
        intro: `<h1 class="ax-title">Preferencia para presidencia municipal 2027</h1>
          <div class="ax-kpis"><div><b>${data.municipios_encuestados}</b><span>de ${fmtNum(data.municipios_total)} municipios</span></div>
            <div><b>${sondeos}</b><span>sondeos</span></div><div><b>${Object.keys(cuenta).length}</b><span>partidos punteros</span></div></div>
          <p class="ax-by">${Object.entries(cuenta).sort((a, b) => b[1] - a[1]).map(([p, n]) => `${shortParty(p)} encabeza ${n}`).join(' · ')}</p>
          ${fuenteHTML()}`,
        table: `<p class="ax-h3">Municipios encuestados con mayor lista nominal</p>
          <table class="ax-t ax-t4"><thead><tr><th scope="col">Municipio</th><th scope="col">Lidera</th><th scope="col">%</th><th scope="col">Margen</th></tr></thead>
          <tbody>${top.map((e) => `<tr><th scope="row"><button class="ax-link" type="button" data-pick="m:${e.cvegeo}">${escapeHTML(e.municipio)}, ${ENTIDADES[e.cve_ent][1]}</button></th>
            <td>${dot(e.lider)} ${shortParty(e.lider)}</td><td>${pct1(e.partidos[e.lider])}</td><td>+${(e.margen || 0).toFixed(1)}</td></tr>`).join('')}</tbody></table>`,
        foot: '<p>Proyección de gubernatura por estado: <a href="#/estatal">Preferencia estatal</a>.</p>',
      };
    }
    const con = muns.filter((m) => m.enc);
    if (muns.length === 1) {
      const m = muns[0];
      if (!m.enc) {
        return {
          scope: `${m.name}, ${ENTIDADES[m.cve][1]}`,
          table: '<p class="ax-empty">Rubrum no ha publicado encuesta de alcaldía para este municipio. No se muestra ninguna estimación.</p>',
          foot: `<p>Lista nominal: <b>${m.ln ? fmtNum(m.ln) : '—'}</b></p>`,
        };
      }
      const e = m.enc, u = e.ultimo_sondeo;
      return {
        scope: `${m.name}, ${ENTIDADES[m.cve][1]}`,
        table: tablaPartidos(e.partidos, u ? { title: `Último (${fechaLarga(u.fecha).replace(/ \d{4}$/, '')})`, val: (p) => (u.partidos?.[p] != null ? pct1(u.partidos[p]) : '—') } : null),
        foot: `<p><b>${e.n_sondeos}</b> ${e.n_sondeos === 1 ? 'sondeo' : 'sondeos'} de Rubrum · último levantamiento <b>${fechaLarga(e.fecha_ultima)}</b>${u?.muestra ? ` · n=${fmtNum(u.muestra)}` : ''}</p>
          <p>Margen entre partidos: <b>${shortParty(e.lider)} +${(e.margen || 0).toFixed(1)} pp</b> · lista nominal <b>${m.ln ? fmtNum(m.ln) : '—'}</b></p>
          ${u?.url_fuente ? fuenteBox(`<p><a href="${escapeHTML(u.url_fuente)}" target="_blank" rel="noopener">Publicación original de Rubrum</a>${u.imagen_fuente ? ` · <a href="${escapeHTML(u.imagen_fuente)}" target="_blank" rel="noopener">imagen con los resultados</a>` : ''}.</p><p>La columna «%» es el promedio de sus sondeos, con más peso a los recientes; «Último» es el sondeo más reciente.</p>`, { clave: 'alcaldias-municipio' }) : ''}`,
      };
    }
    // Varios municipios: promedio de los encuestados ponderado por lista nominal
    const sums = {};
    let W = 0;
    for (const m of con) {
      const w = m.ln || 1;
      W += w;
      for (const [p, v] of Object.entries(m.enc.partidos)) sums[p] = (sums[p] || 0) + v * w;
    }
    const cves = new Set(muns.map((m) => m.cve));
    return {
      scope: `${fmtNum(muns.length)} municipios${cves.size === 1 ? ` · ${ENTIDADES[muns[0].cve][1]}` : ''}`,
      table: con.length ? tablaPartidos(Object.fromEntries(Object.entries(sums).map(([p, v]) => [p, v / W])))
        : '<p class="ax-empty">Ninguno de los municipios seleccionados tiene encuesta de alcaldía.</p>',
      foot: `<p><b>${con.length}</b> de ${muns.length} municipios seleccionados tienen encuesta.</p>
        ${fuenteBox('<p>Promedio de los municipios encuestados de la selección, ponderado por su lista nominal.</p><p>Cada municipio elige a su propia alcaldía: este promedio resume preferencias, no es el resultado de una sola elección.</p>', { clave: 'alcaldias-varios' })}`,
    };
  }

  /* ---------- Carga ---------- */
  syncLayers();
  rebuild();
  ctx.fitMexico({ instant: true });
  ctx.setStatus('Cargando encuestas municipales…');

  apiGet('/api/v1/alcaldias').then((d) => {
    if (!ctx.alive) return;
    data = d;
    for (const e of d.municipios) encuestas.set(e.cvegeo, e);
    rebuild();
    ctx.restyle();
  }).catch(() => {
    if (!ctx.alive) return;
    error = true;
    ctx.setStatus('No se pudieron cargar las encuestas municipales. Intenta recargar la página.', 'warn');
    ctx.renderPanel();
  });

  const pending = [...store.estados];
  let cargados = 0;
  async function worker() {
    while (ctx.alive && pending.length) {
      const estado = pending.shift();
      try {
        const geo = await loadMunicipios(estado);
        if (!ctx.alive) return;
        const munis = [];
        for (const f of geo.features || []) {
          const geom = toWorldGeometry(f.geometry);
          if (!geom.polys.length) continue;
          const cvegeo = String(f.properties.cvegeo).padStart(5, '0');
          const st = statsMunicipio(store.padronData, cvegeo);
          munis.push({ id: 'm:' + cvegeo, kind: 'mun', group: estado.cve, border: true, cvegeo, cve: estado.cve, name: f.properties.name || `Municipio ${cvegeo}`, geom, ln: st ? Number(st[1]) || 0 : 0 });
        }
        munisByCve.set(estado.cve, munis);
      } catch { /* el estado queda como polígono estatal */ }
      cargados++;
      rebuild();
      if (cargados >= store.estados.length && !error) ctx.setStatus(data ? '' : 'Cargando encuestas municipales…');
      else if (!error) ctx.setStatus(`Cargando municipios · ${cargados} de ${store.estados.length}`);
    }
  }
  for (let i = 0; i < 4; i++) worker();

  return () => ctx.destroy();
}
