// ============================================================
// escenario_ui.js — Interfaz del simulador de escenarios:
// botón en la barra superior, panel "Ajustar el resultado" y la
// franja que avisa que lo que se ve es hipotético. La lógica está
// en escenario.js.
// ============================================================

import { store } from './store.js';
import { PARTIES } from './config.js';
import { partyLogo, probBar, statusTag } from './components.js';
import { pct, signed, esc, fechaLarga } from './utils.js';
import {
  METODOS, fijarVoto, fijarMetodo, restablecerEstado, restablecerTodo, hayEscenario, estadosModificados,
  votoActual, votoEditable, metodoActual, resumenBase, guardarActual, listarGuardados, cargarGuardado, eliminarGuardado,
} from './escenario.js';

const nombreFuerza = (k) => (k === 'Otros' ? 'Otros' : PARTIES[k]?.nombre || k);
const fmt1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : '—');
const slugDeLaRuta = () => (location.hash.match(/^#\/estado\/([^/?]+)/) || [])[1] || null;

export function iniciarEscenarios() {
  const btn = document.getElementById('escBtn');
  const franja = document.getElementById('escStrip');
  if (!btn || !franja) return;
  btn.hidden = false;

  let abierto = false;
  let slugSel = null;
  let filasDe = null; // slug cuyas filas (deslizadores) están dibujadas

  /* ---------- Estructura del panel ---------- */
  const panel = document.createElement('aside');
  panel.className = 'esc';
  panel.id = 'escPanel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-labelledby', 'escTitulo');
  panel.hidden = true;
  panel.innerHTML = `
    <header class="esc-h">
      <div>
        <h2 id="escTitulo">Ajustar el resultado</h2>
        <p class="esc-sub">Escenario hipotético: no es el pronóstico.</p>
      </div>
      <button class="esc-x" type="button" data-act="cerrar" aria-label="Cerrar el simulador">
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5.5 5.5 9 9M14.5 5.5l-9 9"/></svg>
      </button>
    </header>
    <div class="esc-tabs" role="tablist" aria-label="Secciones del simulador">
      <button type="button" role="tab" id="escT-estado" aria-controls="escV-estado" aria-selected="true" data-tab="estado">Por estado</button>
      <button type="button" role="tab" id="escT-guardados" aria-controls="escV-guardados" aria-selected="false" tabindex="-1" data-tab="guardados">Guardados</button>
    </div>
    <div class="esc-body" id="escV-estado" role="tabpanel" aria-labelledby="escT-estado">
      <label class="esc-sel"><span>Estado</span><select id="escEstado"></select></label>
      <div class="esc-res" id="escRes" aria-live="polite"></div>
      <p class="esc-note">Mueve un partido: los demás, y «Otros», se reacomodan en proporción hasta sumar 100 %.</p>
      <div class="esc-rows" id="escFilas"></div>
      <div class="esc-suma"><span id="escSuma"></span><button type="button" class="esc-link" data-act="reset-estado">Restablecer estado</button></div>
      <div class="esc-nac" id="escNac"></div>
    </div>
    <div class="esc-body" id="escV-guardados" role="tabpanel" aria-labelledby="escT-guardados" hidden>
      <form class="esc-guardar" id="escGuardar">
        <label class="esc-sel"><span>Nombre del escenario</span><input id="escNombre" type="text" maxlength="40" autocomplete="off" placeholder="Ej. PAN sube 8 puntos en Querétaro"></label>
        <button type="submit" class="esc-btn-p" id="escGuardarBtn">Guardar el escenario actual</button>
      </form>
      <p class="esc-msg" id="escMsg" role="status"></p>
      <ul class="esc-lista" id="escLista"></ul>
    </div>
    <footer class="esc-f">
      <label class="esc-sel"><span>Cómo llega el cambio a cada municipio</span><select id="escMetodo"></select></label>
      <p class="esc-ayuda" id="escAyuda"></p>
      <button type="button" class="esc-btn-s" data-act="reset-todo">Restablecer todo</button>
    </footer>`;
  document.body.appendChild(panel);

  const $ = (s) => panel.querySelector(s);
  const selEstado = $('#escEstado'), filas = $('#escFilas'), resEl = $('#escRes'), sumaEl = $('#escSuma'), nacEl = $('#escNac');
  const selMetodo = $('#escMetodo'), ayudaEl = $('#escAyuda'), listaEl = $('#escLista'), msgEl = $('#escMsg');
  const nombreEl = $('#escNombre'), guardarBtn = $('#escGuardarBtn');

  selEstado.innerHTML = store.estados.map((e) => `<option value="${e.slug}">${esc(e.nombre)}</option>`).join('');
  selMetodo.innerHTML = METODOS.map((m) => `<option value="${m.id}">${m.nombre}</option>`).join('');

  /* ---------- Altura de la barra superior (el panel se coloca debajo) ---------- */
  const topbar = document.querySelector('.topbar');
  const medirBarra = () => document.documentElement.style.setProperty('--topbar-h', `${topbar.offsetHeight}px`);
  new ResizeObserver(medirBarra).observe(topbar);
  medirBarra();
  new ResizeObserver(() => document.documentElement.style.setProperty('--strip-h', `${franja.offsetHeight}px`)).observe(franja);

  /* ---------- Estado seleccionado ---------- */
  const estadoSel = () => store.porSlug[slugSel];
  function elegir(slug) {
    if (!store.porSlug[slug]) return;
    slugSel = slug;
    selEstado.value = slug;
  }
  function estadoInicial() {
    const deRuta = slugDeLaRuta();
    if (deRuta && store.porSlug[deRuta]) return deRuta;
    if (slugSel) return slugSel;
    return [...store.estados].sort((a, b) => a.base.margen - b.base.margen)[0].slug; // la contienda más cerrada
  }

  /* ---------- Pintado ---------- */
  function construirFilas(e) {
    const base = votoEditable(e.base);
    const orden = [...Object.keys(e.base.votoPct)].sort((a, b) => base[b] - base[a]).concat('Otros');
    filas.innerHTML = orden.map((k) => `
      <div class="esc-row" data-p="${k}" style="--c:${PARTIES[k]?.color || 'var(--muted)'}">
        <span class="esc-lbl">${k === 'Otros' ? '<span class="esc-otros">Otros</span>' : partyLogo(k, 'xs')}<small>pronóstico ${fmt1(base[k])}</small></span>
        <input class="esc-rng" type="range" min="0" max="100" step="0.1" aria-label="${esc(nombreFuerza(k))}, puntos porcentuales">
        <input class="esc-num" type="number" min="0" max="100" step="0.1" inputmode="decimal" aria-label="${esc(nombreFuerza(k))}, valor en puntos">
      </div>`).join('');
    filasDe = e.slug;
  }

  function pintarFilas(e) {
    if (filasDe !== e.slug) construirFilas(e);
    const vec = votoActual(e);
    const base = votoEditable(e.base);
    let suma = 0;
    for (const fila of filas.children) {
      const k = fila.dataset.p;
      const v = vec[k] ?? 0;
      suma += v;
      fila.querySelector('.esc-rng').value = v.toFixed(1);
      fila.querySelector('.esc-rng').style.setProperty('--fill', `${v}%`);
      const num = fila.querySelector('.esc-num');
      if (document.activeElement !== num) num.value = v.toFixed(1); // no pisar lo que se está escribiendo
      fila.classList.toggle('is-mod', Math.abs(v - base[k]) >= 0.05);
    }
    sumaEl.textContent = `Suma ${suma.toFixed(1)} %`;
  }

  function pintarResultado(e) {
    const fav = PARTIES[e.favorito];
    const mod = estadosModificados().includes(e);
    const b = e.base;
    resEl.innerHTML = `
      <div class="esc-res-top">
        ${partyLogo(e.favorito, 'md')}
        <div class="esc-res-k"><b style="color:${fav?.color || 'inherit'}">${pct(e.probFav)}</b><span>prob. de victoria · margen ${signed(e.margen)}</span></div>
        ${statusTag(e)}
      </div>
      ${probBar(e)}
      <p class="esc-res-cmp">${e.flip ? `<b>Cambiaría a ${esc(nombreFuerza(e.favorito))}</b> (hoy gobierna ${esc(nombreFuerza(e.gob))}).` : `Retiene ${esc(nombreFuerza(e.gob))}.`}
        ${mod ? `<br>Pronóstico: ${esc(nombreFuerza(b.favorito))} ${pct(b.probFav)} · margen ${signed(b.margen)}.` : '<br>Sin cambios frente al pronóstico.'}</p>`;
  }

  function pintarNacional() {
    const r = store.resumen, b = resumenBase();
    const mod = hayEscenario();
    const exp = (x) => (x.esperado.MORENA || 0).toFixed(1);
    nacEl.innerHTML = `<h3>Efecto nacional</h3>
      <p>Morena: <b>${mod && exp(r) !== exp(b) ? `${exp(b)} → ${exp(r)}` : exp(r)}</b> gubernaturas esperadas · favorita en <b>${mod && r.porFavorito.MORENA !== b.porFavorito.MORENA ? `${b.porFavorito.MORENA} → ${r.porFavorito.MORENA}` : r.porFavorito.MORENA}</b> de ${r.total}.</p>
      <p class="esc-nac-l">Mira el resultado en <a href="#/predicciones">Predicciones</a> y, por municipio, en el <a href="#/dominio">Mapa de dominio</a>.</p>`;
  }

  function pintarSelect() {
    const mods = new Set(estadosModificados().map((e) => e.slug));
    for (const o of selEstado.options) o.textContent = store.porSlug[o.value].nombre + (mods.has(o.value) ? ' •' : '');
  }

  function pintarMetodo() {
    selMetodo.value = metodoActual();
    ayudaEl.textContent = METODOS.find((m) => m.id === metodoActual())?.ayuda || '';
  }

  function pintarGuardados() {
    guardarBtn.disabled = !hayEscenario();
    const lista = listarGuardados();
    listaEl.innerHTML = lista.length ? lista.map((g) => {
      const n = Object.keys(g.cambios).length;
      return `<li class="esc-item">
        <div><b>${esc(g.nombre)}</b><small>${n} ${n === 1 ? 'estado' : 'estados'} · ${fechaLarga(new Date(g.fecha))}</small></div>
        <button type="button" class="esc-btn-s" data-act="cargar" data-id="${esc(g.id)}">Cargar</button>
        <button type="button" class="esc-link" data-act="borrar" data-id="${esc(g.id)}" aria-label="Eliminar ${esc(g.nombre)}">Eliminar</button>
      </li>`;
    }).join('') : '<li class="esc-vacio">Aún no hay escenarios guardados. Ajusta un estado y guárdalo para volver a él después.</li>';
  }

  function pintarFranja() {
    const mods = estadosModificados();
    document.body.classList.toggle('esc-activo', mods.length > 0);
    btn.classList.toggle('is-on', mods.length > 0);
    btn.title = mods.length ? 'Hay un escenario hipotético activo' : 'Mueve el voto de un partido y mira qué pasaría con la contienda y con cada municipio';
    if (!mods.length) { franja.hidden = true; franja.textContent = ''; return; }
    const r = store.resumen, b = resumenBase();
    const nombres = mods.length <= 3 ? mods.map((e) => e.nombre).join(', ') : `${mods.slice(0, 3).map((e) => e.nombre).join(', ')} y ${mods.length - 3} más`;
    franja.innerHTML = `<span class="esc-strip-t"><b>Escenario hipotético</b> · ${mods.length} ${mods.length === 1 ? 'estado modificado' : 'estados modificados'} (${esc(nombres)})
        · Morena ${(b.esperado.MORENA || 0).toFixed(1)} → ${(r.esperado.MORENA || 0).toFixed(1)} gubernaturas esperadas · <i>No es el pronóstico.</i></span>
      <span class="esc-strip-b"><button type="button" data-act="abrir">Editar</button><button type="button" data-act="reset-todo">Restablecer</button></span>`;
    franja.hidden = false;
  }

  function pintarTodo() {
    pintarFranja();
    pintarSelect();
    if (!abierto) return;
    const e = estadoSel();
    if (e) { pintarFilas(e); pintarResultado(e); }
    pintarNacional();
    pintarMetodo();
    pintarGuardados();
  }

  /* ---------- Abrir y cerrar ---------- */
  function abrir() {
    abierto = true;
    elegir(estadoInicial());
    panel.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    pintarTodo();
    selEstado.focus();
  }
  function cerrar(devolverFoco = true) {
    abierto = false;
    panel.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    if (devolverFoco) btn.focus();
  }
  btn.addEventListener('click', () => (abierto ? cerrar(false) : abrir()));

  function irA(tab) {
    for (const t of panel.querySelectorAll('[role="tab"]')) {
      const on = t.dataset.tab === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      panel.querySelector(`#${t.getAttribute('aria-controls')}`).hidden = !on;
    }
    if (tab === 'guardados') { msgEl.textContent = ''; pintarGuardados(); }
  }

  /* ---------- Eventos del panel ---------- */
  selEstado.addEventListener('change', () => { elegir(selEstado.value); pintarTodo(); });
  selMetodo.addEventListener('change', () => fijarMetodo(selMetodo.value));

  filas.addEventListener('input', (ev) => {
    const el = ev.target;
    const fila = el.closest('.esc-row');
    if (!fila || !(el instanceof HTMLInputElement)) return;
    const v = parseFloat(el.value);
    if (!Number.isFinite(v)) return; // campo vacío mientras se escribe
    fijarVoto(slugSel, fila.dataset.p, v);
  });
  filas.addEventListener('change', (ev) => { // al terminar de escribir, se muestra el valor ya reacomodado
    if (ev.target.classList?.contains('esc-num')) pintarFilas(estadoSel());
  });

  $('#escGuardar').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const reg = guardarActual(nombreEl.value);
    msgEl.textContent = reg ? `Guardado: «${reg.nombre}».` : 'No se pudo guardar: el navegador no permite almacenar datos aquí.';
    if (reg) nombreEl.value = '';
    pintarGuardados();
  });

  panel.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-act], [role="tab"]');
    if (!b) return;
    if (b.getAttribute('role') === 'tab') { irA(b.dataset.tab); return; }
    const act = b.dataset.act;
    if (act === 'cerrar') cerrar();
    else if (act === 'reset-estado') restablecerEstado(slugSel);
    else if (act === 'reset-todo') restablecerTodo();
    else if (act === 'cargar') {
      const ok = cargarGuardado(b.dataset.id);
      msgEl.textContent = ok ? 'Escenario cargado.' : 'Ese escenario ya no coincide con el modelo actual y no se pudo cargar.';
      if (ok) { const m = estadosModificados()[0]; if (m) elegir(m.slug); irA('estado'); }
      pintarTodo();
    } else if (act === 'borrar') { eliminarGuardado(b.dataset.id); pintarGuardados(); }
  });

  panel.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') { ev.stopPropagation(); cerrar(); return; }
    const t = ev.target.closest?.('[role="tab"]');
    if (t && (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft')) {
      const tabs = [...panel.querySelectorAll('[role="tab"]')];
      const sig = tabs[(tabs.indexOf(t) + (ev.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
      irA(sig.dataset.tab); sig.focus(); ev.preventDefault();
    }
  });

  franja.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-act]');
    if (!b) return;
    if (b.dataset.act === 'abrir') abrir();
    else if (b.dataset.act === 'reset-todo') restablecerTodo();
  });

  /* ---------- Eventos globales ---------- */
  window.addEventListener('mirador:escenario', pintarTodo);
  window.addEventListener('hashchange', () => {
    const s = slugDeLaRuta();
    if (abierto && s && store.porSlug[s] && s !== slugSel) { elegir(s); pintarTodo(); }
  });
  pintarTodo();
}
