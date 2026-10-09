// ============================================================
// views/metodologia.js — Cómo se extraen, transforman y muestran
// los datos de las tres vistas: Mapa de dominio, Preferencia
// estatal y Alcaldías 2027. Las cifras (casas encuestadoras,
// cobertura, pesos y error del modelo) se leen del servicio de
// datos; si no responde, el texto se muestra sin ellas.
// ============================================================

import { apiGet } from '../api.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const fecha = (iso) => {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return `${d} de ${MESES[m - 1]} de ${y}`;
};
const pct = (x, d = 0) => (x == null ? '—' : `${(x * 100).toFixed(d)} %`);
const pp = (x) => (x == null ? '—' : `±${Number(x).toFixed(1)}`);
const ENTIDAD = {
  1: 'Aguascalientes', 2: 'Baja California', 3: 'Baja California Sur', 4: 'Campeche', 6: 'Colima', 8: 'Chihuahua',
  12: 'Guerrero', 16: 'Michoacán', 18: 'Nayarit', 19: 'Nuevo León', 22: 'Querétaro', 23: 'Quintana Roo',
  24: 'San Luis Potosí', 25: 'Sinaloa', 26: 'Sonora', 29: 'Tlaxcala', 32: 'Zacatecas',
};
const METODO = { vivienda: 'Vivienda (cara a cara)', 'cara a cara': 'Cara a cara', mixto: 'Mixta', telefonica: 'Telefónica', ivr: 'Telefónica automatizada', online: 'En línea' };

