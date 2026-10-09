// ============================================================
// views/estatal.js — Preferencia estatal para gubernatura 2027.
// Solo polígonos de estados: cada una de las 17 entidades se colorea
// con el promedio ponderado de las encuestas públicas de gubernatura
// (mirador-backend: GET /api/v1/estados y /api/v1/encuestas). No hay
// desglose municipal en esta vista.
// ============================================================

import { store } from '../store.js';
import { apiGet } from '../api.js';
import { toWorldGeometry } from '../atlas.js';
import {
  montarMapa, ENTIDADES, I, NEUTRAL, ramp, baseColor, partyName, shortParty, dot, pct1, fechaLarga, rankEntries,
  tipTable, syncRadios, partyChips, legendFor, escapeHTML, fmtNum, PARTY_ORDER, PARTIES, isParty, fuenteBox,
} from './atlas_comun.js';

const MARGIN_CAP = 25;

/** Modelo por entidad desde la API. */
async function cargarDesdeApi() {
  const [estados, sondeos, meta] = await Promise.all([
    apiGet('/api/v1/estados'), apiGet('/api/v1/encuestas'), apiGet('/api/v1/meta'),
  ]);
  const porSlug = {};
  for (const s of sondeos) (porSlug[s.estado] = porSlug[s.estado] || []).push({
    casa: s.encuestadora, fecha: s.fecha, n: s.muestra, metodologia: s.metodologia, url: s.url_fuente, partidos: s.partidos,
  });
  const out = new Map();
  for (const e of estados) {
    const partidos = {};
    for (const [p, v] of Object.entries(e.partidos)) {
      if (!isParty(p)) continue;
      partidos[p] = { tendencia: v.tendencia, promedio: v.promedio, n: v.n_encuestas, min: v.min, max: v.max };
    }
    out.set(e.cve, { cve: e.cve, slugCsv: e.slug, nombre: e.nombre, partidos, sondeos: porSlug[e.slug] || [], fecha: e.fecha_calculo });
  }
  return { estados: out, fecha: meta.fecha_calculo_estatal, fuente: 'api' };
}

/** Respaldo sin API: los mismos CSV que ya carga la app (data/agregado.csv). */
function cargarDesdeStore() {
  const out = new Map();
  for (const e of store.estados) {
    const partidos = {};
    for (const [p, v] of Object.entries(e.encuestasPorPartido || {})) {
      partidos[p] = { tendencia: v.tendencia, promedio: v.promedio, n: v.nEncuestas, min: v.min, max: v.max };
    }
    const sondeos = e.encuestasSonReales ? e.encuestas.map((s) => ({
      casa: s.casa, fecha: s.fecha.toISOString().slice(0, 10), n: s.n, url: null, partidos: s.shares,
    })) : [];
    out.set(e.cve, { cve: e.cve, nombre: e.nombre, partidos, sondeos, fecha: e.actualizado });
  }
  return { estados: out, fecha: store.estados[0]?.actualizado, fuente: 'csv' };
}

function resumen(m) {
  const vals = Object.entries(m.partidos).map(([p, v]) => [p, v.tendencia]).sort((a, b) => b[1] - a[1]);
  const leader = vals[0]?.[0] || null;
  const margin = vals.length ? vals[0][1] - (vals[1]?.[1] || 0) : 0;
  const suma = vals.reduce((a, [, v]) => a + v, 0);
  return { leader, margin, otros: Math.max(0, 100 - suma) };
}

