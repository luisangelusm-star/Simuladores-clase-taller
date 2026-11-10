/* Seguimiento de uso dentro de cada simulador.
   Uso en el HTML del simulador (antes de sus propios scripts):
     <script src="../../config.js"></script>
     <script src="../../js/api.js"></script>
     <script src="../../js/seguimiento.js" data-sim="ID_DEL_SIMULADOR"></script>
   Para enviar una puntuación desde el simulador:
     Seguimiento.resultado({ reto: 'K7QD', nota: 8, detalle: 'texto libre' });   // nota de 0 a 10
*/
(function () {
  'use strict';
  const yo = document.currentScript;
  const simId = (yo && yo.dataset.sim) || location.pathname.split('/').filter(Boolean).slice(-1)[0] || 'simulador';
  const raiz = yo ? yo.src.replace(/js\/seguimiento\.js(\?.*)?$/, '') : '../../';
  const cfg = self.CONFIG || {};
  const API = self.SimAPI;
  const s = API && API.sesion();
  const valida = s && !(s.demo && !API.demo);

  const nulo = { activo: false, usuario: '', nombre: '', grupo: '', rol: '', esProfesor: () => false, resultado: () => {} };
  if (!valida) {
    self.Seguimiento = nulo;
    const volver = location.pathname + location.search;
    location.replace(raiz + 'index.html?volver=' + encodeURIComponent(volver));
    return;
  }

  /* ---------- medida del tiempo ---------- */
  const INACT = (cfg.INACTIVIDAD_SEG || 90) * 1000;
  const LATIDO = Math.max(30, cfg.LATIDO_SEG || 120) * 1000;
  const sesionId = API.uid();
  const inicio = Date.now();
  let activoMs = 0, pantallaMs = 0, ultimaAccion = Date.now(), ultimoTick = Date.now(), n = 0;

  const marcar = () => { ultimaAccion = Date.now(); };
  ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'input', 'change'].forEach(ev =>
    addEventListener(ev, marcar, { passive: true, capture: true }));

  function tick() {
    const ahora = Date.now();
    const dt = Math.min(ahora - ultimoTick, 5000); // si el navegador estuvo dormido no se suma ese hueco
    ultimoTick = ahora;
    if (document.visibilityState === 'visible') {
      pantallaMs += dt;
      if (ahora - ultimaAccion < INACT) activoMs += dt;
    }
  }
  setInterval(tick, 1000);

  function dispositivo() {
    const ua = navigator.userAgent || '';
    const tipo = /iPad|Tablet/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua)) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua)) ? 'Tablet'
      : /Mobi|iPhone|Android/i.test(ua) ? 'Móvil' : 'Ordenador';
    const app = (matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone ? ' · app' : ' · navegador';
    return tipo + app;
  }
  const disp = dispositivo();

  function guardarSesion() {
    tick();
    API.encolar({ tipo: 'sesion', id: sesionId, n: ++n, sim: simId, inicio, activoSeg: Math.round(activoMs / 1000), pantallaSeg: Math.round(pantallaMs / 1000), dispositivo: disp });
  }
  function enviar() { guardarSesion(); API.enviarPendientes().then(pintarEstado); }

  enviar();
  setInterval(enviar, LATIDO);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { guardarSesion(); API.despedida(); }
    else { ultimoTick = Date.now(); marcar(); API.enviarPendientes().then(pintarEstado); }
  });
  addEventListener('pagehide', () => { guardarSesion(); API.despedida(); });
  addEventListener('online', () => setTimeout(() => API.enviarPendientes().then(pintarEstado), 500));

  /* ---------- barra superior ---------- */
  let punto;
  function pintarEstado() {
    if (!punto) return;
    const p = API.pendientes();
    punto.dataset.st = API.demo ? 'demo' : (p ? 'pend' : 'ok');
    punto.title = API.demo ? 'Modo prueba: no se guarda nada' : (p ? 'Sin conexión: los datos se enviarán al recuperarla' : 'Conectado');
  }
  function barra() {
    const css = document.createElement('style');
    css.textContent = `
#sg-barra{position:relative;z-index:50;display:flex;align-items:center;gap:12px;min-height:40px;padding:6px max(16px,env(safe-area-inset-left,0px)) 6px max(12px,env(safe-area-inset-left,0px));background:#141a20;color:#e6ebf0;font:600 14px/1.2 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;box-sizing:border-box}
#sg-barra a{color:#e6ebf0;text-decoration:none;display:inline-flex;align-items:center;gap:6px;padding:6px 10px 6px 6px;border-radius:8px;background:#232c35}
#sg-barra a:hover{background:#2e3944}
#sg-barra a:focus-visible{outline:2px solid #f08b4a;outline-offset:2px}
#sg-barra .sg-sp{flex:1}
#sg-barra .sg-u{font-weight:500;color:#aab6c2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:45vw}
#sg-barra .sg-p{width:9px;height:9px;border-radius:50%;background:#4cc77a;flex:none}
#sg-barra .sg-p[data-st="pend"]{background:#f2b445}
#sg-barra .sg-p[data-st="demo"]{background:#8a96a3}`;
    const b = document.createElement('div');
    b.id = 'sg-barra';
    b.innerHTML = `<a href="${raiz}index.html"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3L5 8l5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>Simuladores</a><span class="sg-sp"></span><span class="sg-u"></span><span class="sg-p"></span>`;
    b.querySelector('.sg-u').textContent = s.nombre + (API.demo ? ' · modo prueba' : '');
    punto = b.querySelector('.sg-p');
    document.head.appendChild(css);
    document.body.insertBefore(b, document.body.firstChild);
    pintarEstado();
  }
  if (document.body) barra(); else document.addEventListener('DOMContentLoaded', barra);

  /* ---------- API pública para los simuladores ---------- */
  self.Seguimiento = {
    activo: true,
    sim: simId,
    usuario: s.usuario, nombre: s.nombre, grupo: s.grupo, rol: s.rol,
    esProfesor: () => s.rol === 'profesor',
    resultado(r) {
      r = r || {};
      const nota = r.nota === null || r.nota === undefined ? null : Math.max(0, Math.min(10, Number(r.nota)));
      API.encolar({ tipo: 'resultado', id: API.uid(), sesion: sesionId, sim: simId, reto: String(r.reto || ''), nota, detalle: String(r.detalle || '').slice(0, 500), ts: Date.now() });
      guardarSesion();
      API.enviarPendientes().then(pintarEstado);
    },
  };
})();
