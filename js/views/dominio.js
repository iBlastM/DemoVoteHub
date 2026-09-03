// ============================================================
// views/dominio.js — Mapa de dominio con selector de acciones
// por estado y drill-down estado → municipio.
// ============================================================

import { store } from '../store.js';
import { PARTIES, PARTY_ORDER } from '../config.js';
import { renderMap, renderLegend, renderMunicipios, renderMunicipiosHist, loadMunicipios, stateCve } from '../map.js';
import { loadHist2021 } from '../hist2021.js';
import { createTileLayer } from '../tiles.js';
import { loadPadron, statsEstado, statsMunicipio, fmtNum } from '../padron.js';
import { createZoom } from '../zoom.js';
import { navigate } from '../router.js';
import { partyLogo } from '../components.js';
import { pct, slugify } from '../utils.js';

export function render(root) {
  root.innerHTML = `
  <section class="dom-fs">
    <div class="dom-map">
      <canvas class="tile-canvas" id="tiles" aria-hidden="true"></canvas>
      <div class="map-stage dom-stage" id="stage"><svg id="map" aria-label="Mapa de dominio electoral"></svg></div>
      <button class="dom-back" id="backBtn" hidden>← Todos los estados</button>
      <button class="panel-show" id="panelShow" hidden aria-label="Mostrar panel">☰ Panel</button>
      <span class="map-attr">© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a></span>

      <div class="zoom-ctl">
        <button data-z="in" aria-label="Acercar">+</button>
        <button data-z="out" aria-label="Alejar">−</button>
        <button data-z="reset" aria-label="Restablecer vista">⟳</button>
      </div>

      <div class="map-loading" id="mapLoading" hidden><span class="spinner"></span> cargando municipios…</div>
    </div>

    <aside class="dom-panel">
      <button class="panel-hide" id="panelHide" aria-label="Ocultar panel" title="Ocultar panel">–</button>
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
      <div class="panel-tabs seg" id="panelTabs" role="tablist" aria-label="Contenido del panel">
        <button data-panel-tab="lista" class="on" role="tab" aria-selected="true">Lista</button>
        <button data-panel-tab="detalle" role="tab" aria-selected="false" disabled>Detalle</button>
      </div>
      <div class="legend legend-lg" id="legend"></div>
      <div class="dp-list" id="domList"></div>
      <div class="dp-detail" id="domDetail" hidden aria-live="polite"></div>
      <p class="dp-foot">Actualizado ${store.updatedLabel} · Proyección estatal basada en encuestas públicas · <span class="ficticio">mapa municipal ficticio</span></p>
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
  const detail = root.querySelector('#domDetail');
  const panelTabs = root.querySelector('#panelTabs');
  const detailTab = panelTabs.querySelector('[data-panel-tab="detalle"]');
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
  let detailState = null;
  let activePanelTab = 'lista';
  let municipalityControl = null;
  let histControl = null;
  let mode = 'estados';        // 'estados' | 'municipios' | 'oportunidad'
  let opParty = 'PAN';         // partido del mapa de calor 2021
  let padronData = store.padronData;
  const ensurePadron = async () => {
    if (padronData?.estados) return padronData;
    padronData = await loadPadron();
    return padronData;
  };
  ensurePadron();              // precarga ligera; main.js normalmente ya lo resolvió

  function activatePanelTab(tab) {
    if (tab === 'detalle' && detailTab.disabled) return;
    activePanelTab = tab;
    list.hidden = tab !== 'lista';
    detail.hidden = tab !== 'detalle';
    panelTabs.querySelectorAll('button').forEach((button) => {
      const active = button.dataset.panelTab === tab;
      button.classList.toggle('on', active);
      button.setAttribute('aria-selected', String(active));
    });
  }

  function openDetail(markup, estado = null) {
    detailState = estado;
    detail.innerHTML = markup;
    detailTab.disabled = false;
    activatePanelTab('detalle');
  }

  function clearDetail() {
    detailState = null;
    detail.innerHTML = '';
    detailTab.disabled = true;
    activatePanelTab('lista');
  }

  store.mapMetric = store.mapMetric || 'prob';
  // Algunos nombres del GeoJSON estatal tienen problemas de codificación; la
  // clave INEGI evita que eso afecte la selección de las 17 entidades demo.
  for (const estado of store.estados) {
    const cve = stateCve(estado);
    const feature = store.geoData.features.find((item) => String(item.properties.cvegeo).padStart(2, '0') === cve);
    if (feature) store.porSlug[slugify(feature.properties.nom_edo)] = estado;
  }

  const tiles = createTileLayer(root.querySelector('#tiles'));
  function syncTiles() {
    const vb = svg.getAttribute('viewBox');
    if (vb) tiles.setViewBox(vb.trim().split(/\s+/).map(Number));
  }

  let zoom;
  function onApply(state) {
    const layer = stage.querySelector('.municipal-canvas') || svg;
    layer.style.transformOrigin = '0 0';
    layer.style.transform = (state.scale === 1 && state.tx === 0 && state.ty === 0)
      ? '' : `translate(${state.tx}px, ${state.ty}px) scale(${state.scale})`;
    tiles.update(state);
  }
  zoom = createZoom(stage, { min: 1, max: 18, onApply });

  function supportByParty(apoyos) {
    const fuerzas = Object.entries(apoyos || {})
      .filter(([id, valor]) => PARTIES[id] && Number.isFinite(valor))
      .sort(([, a], [, b]) => b - a);
    if (!fuerzas.length) return '';
    return `<section class="dp-support">
      <h4>Apoyo potencial por partido</h4>
      ${fuerzas.map(([id, valor]) => `<div class="dp-support-row">
        <span>${partyLogo(id, 'xs')} ${PARTIES[id].nombre}</span>
        <b>${fmtNum(valor)}</b>
      </div>`).join('')}
    </section>`;
  }

  async function showStateDetail(slug) {
    const estado = store.porSlug[slug];
    if (!estado) return;
    const st = statsEstado(await ensurePadron(), stateCve(estado));
    openDetail(`
      <div class="dp-detail-head">
        <p class="dp-kicker">${estado.region} · Estado</p>
        <h3>${estado.nombre}</h3>
        <p>${partyLogo(estado.favorito, 'md')} lidera la contienda.</p>
      </div>
      <div class="dp-kpis">
        <span><b>${pct(estado.probFav)}</b> probabilidad</span>
        <span><b>+${estado.margen.toFixed(1)} pp</b> margen</span>
        <span><b>${estado.estatus.label}</b> estatus</span>
      </div>
      ${st ? `<div class="dp-kpis">
        <span><b>${fmtNum(st[0])}</b> padrón</span>
        <span><b>${fmtNum(st[1])}</b> lista nominal</span>
        <span><b>${fmtNum(st[2])}</b> LN extranjero</span>
      </div>` : ''}
      ${supportByParty(estado.votantesEstimados)}
      <div class="dp-detail-actions">
        <button class="sa-primary" data-detail-action="municipios">Ver municipios</button>
        <button class="sa-secondary" data-detail-action="contienda">Ver contienda estatal</button>
        ${estado.slug === 'queretaro' ? '<button class="sa-secondary" data-detail-action="oportunidad">Áreas de oportunidad 2021</button>' : ''}
        <button class="sa-secondary" data-detail-action="lista">← Volver a la lista</button>
      </div>`, estado);
  }

  function showMunicipalityDetail(municipio) {
    const st = statsMunicipio(padronData, municipio.cvegeo);
    const apoyos = st ? Object.fromEntries(
      Object.entries(selectedState?.voto || {})
        .filter(([id]) => PARTIES[id])
        .map(([id, proporcion]) => [id, Math.round(st[1] * proporcion)]),
    ) : {};
    openDetail(`
      <div class="dp-detail-head">
        <p class="dp-kicker">Municipio · ${selectedState?.nombre || ''}</p>
        <h3>${municipio.name}</h3>
        <p>${partyLogo(municipio.favorito, 'md')} lidera la contienda municipal.</p>
      </div>
      <div class="dp-kpis">
        <span><b>${pct(municipio.probFav)}</b> probabilidad</span>
        <span><b>+${municipio.margen.toFixed(1)} pp</b> margen</span>
        <span><b>${selectedState?.estatus.label || 'Local'}</b> referencia estatal</span>
      </div>
      ${st ? `<div class="dp-kpis">
        <span><b>${fmtNum(st[0])}</b> padrón</span>
        <span><b>${fmtNum(st[1])}</b> lista nominal</span>
      </div>
      ${supportByParty(apoyos)}` : '<p class="dp-note">El archivo fuente del INE no desagrega padrón ni lista nominal para este municipio.</p>'}
      <div class="dp-detail-actions">
        <button class="sa-secondary" data-detail-action="lista">← Volver a municipios</button>
      </div>`);
  }

  function renderStateList() {
    const grupos = PARTY_ORDER
      .map((id) => ({ id, estados: store.estados.filter((estado) => estado.favorito === id).sort((a, b) => b.probFav - a.probFav) }))
      .filter((grupo) => grupo.estados.length);
    list.innerHTML = grupos.map((grupo) => {
      return `<div class="dl-group">
        <div class="dl-head">${partyLogo(grupo.id, 'md')}<span class="dl-count">${grupo.estados.length}</span></div>
        ${grupo.estados.map((estado) => `<button class="dl-row" data-slug="${estado.slug}">
          <span class="dl-name">
            <span>${estado.nombre}${estado.flip ? ' <span class="flip-tag sm">cambia</span>' : ''}</span>
            <span class="dl-electoral">LN ${fmtNum(estado.listaNominal)} · detalle por partido</span>
          </span>
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
        const st = statsMunicipio(padronData, municipio.cvegeo);
        const listaNominal = st ? st[1] : null;
        const electoral = st
          ? `LN ${fmtNum(listaNominal)} · detalle por partido`
          : 'LN no disponible en fuente INE';
        return `<button class="dl-row" data-cvegeo="${municipio.cvegeo}">
          <span class="dl-name">
            <span><span class="pdot" style="background:${party.color}"></span>${municipio.name}</span>
            <span class="dl-electoral">${electoral}</span>
          </span>
          <span class="dl-metric">${value}</span>
        </button>`;
      }).join('')}
    </div>`;
  }

  function drawStates() {
    clearDetail();
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
    renderMap(svg, { metric: store.mapMetric, onSelect: (slug) => { if (!zoom.wasDrag()) showStateDetail(slug); } });
    renderLegend(root.querySelector('#legend'), PARTY_ORDER);
    renderStateList();
    syncTiles();
    zoom.reset();
  }

  async function drawMunicipalities(slug) {
    const estado = store.porSlug[slug];
    if (!estado) return;
    clearDetail();
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
          showMunicipalityDetail(municipio);
          const row = list.querySelector(`[data-cvegeo="${municipio.cvegeo}"]`);
          row?.scrollIntoView({ block: 'nearest' });
        },
      });
      panelTitle.textContent = estado.nombre;
      panelSub.innerHTML = `<b>${municipalityControl.results.length} municipios · ${fmtNum(estado.listaNominal)} personas en lista nominal.</b> El color muestra la fuerza líder; cada fila incluye su lista nominal y apoyo potencial estimado.`;
      renderLegend(root.querySelector('#legend'), PARTY_ORDER);
      renderMunicipalityList(municipalityControl.results);
      backBtn.hidden = false;
      syncTiles();
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
    clearDetail();
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
        onSelect: showHistDetail,
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
      syncTiles();
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

  function showHistDetail(entry) {
    openDetail(`
      <div class="dp-detail-head">
        <p class="dp-kicker">Municipio · ${selectedState ? selectedState.nombre : ''} · voto 2021</p>
        <h3>${entry.nombre}</h3>
        <p>${partyLogo(entry.partido, 'md')} obtuvo <b>${(entry.share * 100).toFixed(1)}%</b> del voto emitido.</p>
      </div>
      <div class="dp-kpis">
        <span><b>${(entry.share * 100).toFixed(1)}%</b> proporción</span>
        <span><b>${entry.votos.toLocaleString('es-MX')}</b> votos</span>
        <span><b>${entry.m ? entry.m.votos.toLocaleString('es-MX') : '—'}</b> emitidos</span>
      </div>
      <div class="dp-detail-actions"><button class="sa-secondary" data-detail-action="lista">← Volver a municipios</button></div>`);
  }

  root.querySelector('.zoom-ctl').addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.z === 'in') zoom.zoomBy(1.5);
    else if (button.dataset.z === 'out') zoom.zoomBy(1 / 1.5);
    else zoom.reset();
  });
  backBtn.addEventListener('click', drawStates);

  panelTabs.addEventListener('click', (event) => {
    const button = event.target.closest('[data-panel-tab]');
    if (!button || button.disabled) return;
    activatePanelTab(button.dataset.panelTab);
  });

  detail.addEventListener('click', (event) => {
    const action = event.target.closest('[data-detail-action]')?.dataset.detailAction;
    if (!action) return;
    if (action === 'lista') { activatePanelTab('lista'); return; }
    if (!detailState) return;
    if (action === 'municipios') drawMunicipalities(detailState.slug);
    else if (action === 'contienda') navigate('/estado/' + detailState.slug);
    else if (action === 'oportunidad') drawOpportunity(detailState.slug);
  });

  viewToggle.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button || !selectedState || button.dataset.view === mode) return;
    if (button.dataset.view === 'oportunidad') drawOpportunity(selectedState.slug);
    else drawMunicipalities(selectedState.slug);
  });

  // Panel lateral ocultable.
  const panelEl = root.querySelector('.dom-panel');
  const panelShow = root.querySelector('#panelShow');
  root.querySelector('#panelHide').addEventListener('click', () => {
    panelEl.classList.add('is-hidden');
    panelShow.hidden = false;
    tiles.resize();
  });
  panelShow.addEventListener('click', () => {
    panelEl.classList.remove('is-hidden');
    panelShow.hidden = true;
    tiles.resize();
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
    if (stateRow) { showStateDetail(stateRow.dataset.slug); return; }
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
