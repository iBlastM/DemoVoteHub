// ============================================================
// views/creditos.js — Créditos y fuentes: de dónde sale cada dato,
// qué mapas, tipografías y librerías se usan y qué es ilustrativo.
// Todo lo que afirma está documentado en el proyecto (metodología,
// atribuciones de los mapas y scripts de generación de datos).
// ============================================================

import { store } from '../store.js';
import { esc } from '../utils.js';

const enlace = (href, texto) => `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(texto)}</a>`;

/** Casas encuestadoras con sondeos reales de gubernatura en el corte actual. */
function casasEncuestadoras() {
  const casas = new Set();
  for (const e of store.estados) {
    if (!e.encuestasSonReales) continue;
    for (const s of e.encuestas) if (s.casa) casas.add(s.casa);
  }
  return [...casas].sort((a, b) => a.localeCompare(b, 'es'));
}

export function render(root) {
  const casas = casasEncuestadoras();
  const nSondeos = store.estados.reduce((a, e) => a + (e.encuestasSonReales ? e.encuestas.length : 0), 0);

  root.innerHTML = `
  <article class="met">
    <section class="met-hero">
      <p class="eyebrow">Transparencia</p>
      <h1 class="met-h">Créditos y fuentes</h1>
      <p class="met-lede">Quién produce los datos que ves aquí, qué mapas, tipografías y librerías se usan, y qué partes del sitio son ilustrativas.
        Para saber cómo se calculan las cifras, consulta la <a href="#/metodologia">Metodología</a>.</p>
      <nav class="met-toc" aria-label="Secciones">
        <a href="#/creditos" data-ir="cr-datos">Datos</a>
        <a href="#/creditos" data-ir="cr-mapas">Mapas y software</a>
        <a href="#/creditos" data-ir="cr-imagenes">Imágenes</a>
        <a href="#/creditos" data-ir="cr-ilustrativo">Qué es ilustrativo</a>
      </nav>
    </section>

    <section class="met-sec" id="cr-datos">
      <h2>Datos</h2>
      <div class="met-cards">
        <article class="met-card">
          <h3>Encuestas de gubernatura</h3>
          <p>Resultados publicados por las casas encuestadoras. En el corte actual (${esc(store.updatedLabel)}) hay <b>${nSondeos}</b> sondeos con desglose por partido de:</p>
          <p class="met-dato">${casas.length ? casas.map(esc).join(', ') : '—'}</p>
          <p class="met-uso">Cada sondeo enlaza a su publicación original en la tabla «Encuestas del ciclo» del detalle de cada estado.</p>
        </article>
        <article class="met-card">
          <h3>Encuestas de alcaldía</h3>
          <p>Encuestas telefónicas por municipio de Rubrum, usadas en la vista Alcaldías 2027 y, con peso moderado, en la estimación del Mapa de dominio.</p>
        </article>
        <article class="met-card">
          <h3>Resultados electorales oficiales</h3>
          <ul>
            <li><b>Gubernatura anterior</b> de cada estado: cómputos de cada instituto electoral local (2021; 2022 en Aguascalientes y Quintana Roo).</li>
            <li><b>Diputaciones federales 2018 y 2024</b>: cómputos del INE casilla por casilla.</li>
            <li><b>Ayuntamientos 2018, 2021 y 2024</b>: base pública de resultados municipales de Eric Magar (ITAM).</li>
            <li><b>Dashboard electoral</b>: resultados por sección de Querétaro (2018, 2021 y 2024).</li>
          </ul>
        </article>
        <article class="met-card">
          <h3>Lista nominal y geografía</h3>
          <p>Padrón y lista nominal por municipio del INE (corte del 20 de agosto de 2026) y límites municipales oficiales de INEGI.</p>
        </article>
      </div>
    </section>

    <section class="met-sec" id="cr-mapas">
      <h2>Mapas y software</h2>
      <div class="met-scroll"><table class="met-t">
        <thead><tr><th scope="col">Recurso</th><th scope="col">Dónde se usa</th><th scope="col">Atribución o licencia</th></tr></thead>
        <tbody>
          <tr><th scope="row">Teselas Esri Gray Canvas</th><td>Mapa de dominio, Preferencia estatal y Alcaldías</td>
            <td>Esri, HERE, Garmin, © ${enlace('https://www.openstreetmap.org/copyright', 'colaboradores de OpenStreetMap')}</td></tr>
          <tr><th scope="row">${enlace('https://openfreemap.org', 'OpenFreeMap')}</th><td>Mapa base del Dashboard electoral</td>
            <td>Datos de © ${enlace('https://www.openstreetmap.org/copyright', 'colaboradores de OpenStreetMap')}, esquema OpenMapTiles</td></tr>
          <tr><th scope="row">${enlace('https://plotly.com/javascript/', 'Plotly.js')}</th><td>Mapa y comparativo histórico del Dashboard electoral</td><td>Licencia MIT</td></tr>
          <tr><th scope="row">Archivo, Inter y Space Grotesk</th><td>Tipografías de todo el sitio, vía ${enlace('https://fonts.google.com', 'Google Fonts')}</td><td>SIL Open Font License</td></tr>
        </tbody>
      </table></div>
    </section>

    <section class="met-sec" id="cr-imagenes">
      <h2>Imágenes</h2>
      <ul class="met-lista">
        <li><b>Logotipos de partidos.</b> Los emblemas pertenecen a sus respectivos partidos políticos y se muestran únicamente para identificarlos.</li>
        <li><b>Fotografías de candidaturas</b> del Dashboard electoral (Querétaro, 2018–2024). Provienen del tablero de origen, se reducen de tamaño para la web y se muestran con fines informativos.</li>
      </ul>
    </section>

    <section class="met-sec" id="cr-ilustrativo">
      <h2>Qué es ilustrativo</h2>
      <p>Este sitio es una demostración no oficial y no tiene valor informativo oficial. Parte de lo que muestra no son datos reales:</p>
      <ul class="met-lista">
        <li>Las series de <b>aprobación presidencial y rumbo del país</b> de la sección Encuestas son ilustrativas.</li>
        <li>El detalle por municipio del Mapa de dominio es una <b>estimación</b> del modelo, no una encuesta municipal. Cada municipio indica en qué se basa.</li>
      </ul>
    </section>
  </article>`;

  // Los índices usan enlaces con hash de la SPA: se hace el desplazamiento a mano.
  root.querySelectorAll('.met-toc a[data-ir]').forEach((a) => a.addEventListener('click', (ev) => {
    ev.preventDefault();
    document.getElementById(a.dataset.ir)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
}
