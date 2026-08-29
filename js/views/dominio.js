// ============================================================
// views/dominio.js — Mapa de dominio con selector de acciones
// por estado y drill-down estado → municipio.
// ============================================================

import { store } from '../store.js';
import { PARTIES, PARTY_ORDER, UPDATED_LABEL } from '../config.js';
import { renderMap, renderLegend, renderMunicipios, renderMunicipiosHist, loadMunicipios, stateCve } from '../map.js';
import { loadHist2021 } from '../hist2021.js';
import { createZoom } from '../zoom.js';
import { navigate } from '../router.js';
import { partyLogo } from '../components.js';
import { pct, slugify } from '../utils.js';

export function render(root) {
  root.innerHTML = `
  <section class="dom-fs">
    <div class="dom-map">
      <div class="map-stage dom-stage" id="stage"><svg id="map" aria-label="Mapa de dominio electoral"></svg></div>
      <button class="dom-back" id="backBtn" hidden>← Todos los estados</button>

      <div class="state-actions" id="stateActions" hidden aria-live="polite"></div>
      <div class="territory-popup" id="territoryPopup" hidden aria-live="polite"></div>

      <div class="zoom-ctl">
        <button data-z="in" aria-label="Acercar">+</button>
        <button data-z="out" aria-label="Alejar">−</button>
        <button data-z="reset" aria-label="Restablecer vista">⟳</button>
      </div>

      <div class="map-loading" id="mapLoading" hidden><span class="spinner"></span> cargando municipios…</div>
    </div>

    <aside class="dom-panel">
      <div class="dp-head">
        <h2 class="dp-title" id="panelTitle">Mapa de dominio</h2>
        <p class="dp-sub" id="panelSub">Selecciona un <b>estado</b> para elegir entre ver su desglose municipal o la contienda estatal. Rueda para acercar; arrastra para desplazar.</p>
      </div>
      <div class="dp-controls">
        <div class="seg" id="metricToggle" role="group" aria-label="Métrica">
          <button data-metric="prob" class="on">Probabilidad</button>
          <button data-metric="margen">Margen</button>
        </div>
      </div>
      <div class="seg" id="viewToggle" role="group" aria-label="Vista municipal" hidden>
        <button data-view="municipios" class="on">Municipios 2027</button>
        <button data-view="oportunidad">Oportunidad 2021</button>
      </div>
      <div class="op-controls" id="opControls" hidden>
        <p class="op-kicker">Áreas de oportunidad · voto 2021</p>
        <div class="op-parties" id="opParties" role="group" aria-label="Partido para el mapa de calor"></div>
      </div>
      <div class="legend legend-lg" id="legend"></div>
      <div class="dp-list" id="domList"></div>
      <p class="dp-foot">Actualizado ${UPDATED_LABEL} · <span class="ficticio">datos ficticios</span></p>
    </aside>
  </section>`;

  const stage = root.querySelector('#stage');
  let svg = root.querySelector('#map');
  const metricToggle = root.querySelector('#metricToggle');
  const backBtn = root.querySelector('#backBtn');
  const loading = root.querySelector('#mapLoading');
  const panelTitle = root.querySelector('#panelTitle');
  const panelSub = root.querySelector('#panelSub');
  const list = root.querySelector('#domList');
  const stateActions = root.querySelector('#stateActions');
  const opControls = root.querySelector('#opControls');
  const metricControls = root.querySelector('.dp-controls');
  const legendEl = root.querySelector('#legend');
  const viewToggle = root.querySelector('#viewToggle');

  function syncViewToggle() {
    const show = selectedState && selectedState.slug === 'queretaro' &&
      (mode === 'municipios' || mode === 'oportunidad');
    viewToggle.hidden = !show;
    viewToggle.querySelectorAll('button').forEach((b) =>
      b.classList.toggle('on', b.dataset.view === mode));
  }
  let selectedState = null;
  let pendingState = null;
  let municipalityControl = null;
  let histControl = null;
  let mode = 'estados';        // 'estados' | 'municipios' | 'oportunidad'
  let opParty = 'PAN';         // partido del mapa de calor 2021

  store.mapMetric = store.mapMetric || 'prob';
  // Algunos nombres del GeoJSON estatal tienen problemas de codificación; la
  // clave INEGI evita que eso afecte la selección de las 17 entidades demo.
  for (const estado of store.estados) {
    const cve = stateCve(estado);
    const feature = store.geoData.features.find((item) => String(item.properties.cvegeo).padStart(2, '0') === cve);
    if (feature) store.porSlug[slugify(feature.properties.nom_edo)] = estado;
  }

  let zoom;
  function onApply(state) {
    const layer = stage.querySelector('.municipal-canvas') || svg;
    layer.style.transformOrigin = '0 0';
    layer.style.transform = (state.scale === 1 && state.tx === 0 && state.ty === 0)
      ? '' : `translate(${state.tx}px, ${state.ty}px) scale(${state.scale})`;
  }
  zoom = createZoom(stage, { min: 1, max: 18, onApply });

  function closeStateActions() {
    pendingState = null;
    stateActions.hidden = true;
    stateActions.innerHTML = '';
  }

  function showStateActions(slug) {
    const estado = store.porSlug[slug];
    if (!estado) return;
    pendingState = estado;
    stateActions.innerHTML = `
      <button class="sa-close" data-state-action="close" aria-label="Cerrar opciones">×</button>
      <p class="sa-kicker">${estado.region}</p>
      <h3>${estado.nombre}</h3>
      <p>${partyLogo(estado.favorito, 'md')} lidera la contienda.</p>
      <div class="sa-kpis">
        <span><b>${pct(estado.probFav)}</b> probabilidad</span>
        <span><b>+${estado.margen.toFixed(1)} pp</b> margen</span>
        <span><b>${estado.estatus.label}</b> estatus</span>
      </div>
      <div class="sa-buttons">
        <button class="sa-primary" data-state-action="municipios">Ver municipios</button>
        <button class="sa-secondary" data-state-action="contienda">Ver contienda estatal</button>
        ${estado.slug === 'queretaro' ? '<button class="sa-secondary" data-state-action="oportunidad">Áreas de oportunidad 2021</button>' : ''}
      </div>`;
    stateActions.hidden = false;
  }

  function showMunicipalityPopup(municipio) {
    const metric = store.mapMetric === 'margen'
      ? `+${municipio.margen.toFixed(1)} pp de margen`
      : `${pct(municipio.probFav)} de probabilidad`;
    pendingState = null;
    stateActions.innerHTML = `
      <button class="sa-close" data-state-action="close" aria-label="Cerrar detalle">×</button>
      <p class="sa-kicker">Municipio · ${selectedState?.nombre || ''}</p>
      <h3>${municipio.name}</h3>
      <p>${partyLogo(municipio.favorito, 'md')} lidera la contienda municipal.</p>
      <div class="sa-kpis">
        <span><b>${pct(municipio.probFav)}</b> probabilidad</span>
        <span><b>+${municipio.margen.toFixed(1)} pp</b> margen</span>
        <span><b>${selectedState?.estatus.label || 'Local'}</b> referencia estatal</span>
      </div>
      <div class="sa-buttons"><button class="sa-secondary" data-state-action="close">Cerrar</button></div>`;
    stateActions.hidden = false;
  }

  function renderStateList() {
    const grupos = PARTY_ORDER
      .map((id) => ({ id, estados: store.estados.filter((estado) => estado.favorito === id).sort((a, b) => b.probFav - a.probFav) }))
      .filter((grupo) => grupo.estados.length);
    list.innerHTML = grupos.map((grupo) => {
      return `<div class="dl-group">
        <div class="dl-head">${partyLogo(grupo.id, 'md')}<span class="dl-count">${grupo.estados.length}</span></div>
        ${grupo.estados.map((estado) => `<button class="dl-row" data-slug="${estado.slug}">
          <span class="dl-name">${estado.nombre}${estado.flip ? ' <span class="flip-tag sm">cambia</span>' : ''}</span>
          <span class="dl-metric">${pct(estado.probFav)}</span>
        </button>`).join('')}
      </div>`;
    }).join('');
  }

  function renderMunicipalityList(results) {
    const sorted = [...results].sort((a, b) => b.probFav - a.probFav || a.name.localeCompare(b.name, 'es'));
    list.innerHTML = `<div class="dl-group">
      <div class="dl-head">Municipios<span class="dl-count">${sorted.length}</span></div>
      ${sorted.map((municipio) => {
        const party = PARTIES[municipio.favorito];
        const value = store.mapMetric === 'margen' ? `+${municipio.margen.toFixed(1)} pp` : pct(municipio.probFav);
        return `<button class="dl-row" data-cvegeo="${municipio.cvegeo}">
          <span class="dl-name"><span class="pdot" style="background:${party.color}"></span>${municipio.name}</span>
          <span class="dl-metric">${value}</span>
        </button>`;
      }).join('')}
    </div>`;
  }

  function drawStates() {
    closeStateActions();
    stage.querySelectorAll('.municipal-canvas').forEach((canvas) => canvas.remove());
    svg.style.display = '';
    selectedState = null;
    municipalityControl = null;
    histControl = null;
    mode = 'estados';
    opControls.hidden = true;
    metricControls.hidden = false;
    legendEl.hidden = false;
    syncViewToggle();
    backBtn.hidden = true;
    panelTitle.textContent = 'Mapa de dominio';
    panelSub.innerHTML = 'Selecciona un <b>estado</b> para elegir entre ver su desglose municipal o la contienda estatal. Rueda para acercar; arrastra para desplazar.';
    renderMap(svg, { metric: store.mapMetric, onSelect: (slug) => { if (!zoom.wasDrag()) showStateActions(slug); } });
    renderLegend(root.querySelector('#legend'), PARTY_ORDER);
    renderStateList();
    zoom.reset();
  }

  async function drawMunicipalities(slug) {
    const estado = store.porSlug[slug];
    if (!estado) return;
    closeStateActions();
    selectedState = estado;
    mode = 'municipios';
    histControl = null;
    opControls.hidden = true;
    metricControls.hidden = false;
    legendEl.hidden = false;
    syncViewToggle();
    // Se crea un SVG nuevo: reutilizar el estatal conservaba una capa de
    // composición del hover en algunos navegadores.
    const municipalSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    municipalSvg.id = 'map';
    municipalSvg.setAttribute('aria-label', `Mapa municipal de ${estado.nombre}`);
    svg = municipalSvg;
    stage.replaceChildren(svg);
    loading.hidden = false;
    loading.innerHTML = '<span class="spinner"></span> cargando municipios…';
    try {
      const geoData = await loadMunicipios(estado);
      svg.style.display = '';
      municipalityControl = renderMunicipios(svg, estado, geoData, {
        metric: store.mapMetric,
        onSelect: (municipio) => {
          showMunicipalityPopup(municipio);
          const row = list.querySelector(`[data-cvegeo="${municipio.cvegeo}"]`);
          row?.scrollIntoView({ block: 'nearest' });
        },
      });
      panelTitle.textContent = estado.nombre;
      panelSub.innerHTML = `<b>${municipalityControl.results.length} municipios.</b> El color muestra la fuerza líder; selecciona un municipio para resaltarlo en el mapa.`;
      renderLegend(root.querySelector('#legend'), PARTY_ORDER);
      renderMunicipalityList(municipalityControl.results);
      backBtn.hidden = false;
      zoom.reset();
    } catch (error) {
      panelSub.textContent = 'No se pudieron cargar los municipios de este estado.';
      loading.innerHTML = 'No se pudieron cargar los municipios.';
      return;
    }
    loading.hidden = true;
  }

  /* ---------- Áreas de oportunidad (mapa de calor, voto 2021) ---------- */
  async function drawOpportunity(slug) {
    const estado = store.porSlug[slug];
    if (!estado) return;
    closeStateActions();
    selectedState = estado;
    mode = 'oportunidad';
    municipalityControl = null;
    const histSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    histSvg.id = 'map';
    histSvg.setAttribute('aria-label', `Áreas de oportunidad 2021 · ${estado.nombre}`);
    svg = histSvg;
    stage.replaceChildren(svg);
    loading.hidden = false;
    loading.innerHTML = '<span class="spinner"></span> cargando voto 2021…';
    try {
      const [geoData, hist] = await Promise.all([loadMunicipios(estado), loadHist2021()]);
      svg.style.display = '';
      histControl = renderMunicipiosHist(svg, geoData, {
        partido: opParty,
        hist,
        onSelect: showHistPopup,
      });
      opControls.hidden = false;
      metricControls.hidden = true;
      legendEl.hidden = true;
      syncViewToggle();
      renderOpParties();
      panelTitle.textContent = 'Áreas de oportunidad';
      panelSub.innerHTML = `Voto <b>2021</b> por municipio en ${estado.nombre}. Elige un partido: el tono más intenso marca mayor proporción de voto.`;
      renderOpList(histControl.entries);
      backBtn.hidden = false;
      zoom.reset();
    } catch (error) {
      panelSub.textContent = 'No se pudieron cargar los datos de 2021 de este estado.';
      loading.innerHTML = 'No se pudieron cargar los datos de 2021.';
      return;
    }
    loading.hidden = true;
  }

  function renderOpParties() {
    root.querySelector('#opParties').innerHTML = PARTY_ORDER.map((id) =>
      `<button class="op-party${id === opParty ? ' on' : ''}" data-party="${id}"
        aria-pressed="${id === opParty}" title="${PARTIES[id].nombre}">${partyLogo(id, 'md')}</button>`).join('');
  }

  function renderOpList(entries) {
    const sorted = [...entries].sort((a, b) => b.share - a.share);
    list.innerHTML = `<div class="dl-group">
      <div class="dl-head">${partyLogo(opParty, 'md')}<span class="dl-count">${sorted.length} municipios</span></div>
      ${sorted.map((entry) => `
        <button class="dl-row" data-opkey="${entry.key}">
          <span class="dl-name">${entry.nombre}</span>
          <span class="dl-metric">${(entry.share * 100).toFixed(1)}%</span>
        </button>`).join('')}
    </div>`;
  }

  function showHistPopup(entry) {
    pendingState = null;
    stateActions.innerHTML = `
      <button class="sa-close" data-state-action="close" aria-label="Cerrar detalle">×</button>
      <p class="sa-kicker">Municipio · ${selectedState ? selectedState.nombre : ''} · voto 2021</p>
      <h3>${entry.nombre}</h3>
      <p>${partyLogo(entry.partido, 'md')} obtuvo <b>${(entry.share * 100).toFixed(1)}%</b> del voto emitido.</p>
      <div class="sa-kpis">
        <span><b>${(entry.share * 100).toFixed(1)}%</b> proporción</span>
        <span><b>${entry.votos.toLocaleString('es-MX')}</b> votos</span>
        <span><b>${entry.m ? entry.m.votos.toLocaleString('es-MX') : '—'}</b> emitidos</span>
      </div>
      <div class="sa-buttons"><button class="sa-secondary" data-state-action="close">Cerrar</button></div>`;
    stateActions.hidden = false;
  }

  root.querySelector('.zoom-ctl').addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.z === 'in') zoom.zoomBy(1.5);
    else if (button.dataset.z === 'out') zoom.zoomBy(1 / 1.5);
    else zoom.reset();
  });
  backBtn.addEventListener('click', drawStates);

  stateActions.addEventListener('click', (event) => {
    const action = event.target.closest('[data-state-action]')?.dataset.stateAction;
    if (!action) return;
    if (action === 'close') { closeStateActions(); return; }
    if (!pendingState) return;
    if (action === 'municipios') drawMunicipalities(pendingState.slug);
    else if (action === 'contienda') navigate('/estado/' + pendingState.slug);
    else if (action === 'oportunidad') drawOpportunity(pendingState.slug);
  });

  viewToggle.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button || !selectedState || button.dataset.view === mode) return;
    if (button.dataset.view === 'oportunidad') drawOpportunity(selectedState.slug);
    else drawMunicipalities(selectedState.slug);
  });

  root.querySelector('#opParties').addEventListener('click', (event) => {
    const btn = event.target.closest('[data-party]');
    if (!btn || btn.dataset.party === opParty) return;
    opParty = btn.dataset.party;
    if (selectedState && mode === 'oportunidad') drawOpportunity(selectedState.slug);
  });

  metricToggle.querySelectorAll('button').forEach((button) => button.classList.toggle('on', button.dataset.metric === store.mapMetric));
  metricToggle.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button || button.dataset.metric === store.mapMetric) return;
    if (mode === 'oportunidad') return;
    store.mapMetric = button.dataset.metric;
    metricToggle.querySelectorAll('button').forEach((item) => item.classList.toggle('on', item === button));
    if (selectedState) drawMunicipalities(selectedState.slug);
    else drawStates();
  });

  list.addEventListener('click', (event) => {
    const stateRow = event.target.closest('[data-slug]');
    if (stateRow) { showStateActions(stateRow.dataset.slug); return; }
    const municipalityRow = event.target.closest('[data-cvegeo]');
    if (municipalityRow && municipalityControl) { municipalityControl.select(municipalityRow.dataset.cvegeo); return; }
    const opRow = event.target.closest('[data-opkey]');
    if (opRow && histControl) histControl.select(opRow.dataset.opkey);
  });

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (!selectedState) return drawStates();
      return mode === 'oportunidad' ? drawOpportunity(selectedState.slug) : drawMunicipalities(selectedState.slug);
    }, 200);
  });

  drawStates();
}
