/* Comunicación con el servidor (Google Apps Script) y cola sin conexión */
(function () {
  'use strict';
  const K_SESION = 'simtaller.sesion';
  const K_COLA = 'simtaller.cola';
  const cfg = self.CONFIG || {};
  const demo = !cfg.API_URL;

  const leer = (k, def) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return def; } };
  const escribir = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* almacenamiento lleno o bloqueado */ } };
  const borrar = k => { try { localStorage.removeItem(k); } catch (e) { /* nada */ } };
  const uid = () => (self.crypto && crypto.randomUUID) ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

  async function llamar(cuerpo, timeoutMs) {
    if (demo) throw new Error('Modo prueba: sin servidor');
    const ctl = 'AbortController' in self ? new AbortController() : null;
    const t = ctl ? setTimeout(() => ctl.abort(), timeoutMs || 20000) : null;
    try {
      const r = await fetch(cfg.API_URL, {
        method: 'POST', redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(cuerpo), signal: ctl ? ctl.signal : undefined,
      });
      if (!r.ok) throw new Error('El servidor respondió ' + r.status);
      return await r.json();
    } finally { if (t) clearTimeout(t); }
  }

  /* ---------- sesión del alumno ---------- */
  function sesion() { return leer(K_SESION, null); }

  async function entrar(usuario, pin) {
    if (demo) {
      const u = String(usuario).trim().toLowerCase() || 'prueba';
      const s = { usuario: u, nombre: u === 'profe' ? 'Profesor (prueba)' : 'Usuario de prueba', grupo: u === 'profe' ? 'PROFESOR' : 'PRUEBA', rol: u === 'profe' ? 'profesor' : 'alumno', token: 'demo', demo: true };
      escribir(K_SESION, s); return s;
    }
    const r = await llamar({ accion: 'login', usuario, pin });
    if (!r.ok) throw new Error(r.error || 'No se pudo entrar');
    const s = { usuario: r.usuario, nombre: r.nombre, grupo: r.grupo, rol: r.rol, token: r.token };
    escribir(K_SESION, s);
    return s;
  }
  function salir() { enviarPendientes(); borrar(K_SESION); }

  /* ---------- cola de envíos ---------- */
  // Cada elemento: { k: clave, usuario, token, op }. Las sesiones se sustituyen por su última versión.
  function encolar(op) {
    const s = sesion();
    if (!s || s.demo) { if (s && s.demo) console.info('[modo prueba]', op); return; }
    const cola = leer(K_COLA, []);
    const k = (op.tipo === 'sesion' ? 'S:' : 'R:') + op.id;
    const i = cola.findIndex(x => x.k === k);
    const item = { k, usuario: s.usuario, token: s.token, op };
    if (i >= 0) cola[i] = item; else cola.push(item);
    escribir(K_COLA, cola.slice(-500));
  }
  function pendientes() { return leer(K_COLA, []).length; }

  let enviando = null;
  function enviarPendientes() {
    if (demo) return Promise.resolve(0);
    if (enviando) return enviando;
    enviando = (async () => {
      let enviados = 0;
      for (let vuelta = 0; vuelta < 5; vuelta++) {
        const cola = leer(K_COLA, []);
        if (!cola.length) break;
        const primero = cola[0];
        const lote = cola.filter(x => x.usuario === primero.usuario && x.token === primero.token).slice(0, 50);
        let r;
        try { r = await llamar({ accion: 'lote', usuario: primero.usuario, token: primero.token, ops: lote.map(x => x.op) }); }
        catch (e) { break; } // sin conexión: se reintenta más tarde
        const quitar = (x) => lote.some(l => l.k === x.k && (l.op.n || 0) >= (x.op.n || 0));
        if (r && r.ok) {
          escribir(K_COLA, leer(K_COLA, []).filter(x => !quitar(x)));
          enviados += lote.length;
        } else {
          // sesión caducada o usuario borrado: se descartan esos envíos para no bloquear la cola
          if (r && /Sesión no válida|no encontrado|desactivado/.test(r.error || '')) {
            escribir(K_COLA, leer(K_COLA, []).filter(x => !(x.usuario === primero.usuario && x.token === primero.token)));
            const s = sesion(); if (s && s.usuario === primero.usuario) borrar(K_SESION);
          }
          break;
        }
      }
      return enviados;
    })().finally(() => { enviando = null; });
    return enviando;
  }

  // Envío de emergencia al cerrar la página: no espera respuesta.
  // Los datos siguen en la cola; si llegaron, el servidor ignora el duplicado.
  function despedida() {
    if (demo || !navigator.sendBeacon) return;
    const cola = leer(K_COLA, []);
    if (!cola.length) return;
    const p = cola[0];
    const lote = cola.filter(x => x.usuario === p.usuario && x.token === p.token).slice(0, 50);
    try {
      navigator.sendBeacon(cfg.API_URL, new Blob([JSON.stringify({ accion: 'lote', usuario: p.usuario, token: p.token, ops: lote.map(x => x.op) })], { type: 'text/plain;charset=utf-8' }));
    } catch (e) { /* nada */ }
  }

  async function consultar(accion) {
    const s = sesion();
    if (!s) throw new Error('Sin sesión');
    if (s.demo) return { ok: true, demo: true, porSimulador: {}, alumnos: [], sesiones: [], resultados: [] };
    const r = await llamar({ accion, usuario: s.usuario, token: s.token }, 45000);
    if (!r.ok) throw new Error(r.error || 'Error del servidor');
    return r;
  }

  self.addEventListener('online', () => enviarPendientes());
  self.SimAPI = { demo, sesion, entrar, salir, encolar, enviarPendientes, despedida, pendientes, consultar, uid };
})();
