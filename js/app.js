/* Pantalla de inicio: acceso, catálogo y progreso del alumno */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const cfg = self.CONFIG || {};
  const API = self.SimAPI;
  const params = new URLSearchParams(location.search);

  document.querySelectorAll('[data-cfg]').forEach(el => { const v = cfg[el.dataset.cfg]; if (v) el.textContent = v; });
  if (cfg.NOMBRE_APP) document.title = cfg.NOMBRE_APP;

  const ICONOS = {
    esquema: `<svg viewBox="0 0 180 84" aria-hidden="true"><g fill="none" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
      <rect x="18" y="18" width="46" height="48" rx="6" stroke="#9fb0c0"/><path d="M28 32h26M28 42h18M28 52h22" stroke="#5d6c7b"/>
      <path d="M64 30h34v-12h30" stroke="#f2b445"/><path d="M64 54h50v12h14" stroke="#6db3e8"/>
      <rect x="128" y="10" width="34" height="18" rx="4" stroke="#9fb0c0"/><rect x="128" y="57" width="34" height="18" rx="4" stroke="#9fb0c0"/>
      <path d="M86 42h40" stroke="#f2b445" stroke-dasharray="3 5"/><circle cx="98" cy="30" r="3.4" fill="#f2b445" stroke="none"/><circle cx="114" cy="54" r="3.4" fill="#6db3e8" stroke="none"/></g></svg>`,
    onda: `<svg viewBox="0 0 180 84" aria-hidden="true"><g fill="none" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
      <path d="M8 58h18V22h22v36h18V22h22v36h18V22h22v36h18V22h18" stroke="#f2b445"/>
      <path d="M8 42c9-14 18-14 27 0s18 14 27 0 18-14 27 0 18 14 27 0 18-14 27 0 18 14 27 0" stroke="#6db3e8" opacity=".85"/></g></svg>`,
    can: `<svg viewBox="0 0 180 84" aria-hidden="true"><g fill="none" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
      <path d="M8 42h26M8 42" stroke="#9fb0c0" stroke-dasharray="2 5"/>
      <path d="M8 42h24l3-20h24l3 20h18l3-20h36l3 20h22l3-20h20" stroke="#f2b445"/>
      <path d="M8 42h24l3 20h24l3-20h18l3 20h36l3-20h22l3 20h20" stroke="#6db3e8"/></g></svg>`,
  };
  const ICONO_DEF = ICONOS.onda;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function minutosTxt(m) { m = Math.round(m || 0); if (m < 60) return m + ' min'; return Math.floor(m / 60) + ' h ' + String(m % 60).padStart(2, '0') + ' min'; }
  const nf = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });

  /* ---------- sesión ---------- */
  let s = API.sesion();
  if (s && s.demo && !API.demo) { API.salir(); s = null; }

  function volverSiProcede() {
    const v = params.get('volver');
    if (!v) return false;
    // solo rutas de esta misma app
    const base = new URL('.', location.href);
    const dest = new URL(v, location.origin);
    if (dest.origin === location.origin && dest.pathname.startsWith(base.pathname)) { location.replace(dest.href); return true; }
    return false;
  }

  function mostrar() {
    $('v-login').hidden = !!s; $('v-home').hidden = !s;
    $('demo-login').hidden = !API.demo; $('demo-home').hidden = !API.demo;
    if (!s) { setTimeout(() => $('in-user').focus(), 50); return; }
    $('u-name').textContent = s.nombre;
    $('u-group').textContent = s.grupo;
    $('b-panel').hidden = s.rol !== 'profesor';
    pintarCatalogo({});
    cargarProgreso();
    API.enviarPendientes().then(pintarSync);
    pintarSync();
  }

  $('f-login').addEventListener('submit', async e => {
    e.preventDefault();
    const u = $('in-user').value.trim(), p = $('in-pin').value.trim();
    const err = $('login-err');
    err.hidden = true;
    if (!u || (!p && !API.demo)) { err.textContent = 'Escribe tu usuario y tu PIN.'; err.hidden = false; return; }
    const b = $('b-login'); b.disabled = true; b.textContent = 'Entrando…';
    try {
      s = await API.entrar(u, p);
      $('in-pin').value = '';
      if (!volverSiProcede()) mostrar();
    } catch (ex) {
      err.textContent = navigator.onLine === false ? 'Sin conexión a internet. La primera vez hace falta conexión para entrar.' : (ex.message || 'No se pudo entrar');
      err.hidden = false;
    } finally { b.disabled = false; b.textContent = 'Entrar'; }
  });
  $('b-logout').addEventListener('click', () => { API.salir(); s = null; history.replaceState(null, '', location.pathname); mostrar(); });

  /* ---------- catálogo ---------- */
  function visibles() {
    const lista = self.CATALOGO || [];
    if (s.rol === 'profesor') return lista;
    const g = String(s.grupo || '').trim().toLowerCase();
    return lista.filter(x => !x.grupos || !x.grupos.length || x.grupos.some(y => String(y).trim().toLowerCase() === g));
  }
  function pintarCatalogo(prog) {
    const lista = visibles();
    $('grid').innerHTML = lista.map(x => {
      const p = prog[x.id];
      const pr = p ? `<span>Tiempo <b>${minutosTxt(p.minutos)}</b></span><span>Retos <b>${p.retos}</b></span>${p.mejor !== null && p.mejor !== undefined ? `<span>Mejor nota <b>${nf.format(p.mejor)}</b></span>` : ''}`
        : `<span class="none">${prog.__cargando ? 'Cargando tu progreso…' : 'Aún no lo has usado'}</span>`;
      return `<a class="card" href="${esc(x.ruta)}index.html">
        <div class="tile">${ICONOS[x.icono] || ICONO_DEF}</div>
        <div class="card-b">
          <span class="eyebrow">${esc(x.modulo || '')}</span>
          <h3>${esc(x.titulo)}</h3>
          <p>${esc(x.descripcion || '')}</p>
          ${x.puntua ? `<span class="rule">${esc(x.puntua)}</span>` : ''}
          <div class="prog">${pr}</div>
        </div></a>`;
    }).join('') || '<p>No hay simuladores asignados a tu grupo.</p>';
  }
  async function cargarProgreso() {
    if (API.demo) { $('prog-note').textContent = ''; return; }
    pintarCatalogo({ __cargando: true });
    try {
      const r = await API.consultar('mis');
      pintarCatalogo(r.porSimulador || {});
      $('prog-note').textContent = 'Tiempo activo y retos superados (nota de 5 o más)';
    } catch (e) {
      pintarCatalogo({});
      $('prog-note').textContent = navigator.onLine === false ? 'Sin conexión: tu progreso se actualizará al volver a conectar' : '';
    }
  }
  function pintarSync() {
    const n = API.pendientes();
    $('sync').textContent = API.demo ? '' : (n ? n + ' registro(s) pendientes de enviar' : '');
  }
  addEventListener('online', () => setTimeout(() => API.enviarPendientes().then(() => { pintarSync(); if (s) cargarProgreso(); }), 600));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && s) { API.enviarPendientes().then(pintarSync); } });

  /* ---------- instalación ---------- */
  let promptInst = null;
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); promptInst = e; $('b-install').hidden = false; });
  $('b-install').addEventListener('click', async () => { if (!promptInst) return; promptInst.prompt(); await promptInst.userChoice.catch(() => null); promptInst = null; $('b-install').hidden = true; });
  addEventListener('appinstalled', () => { $('b-install').hidden = true; });
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
  const standalone = (matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone;
  if (ios && !standalone) $('ios-hint').hidden = false;

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }

  if (s && volverSiProcede()) return;
  mostrar();
})();