export function render(root) {
  let mode = 'margen', party = 'MORENA';
  let data = null;
  const estadosByCve = new Map(store.estados.map((e) => [e.cve, e]));

  const ctx = montarMapa(root, {
    aria: 'Mapa de preferencia estatal para gubernatura',
    placeholder: 'Busca un estado…',
    covered: (cve) => estadosByCve.has(cve),
    layersHTML: `
      <div class="ax-modes" role="radiogroup" aria-label="Capa">
        <button type="button" role="radio" data-mode="margen">Margen</button>
        <button type="button" role="radio" data-mode="ganador">Ganador</button>
        <button type="button" role="radio" data-mode="partido">Partido</button>
      </div>
      <div class="ax-sub" data-for="partido">
        <p class="ax-sub-h">Preferencia estatal por partido</p>
        <div class="ax-chips ax-chips-party" role="radiogroup" aria-label="Partido">${partyChips()}</div>
      </div>
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
      if (it.kind === 'none') return NEUTRAL[theme].none;
      if (!it.m || !it.r.leader) return NEUTRAL[theme].nodata;
      if (mode === 'ganador') return baseColor(it.r.leader);
      if (mode === 'partido') {
        const v = it.m.partidos[party]?.tendencia;
        if (v == null) return NEUTRAL[theme].nodata;
        const [a, b] = rangoPartido();
        return ramp(party, 0.06 + 0.9 * (b > a ? (v - a) / (b - a) : 0.5));
      }
      return ramp(it.r.leader, 0.1 + 0.9 * Math.min(1, it.r.margin / MARGIN_CAP));
    },
    tipKey: () => `${mode}|${party}|${data ? 1 : 0}`,
    tip(it) {
      if (it.kind === 'none') return '<p class="ax-tip-f">Sin elección de gubernatura en 2027</p>';
      if (!it.m) return '<p class="ax-tip-f">Cargando encuestas…</p>';
      const rows = Object.entries(it.m.partidos).sort((a, b) => b[1].tendencia - a[1].tendencia).slice(0, 4)
        .map(([p, v]) => [p, pct1(v.tendencia), v.n]);
      const casas = new Set(it.m.sondeos.map((s) => s.casa));
      return tipTable(['Partido', '%', 'Enc.'], rows)
        + `<p class="ax-tip-f">Promedio de encuestas de gubernatura${casas.size ? ` · ${casas.size} casas` : ''} · corte ${fechaLarga(it.m.fecha)}</p>`;
    },
    panel,
    legend() {
      const leaders = PARTY_ORDER.filter((p) => ctx.items.some((i) => i.r?.leader === p));
      return legendFor(mode, { leaders, cap: MARGIN_CAP, party, range: rangoPartido() });
    },
    index: () => ctx.items.filter((i) => i.kind === 'estado').map((i) => ({
      label: i.name, sub: i.r?.leader ? `Lidera ${shortParty(i.r.leader)} · +${i.r.margin.toFixed(1)} pp` : 'Estado', ids: [i.id], bbox: i.geom.bbox, maxZoom: 7.5,
    })),
    spike(it) {
      if (it.kind !== 'estado' || !it.ln || !it.r?.leader) return null;
      const max = Math.max(...ctx.items.filter((i) => i.ln).map((i) => i.ln));
      return { h: Math.pow(it.ln / max, 0.72), color: PARTIES[it.r.leader].color };
    },
  });

  function rangoPartido() {
    const vals = ctx.items.map((i) => i.m?.partidos[party]?.tendencia).filter((v) => v != null);
    return vals.length ? [Math.min(...vals), Math.max(...vals)] : [0, 1];
  }
  function syncLayers() {
    const layers = root.querySelector('#axLayers');
    syncRadios(layers, 'mode', mode);
    syncRadios(layers, 'party', party);
    layers.querySelectorAll('.ax-sub').forEach((s) => { s.hidden = s.dataset.for !== mode; });
  }

  /* ---------- Items: solo polígonos estatales ---------- */
  const items = store.geoData.features.map((f) => {
    const cve = parseInt(f.properties.cvegeo, 10);
    const geom = toWorldGeometry(f.geometry);
    const e = estadosByCve.get(cve);
    if (!e) return { id: 'n:' + cve, kind: 'none', cve, name: ENTIDADES[cve]?.[0] || f.properties.nom_edo, geom, selectable: false, spike: false };
    return { id: 's:' + cve, kind: 'estado', group: cve, border: true, cve, name: e.nombre, geom, ln: e.listaNominal, estado: e, m: null, r: {} };
  });
  ctx.setItems(items);

  /* ---------- Panel ---------- */
  const casasDe = (sondeos) => [...new Set(sondeos.map((s) => s.casa))].sort();
  function fuenteHTML() {
    if (!data) return '';
    const todos = [...data.estados.values()].flatMap((m) => m.sondeos);
    const casas = casasDe(todos);
    return fuenteBox(`
      <p><b>Qué encuestas se muestran:</b> intención de voto por partido para <b>gubernatura 2027</b>, publicadas por
      ${casas.length ? `${casas.length} casas encuestadoras (${casas.map(escapeHTML).join(', ')})` : 'casas encuestadoras públicas'}.</p>
      <p><b>Cómo se combinan:</b> cada estado es un promedio de sus encuestas. Pesa más una encuesta reciente (su peso se reduce a la mitad cada 30 días), con muestra grande y de una casa con buena metodología. Después se suaviza la tendencia para no exagerar los saltos de una sola encuesta.</p>
      <p>Estas encuestas son estatales: <b>no hay desglose por municipio</b>.</p>
      <p>Corte: ${fechaLarga(data.fecha)}. <a href="#/metodologia">Metodología completa</a>.</p>`, { clave: 'estatal-general' });
  }

  function tablaEstados() {
    const rows = ctx.items.filter((i) => i.kind === 'estado' && i.r.leader).sort((a, b) => a.r.margin - b.r.margin);
    return `<p class="ax-h3">Las 17 contiendas, de la más cerrada a la más amplia</p>
    <table class="ax-t ax-t4">
      <thead><tr><th scope="col">Estado</th><th scope="col">Lidera</th><th scope="col">%</th><th scope="col">Margen</th></tr></thead>
      <tbody>${rows.map((i) => `<tr><th scope="row"><button class="ax-link" type="button" data-pick="${i.id}">${escapeHTML(i.name)}</button></th>
        <td>${dot(i.r.leader)} ${shortParty(i.r.leader)}</td><td>${pct1(i.m.partidos[i.r.leader].tendencia)}</td><td>+${i.r.margin.toFixed(1)}</td></tr>`).join('')}</tbody>
    </table>`;
  }

  function tablaPartidos(partidos, otros, conDetalle) {
    const rows = Object.entries(partidos).sort((a, b) => b[1].tendencia - a[1].tendencia);
    const lead = rows[0]?.[0];
    return `<table class="ax-t ax-t4">
      <thead><tr><th scope="col">Partido</th><th scope="col">%</th>${conDetalle ? '<th scope="col" title="Mínimo y máximo entre las encuestas">Rango</th><th scope="col" title="Número de encuestas">Enc.</th>' : ''}</tr></thead>
      <tbody>${rows.map(([p, v]) => `<tr><th scope="row">${dot(p)}<span class="ax-pn"><span>${partyName(p)}${p === lead ? '<span class="ax-lead">lidera</span>' : ''}</span></span></th>
        <td>${pct1(v.tendencia)}</td>${conDetalle ? `<td>${v.min != null ? `${Number(v.min).toFixed(0)}–${Number(v.max).toFixed(0)}` : '—'}</td><td>${v.n ?? '—'}</td>` : ''}</tr>`).join('')}
        <tr><th scope="row">${dot('Otros')}<span class="ax-pn"><span>Otros / sin definir</span></span></th><td>${pct1(otros)}</td>${conDetalle ? '<td></td><td></td>' : ''}</tr>
      </tbody>
    </table>`;
  }

  function listaSondeos(sondeos) {
    if (!sondeos.length) return '<p class="ax-empty">No hay sondeos individuales disponibles para este estado.</p>';
    const ult = [...sondeos].sort((a, b) => String(b.fecha).localeCompare(String(a.fecha))).slice(0, 8);
    return `<p class="ax-h3">Encuestas más recientes</p><ul class="ax-polls">${ult.map((s) => {
      const top = rankEntries(s.partidos).filter(([p]) => isParty(p))[0];
      const casa = s.url ? `<a href="${escapeHTML(s.url)}" target="_blank" rel="noopener">${escapeHTML(s.casa)}</a>` : escapeHTML(s.casa);
      return `<li><span>${casa} · ${fechaLarga(s.fecha)}${s.n ? ` · n=${fmtNum(s.n)}` : ''}</span><span>${top ? `${shortParty(top[0])} ${pct1(top[1])}` : ''}</span></li>`;
    }).join('')}</ul>`;
  }

  function panel(list) {
    if (!data) return { scope: 'Preferencia estatal · 2027', intro: '<p class="ax-by">Cargando encuestas…</p>', table: '', foot: '' };
    if (!list.length) {
      const cuenta = {};
      for (const i of ctx.items) if (i.r?.leader) cuenta[i.r.leader] = (cuenta[i.r.leader] || 0) + 1;
      return {
        scope: 'Preferencia estatal · gubernaturas 2027',
        intro: `<h1 class="ax-title">Preferencia por partido para gubernatura, estado por estado</h1>
          <p class="ax-by">${Object.entries(cuenta).sort((a, b) => b[1] - a[1]).map(([p, n]) => `${shortParty(p)} encabeza ${n}`).join(' · ')}</p>
          ${fuenteHTML()}`,
        table: tablaEstados(),
        foot: '<p>Encuestas de alcaldía por municipio: <a href="#/alcaldias">Alcaldías 2027</a>.</p>',
      };
    }
    if (list.length === 1) {
      const it = list[0];
      const e = it.estado;
      return {
        scope: it.name,
        table: tablaPartidos(it.m.partidos, it.r.otros, true) + listaSondeos(it.m.sondeos),
        foot: `<p>Basado en <b>${it.m.sondeos.length || '—'}</b> sondeos de <b>${casasDe(it.m.sondeos).length || '—'}</b> casas · lista nominal <b>${fmtNum(it.ln)}</b></p>
          ${fuenteBox(`<p>Promedio de las encuestas de gubernatura publicadas en ${escapeHTML(it.name)} (corte ${fechaLarga(it.m.fecha)}). «Rango» es el valor más bajo y más alto que dio cada partido entre esas encuestas; «Enc.» cuántas lo midieron.</p><p>Cada nombre de la lista lleva a la publicación original.</p>`, { clave: 'estatal-estado' })}
          <button class="ax-link" type="button" data-go="/estado/${e.slug}">Ver contienda en ${escapeHTML(e.nombre)} ${I.arrow}</button>`,
      };
    }
    // Varios estados: promedio ponderado por lista nominal
    const sums = {};
    let W = 0;
    for (const it of list) {
      W += it.ln || 0;
      for (const [p, v] of Object.entries(it.m.partidos)) sums[p] = (sums[p] || 0) + v.tendencia * (it.ln || 0);
    }
    const partidos = Object.fromEntries(Object.entries(sums).map(([p, v]) => [p, { tendencia: v / (W || 1) }]));
    const otros = Math.max(0, 100 - Object.values(partidos).reduce((a, v) => a + v.tendencia, 0));
    return {
      scope: `${list.length} estados`,
      table: tablaPartidos(partidos, otros, false),
      foot: `<p>Lista nominal: <b>${fmtNum(W)}</b></p>${fuenteBox('<p>Promedio de los estados seleccionados, ponderado por su lista nominal.</p>', { clave: 'estatal-varios' })}`,
    };
  }

  /* ---------- Carga ---------- */
  syncLayers();
  ctx.renderLegend();
  ctx.renderPanel();
  ctx.fitMexico({ instant: true });
  ctx.setStatus('Cargando encuestas de gubernatura…');
  cargarDesdeApi().catch(() => cargarDesdeStore()).then((d) => {
    if (!ctx.alive) return;
    data = d;
    for (const it of ctx.items) {
      if (it.kind !== 'estado') continue;
      it.m = d.estados.get(it.cve) || null;
      it.r = it.m ? resumen(it.m) : {};
    }
    ctx.setItems(ctx.items);
    ctx.restyle();
    ctx.setStatus(d.fuente === 'api' ? '' : 'No se pudieron actualizar los datos; se muestra la última versión guardada.', d.fuente === 'api' ? 'info' : 'warn');
  });

  return () => ctx.destroy();
}