function contenido(m) {
  const e = m?.estatal, a = m?.alcaldias, mod = m?.modelo_municipal, gub = m?.gubernatura_anterior || {};
  const pesos = mod?.pesos || {};
  const pa = mod?.prueba_gubernatura?.modelos || {};
  const pb = mod?.prueba_ayuntamiento?.modelos || {};
  const casas = e?.encuestadoras?.length ? e.encuestadoras.map(esc).join(', ') : 'Mitofsky, Enkoll, BGC, Cripeso, Electoralia, Factométrica, Rubrum, SRC, ALIUS, Demoscopia Digital, entre otras';
  const calidad = e?.calidad_encuestadora ? Object.entries(e.calidad_encuestadora).sort((x, y) => y[1] - x[1]) : [];
  const metodos = e?.calidad_metodo ? Object.entries(e.calidad_metodo).sort((x, y) => y[1] - x[1]) : [];
  const fuentesMun = mod?.fuentes_por_municipio || {};
  const nHist = (fuentesMun.historial || 0) + (fuentesMun['encuesta_municipal+historial'] || 0);
  const nEnc = (fuentesMun['encuesta_municipal+historial'] || 0) + (fuentesMun['encuesta_municipal+proyeccion_estatal'] || 0);
  const nProm = fuentesMun.proyeccion_estatal || 0;
  const especiales = Object.entries(gub).filter(([, g]) => g.desglose !== 'COMPLETO');
  const fila = (nombre, r) => `<tr><th scope="row">${nombre}</th><td>${pp(r?.mae_pp)}</td><td>${pct(r?.acierto_ganador)}</td></tr>`;

  return `
  <section class="met-hero">
    <p class="eyebrow">Cómo funciona MIRADOR 2027</p>
    <h1 class="met-h">Metodología</h1>
    <p class="met-lede">De dónde salen los datos, cómo se procesan y qué significa cada color de las tres vistas principales:
      <a href="#/dominio">Mapa de dominio</a>, <a href="#/estatal">Preferencia estatal</a> y <a href="#/alcaldias">Alcaldías 2027</a>.</p>
    <nav class="met-toc" aria-label="Secciones">
      <a href="#/metodologia" data-ir="met-vistas">Las tres vistas</a>
      <a href="#/metodologia" data-ir="met-extraccion">1 · Extracción</a>
      <a href="#/metodologia" data-ir="met-transformacion">2 · Transformación</a>
      <a href="#/metodologia" data-ir="met-visualizacion">3 · Visualización</a>
      <a href="#/metodologia" data-ir="met-limites">Límites</a>
    </nav>
  </section>

  <section class="met-sec" id="met-vistas">
    <h2>Las tres vistas, en resumen</h2>
    <div class="met-scroll"><table class="met-t">
      <thead><tr><th scope="col">Vista</th><th scope="col">Qué muestra</th><th scope="col">Con qué datos</th><th scope="col">Detalle</th></tr></thead>
      <tbody>
        <tr><th scope="row"><a href="#/estatal">Preferencia estatal</a></th><td>Qué partido encabeza la gubernatura 2027 en cada estado</td><td>Encuestas públicas de gubernatura</td><td>Estado</td></tr>
        <tr><th scope="row"><a href="#/alcaldias">Alcaldías 2027</a></th><td>Preferencia por partido para presidencia municipal</td><td>Encuestas municipales de Rubrum</td><td>Solo municipios encuestados${a ? ` (${a.municipios_con_encuesta} de ${a.municipios_total})` : ''}</td></tr>
        <tr><th scope="row"><a href="#/dominio">Mapa de dominio</a></th><td>Gubernatura 2027 estimada en todos los municipios, y comparación con la elección anterior</td><td>Encuestas estatales + resultados oficiales de elecciones pasadas + encuestas de alcaldía</td><td>Los ${a?.municipios_total || 680} municipios</td></tr>
      </tbody>
    </table></div>
    <p class="met-nota">Las encuestas de gubernatura se publican por estado: <b>no existe una encuesta pública de gubernatura por municipio</b>. Por eso el detalle municipal del Mapa de dominio es una estimación, explicada en la sección 2.</p>
  </section>

  <section class="met-sec" id="met-extraccion">
    <p class="met-num">1</p>
    <h2>Extracción: de dónde salen los datos</h2>
    <p>Un programa revisa las fuentes de forma automática <b>cada 12 horas</b>, descarga lo nuevo y vuelve a calcular todo. Si una fuente no responde, se conserva su último dato y se reintenta en la siguiente vuelta.</p>
    <div class="met-cards">
      <article class="met-card">
        <h3>Encuestas de gubernatura</h3>
        <p>Se leen las publicaciones de ${casas}: artículos, documentos PDF e imágenes con resultados por partido para la gubernatura de cada uno de los 17 estados.</p>
        <p class="met-dato">${e ? `<b>${e.sondeos}</b> sondeos · corte ${fecha(e.fecha_calculo)}` : ''}</p>
        <p class="met-uso">Se usa en: Preferencia estatal, Mapa de dominio y el resto del sitio.</p>
      </article>
      <article class="met-card">
        <h3>Encuestas de alcaldía</h3>
        <p>Rubrum publica encuestas telefónicas por municipio con la pregunta <q>Si el día de hoy fuera la elección para presidente municipal, ¿por cuál partido político votaría usted?</q>. Los resultados vienen como imagen y se leen automáticamente.</p>
        <p class="met-dato">${a ? `<b>${a.municipios_con_encuesta}</b> municipios · <b>${a.pct_lista_nominal_cubierta} %</b> de la lista nominal de los 17 estados` : ''}</p>
        <p class="met-uso">Se usa en: Alcaldías 2027 y, con peso moderado, en el Mapa de dominio.</p>
      </article>
      <article class="met-card">
        <h3>Resultados electorales oficiales</h3>
        <ul>
          <li><b>Gubernatura anterior</b> de cada estado (2021; 2022 en Aguascalientes y Quintana Roo), de los cómputos de cada instituto electoral local.</li>
          <li><b>Diputaciones federales 2024 y 2018</b>, cómputos del INE casilla por casilla, sumados por municipio con el catálogo de casillas del propio INE.</li>
          <li><b>Ayuntamientos 2018, 2021 y 2024</b> por municipio, de la base pública de resultados municipales de Eric Magar (ITAM).</li>
        </ul>
        <p class="met-uso">Se usa en: Mapa de dominio (estimación municipal y capas Cambio y Oportunidad).</p>
      </article>
      <article class="met-card">
        <h3>Lista nominal y municipios</h3>
        <p>Padrón y lista nominal por municipio del INE (corte del 20 de agosto de 2026) y límites municipales oficiales de INEGI.</p>
        <p class="met-uso">Se usa para ponderar municipios, calcular apoyo estimado en personas y dibujar el mapa.</p>
      </article>
    </div>
  </section>

  <section class="met-sec" id="met-transformacion">
    <p class="met-num">2</p>
    <h2>Transformación: cómo se procesan</h2>

    <h3 class="met-h3">2.1 Limpieza de las encuestas estatales</h3>
    <ul class="met-lista">
      <li>Solo se conserva la intención de voto <b>por partido</b> para gubernatura. Se descartan los careos entre candidatos concretos, porque dependen de nombres que aún no están definidos.</li>
      <li>Algunas casas preguntan por "fidelidad" o identificación partidista en vez de intención de voto. Esos resultados se ajustan con un factor para hacerlos comparables (por ejemplo, la fidelidad a Morena suele exceder ~8 % su intención de voto).</li>
      <li>Cuando una casa publica resultado "bruto" y "efectivo" de la misma encuesta, se usa solo el bruto para no contarla dos veces. Se eliminan duplicados y porcentajes imposibles.</li>
    </ul>

    <h3 class="met-h3">2.2 Promedio de encuestas por estado</h3>
    <p>Cada estado es un promedio ponderado de sus encuestas. El peso de una encuesta es el producto de cuatro factores:</p>
    <div class="met-cards met-cards-4">
      <div class="met-mini"><b>Recencia</b><span>El peso se reduce a la mitad cada ${e?.vida_media_dias || 30} días.</span></div>
      <div class="met-mini"><b>Tamaño de muestra</b><span>Crece con la raíz cuadrada de la muestra, hasta 2 500 entrevistas.</span></div>
      <div class="met-mini"><b>Casa encuestadora</b><span>Calificación según trayectoria y metodología (tabla abajo).</span></div>
      <div class="met-mini"><b>Modo de levantamiento</b><span>Vivienda y cara a cara pesan más que teléfono o internet.</span></div>
    </div>
    <p>Después se aplica un <b>suavizado de tendencia</b> (filtro de Kalman): cada encuesta nueva mueve el promedio, pero no lo hace saltar por completo. Así una encuesta atípica no cambia de golpe el resultado.</p>
    ${calidad.length ? `<details class="met-det"><summary>Calificaciones usadas</summary>
      <div class="met-dos">
        <table class="met-t met-t-sm"><thead><tr><th scope="col">Casa</th><th scope="col">Calificación</th></tr></thead>
          <tbody>${calidad.map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td>${v.toFixed(2)}</td></tr>`).join('')}</tbody></table>
        <table class="met-t met-t-sm"><thead><tr><th scope="col">Modo</th><th scope="col">Factor</th></tr></thead>
          <tbody>${metodos.map(([k, v]) => `<tr><th scope="row">${esc(METODO[k] || k)}</th><td>${v.toFixed(2)}</td></tr>`).join('')}</tbody></table>
      </div></details>` : ''}
    <p><b>Probabilidad de victoria por estado.</b> Se simula la elección miles de veces moviendo a cada partido según la dispersión de sus encuestas. A más distancia de la jornada (6 de junio de 2027), mayor incertidumbre; por eso el margen de error se va reduciendo con el tiempo.</p>

    <h3 class="met-h3">2.3 Encuestas de alcaldía</h3>
    <ul class="met-lista">
      <li>Cada imagen se lee con reconocimiento de texto. El partido de cada barra se identifica por su color y por el orden fijo en que Rubrum presenta los partidos.</li>
      <li><b>Control de calidad:</b> solo se acepta una lectura si sus porcentajes suman entre 97 % y 103 % y no se repite ningún partido. Las que no pasan se descartan, no se adivinan.</li>
      <li>El nombre del municipio se empata con el catálogo oficial (por ejemplo, "Cancún" corresponde al municipio de Benito Juárez).</li>
      <li>Varios sondeos de un municipio se promedian igual que las encuestas estatales.</li>
    </ul>

    <h3 class="met-h3">2.4 Estimación por municipio (Mapa de dominio)</h3>
    <p>Como no hay encuestas de gubernatura por municipio, cada municipio se estima en cuatro pasos:</p>
    <ol class="met-pasos">
      <li><b>Patrón histórico.</b> Se toma cómo votó el municipio en elecciones oficiales anteriores.
        Por ejemplo, si en la gubernatura anterior un partido sacó en un municipio el doble que en todo el estado, se parte de que ahí sigue siendo más fuerte.</li>
      <li><b>Ajuste a hoy.</b> Ese patrón se mueve según lo que cambió cada partido en su estado: si las encuestas actuales le dan a un partido 20 % más que en esa elección, se le sube 20 % en cada municipio.</li>
      <li><b>Combinación.</b> Se mezclan varias elecciones y una parte del promedio estatal, con los pesos que mejor funcionaron al probar el método con elecciones pasadas:
        <div class="met-scroll"><table class="met-t met-t-sm">
          <thead><tr><th scope="col">Insumo</th><th scope="col">Peso</th></tr></thead>
          <tbody>
            <tr><th scope="row">Gubernatura anterior</th><td>${pct(pesos.misma_eleccion)}</td></tr>
            <tr><th scope="row">Diputaciones federales 2024</th><td>${pct(pesos.federal)}</td></tr>
            <tr><th scope="row">Ayuntamiento 2024</th><td>${pct(pesos.otra_local)}</td></tr>
            <tr><th scope="row">Promedio estatal (acercar al promedio)</th><td>${pct(pesos.uniforme)}</td></tr>
          </tbody></table></div>
        Donde hay encuesta de alcaldía, se le da entre 30 % y 40 % de peso según el número de sondeos. Es un peso moderado porque mide otra elección.</li>
      <li><b>Cuadre estatal.</b> Se ajustan todos los municipios para que, sumados según su lista nominal, den exactamente el promedio de encuestas del estado.</li>
    </ol>
    ${nHist ? `<p>Resultado actual: <b>${nHist}</b> municipios estimados con su historial electoral${nEnc ? `, de los cuales <b>${nEnc}</b> también tienen encuesta de alcaldía` : ''}${nProm ? `; <b>${nProm}</b> sin elecciones previas usan el promedio estatal` : ''}.</p>` : ''}

    <p><b>Coaliciones.</b> En algunas boletas los votos de una coalición no se separan por partido.
      Esos votos se reparten entre sus partidos en proporción a lo que cada uno sacó por separado en la misma casilla o, si no hay ese dato, a su votación federal 2024 en el municipio.
      ${especiales.length ? `Esto aplica sobre todo a ${especiales.map(([k]) => ENTIDAD[k]).join(', ')}, donde el instituto no publicó todos los partidos por separado.` : ''}</p>

    <h3 class="met-h3">2.5 ¿Qué tan preciso es? Prueba con elecciones pasadas</h3>
    <p>Para medir el error se "predijo" la <b>gubernatura anterior</b> de cada municipio usando solo datos de tres años antes (ayuntamiento y diputaciones federales de 2018) y el resultado estatal real, y se comparó con lo que de verdad pasó.</p>
    <div class="met-scroll"><table class="met-t">
      <thead><tr><th scope="col">Método</th><th scope="col" title="Diferencia promedio entre lo estimado y lo real, por partido y municipio">Error promedio (puntos)</th><th scope="col">Acierta al primer lugar</th></tr></thead>
      <tbody>
        ${fila('Mismo porcentaje del estado en todos los municipios', pa.uniforme)}
        ${fila('Solo patrón de ayuntamientos', pa.solo_ayuntamiento)}
        ${fila('Solo patrón federal', pa.solo_federal)}
        ${fila('<b>Combinación usada en el sitio</b>', pa.combinado)}
      </tbody></table></div>
    <p class="met-nota">${pa.combinado ? `En promedio, la estimación de cada partido en un municipio se desvió <b>${pp(pa.combinado.mae_pp)} puntos</b>${pa.combinado.municipios ? ` (${pa.combinado.municipios} municipios probados)` : ''}. ` : ''}
      Una segunda prueba con ayuntamientos 2024${pb.combinado ? ` (error ${pp(pb.combinado.mae_pp)} puntos)` : ''} sirvió para decidir cuánto pesa la elección del mismo cargo frente a las demás.
      Ambas pruebas suponen conocido el resultado estatal: miden el error del reparto entre municipios, no el de las encuestas.</p>
  </section>

  <section class="met-sec" id="met-visualizacion">
    <p class="met-num">3</p>
    <h2>Visualización: cómo leer cada vista</h2>
    <div class="met-cards">
      <article class="met-card">
        <h3><a href="#/dominio">Mapa de dominio</a></h3>
        <ul>
          <li><b>Margen:</b> color del partido que encabeza; más intenso, más ventaja. Con «Probabilidad» la intensidad indica la confianza de que ese partido vaya adelante.</li>
          <li><b>Ganador:</b> solo el color del primer lugar.</li>
          <li><b>Cambio:</b> contra el partido que gobierna o contra el resultado de la gubernatura anterior.</li>
          <li><b>Oportunidad:</b> voto real de un partido en la gubernatura anterior, municipio por municipio.</li>
          <li><b>Picos 3D:</b> la altura es la lista nominal del municipio.</li>
          <li>Al seleccionar municipios, la tabla suma sus estimaciones según su lista nominal. "Apoyo estimado" es porcentaje × lista nominal, no votos.</li>
        </ul>
      </article>
      <article class="met-card">
        <h3><a href="#/estatal">Preferencia estatal</a></h3>
        <ul>
          <li>Solo se dibujan estados: estas encuestas no tienen detalle municipal.</li>
          <li><b>Margen:</b> intensidad por la ventaja del primer lugar. <b>Partido:</b> intensidad por el porcentaje de un partido.</li>
          <li>Al elegir un estado se ve el promedio por partido, el rango entre encuestas y las encuestas recientes con enlace a su publicación.</li>
        </ul>
      </article>
      <article class="met-card">
        <h3><a href="#/alcaldias">Alcaldías 2027</a></h3>
        <ul>
          <li>Solo se colorean los municipios con encuesta; el resto queda en <b>gris</b>. No se rellenan con estimaciones.</li>
          <li><b>Indecisos:</b> intensidad por el porcentaje que "aún no decide".</li>
          <li>Cada municipio muestra el promedio de sus sondeos, el más reciente y enlaces a la publicación e imagen originales.</li>
        </ul>
      </article>
    </div>
  </section>

  <section class="met-sec" id="met-limites">
    <h2>Límites y advertencias</h2>
    <ul class="met-lista">
      <li>Las encuestas públicas tienen margen de error y pueden tener sesgos; el promedio los reduce, pero no los elimina. Faltan meses para la elección y las preferencias cambiarán.</li>
      <li>La estimación municipal supone que cada municipio mantiene su forma de votar relativa al estado. Candidaturas locales, alianzas nuevas o cambios fuertes pueden romper ese patrón.</li>
      <li>Las encuestas de alcaldía son de una sola casa, telefónicas automatizadas y miden otra elección.</li>
      <li>La lectura automática de imágenes puede fallar; por eso se descartan las lecturas dudosas en lugar de corregirlas a mano.</li>
      ${especiales.length ? `<li>En ${especiales.map(([k]) => ENTIDAD[k]).join(', ')} la gubernatura anterior no tiene desglose completo por partido: el reparto de coaliciones es una estimación y el sitio lo indica en cada caso.</li>` : ''}
      <li>Las series de aprobación presidencial, rumbo del país e identificación partidista de la sección Encuestas son ilustrativas.</li>
      <li>Este es un sitio demostrativo y no oficial.</li>
    </ul>
  </section>`;
}

export function render(root) {
  let alive = true;
  root.innerHTML = `<article class="met">${contenido(null)}</article>`;
  const art = root.querySelector('.met');
  const ir = (e) => {
    const a = e.target.closest('[data-ir]');
    if (!a) return;
    e.preventDefault();
    document.getElementById(a.dataset.ir)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  art.addEventListener('click', ir);
  apiGet('/api/v1/metodologia').then((m) => {
    if (!alive) return;
    const y = window.scrollY;
    art.innerHTML = contenido(m);
    window.scrollTo({ top: y });
  }).catch(() => { /* sin cifras dinámicas: el texto ya está */ });
  return () => { alive = false; art.removeEventListener('click', ir); };
}
