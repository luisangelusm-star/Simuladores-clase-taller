/* Retos de ajuste del osciloscopio: registra cada componente bien medido.
   Se carga después del simulador y de seguimiento.js. No cambia el simulador:
   envuelve autoset() y renderEval() para saber cuándo el ajuste es correcto. */
(function () {
  'use strict';
  if (!globalThis.Seguimiento || !Seguimiento.activo) return;

  const SENAL = { hall: 'sig', ckp: 'sp', tps: 'sig', map: 'sig', lambda: 'sig', ntc: 'sig', iny: 'ctl', bobina: 'ctl', knock: 'sig' };
  const MASA = { hall: 'gnd', ckp: 'sm', tps: 'gnd', map: 'gnd', lambda: 'sg', ntc: 'gnd', knock: 'gnd' };
  const CORTO = { hall: 'Hall', ckp: 'CKP', tps: 'TPS', map: 'MAP', lambda: 'Lambda', ntc: 'NTC', iny: 'Inyector', bobina: 'Bobina', knock: 'Picado' };
  const MANTENER_MS = 3000;
  const CLAVE = 'simtaller.osc.' + Seguimiento.usuario;

  let hechos = {};
  try { hechos = JSON.parse(localStorage.getItem(CLAVE) || '{}') || {}; } catch (e) { hechos = {}; }
  let usoAuto = false, okDesde = 0;

  /* ---------- envolver funciones del simulador ---------- */
  const autosetOriginal = autoset;
  autoset = function () {
    if (!B.lock && (B.tips[0] || B.tips[1])) usoAuto = true;
    return autosetOriginal.apply(this, arguments);
  };
  const evalOriginal = renderEval;
  renderEval = function (m) {
    evalOriginal(m);
    comprobar(m);
  };
  document.getElementById('sensorSel').addEventListener('change', () => { usoAuto = false; okDesde = 0; pintar(); });
  document.getElementById('faultSel').addEventListener('change', () => { okDesde = 0; pintar(); });

  /* ---------- comprobación ---------- */
  function conexionCorrecta() {
    const sen = B.sensor;
    if (B.tips[0] !== sen + '.' + SENAL[sen]) return false;
    if (!B.gnd) return false;
    return B.gnd === 'bat.n' || (MASA[sen] && B.gnd === sen + '.' + MASA[sen]);
  }
  function ajusteCorrecto(m) {
    const lis = [...document.querySelectorAll('#eval li')];
    if (lis.length < 2 || !lis.every(li => li.classList.contains('ok'))) return false;
    if (!m || m.clip) return false;
    // las señales lentas se miden en modo roll y moviendo el acelerador o la temperatura
    if (SENSORS[B.sensor].kind === 'dc') return !!(S.trace && S.trace.roll) && m.vpp > 0.03;
    return true;
  }
  function comprobar(m) {
    const listo = B.fault === 'none' && conexionCorrecta() && ajusteCorrecto(m) && S.running;
    const ahora = Date.now();
    if (!listo) { if (okDesde) { okDesde = 0; pintar(); } return; }
    if (!okDesde) okDesde = ahora;
    const nota = usoAuto ? 5 : 10;
    const previa = hechos[B.sensor] || 0;
    if (ahora - okDesde >= MANTENER_MS && nota > previa) {
      hechos[B.sensor] = nota;
      try { localStorage.setItem(CLAVE, JSON.stringify(hechos)); } catch (e) { /* nada */ }
      const P = params();
      Seguimiento.resultado({
        reto: B.sensor, nota,
        detalle: SENSORS[B.sensor].name + (usoAuto ? ' · con Autoset' : ' · ajuste manual') +
          ' · ' + fmtSet(vdiv(0), 'V') + '/div · ' + fmtSet(tdiv(), 's') + '/div · ' + B.rpm + ' rpm',
      });
      toast('Reto superado: ' + CORTO[B.sensor] + (usoAuto ? ' (con Autoset: 5 puntos)' : ' (10 puntos)'));
    }
    pintar();
  }

  /* ---------- panel de retos ---------- */
  const css = document.createElement('style');
  css.textContent = `
.retos{margin-top:14px;border-top:1px solid var(--border);padding-top:12px}
.retos-h{display:flex;justify-content:space-between;align-items:baseline;font-weight:700}
.retos-h b{font-family:'IBM Plex Mono',ui-monospace,monospace}
.retos ul{list-style:none;margin:8px 0;padding:0;display:flex;flex-wrap:wrap;gap:6px}
.retos li{font-size:.82rem;font-weight:700;padding:3px 9px;border-radius:999px;border:1px solid var(--border);background:var(--surface2);color:var(--muted)}
.retos li.r10{background:var(--ok);border-color:var(--ok);color:#fff}
.retos li.r5{background:var(--warn);border-color:var(--warn);color:#fff}
.retos li.act{outline:2px solid var(--accent);outline-offset:1px}
.retos p{margin:6px 0 0;font-size:.86rem;color:var(--muted)}
.retos .hold{color:var(--ok);font-weight:700}`;
  document.head.appendChild(css);
  const caja = document.createElement('div');
  caja.className = 'retos';
  document.getElementById('eval').closest('.card').appendChild(caja);

  function pintar() {
    const total = Object.keys(SENAL).length;
    const n = Object.values(hechos).filter(x => x > 0).length;
    let estado;
    const yaHecho = (hechos[B.sensor] || 0) >= (usoAuto ? 5 : 10);
    if (okDesde && yaHecho) estado = `<p class="hold">✓ Reto registrado para ${CORTO[B.sensor]}. Elige otro componente en el banco de pruebas.</p>`;
    else if (okDesde) estado = `<p class="hold">Ajuste correcto: mantenlo ${Math.max(1, Math.ceil((MANTENER_MS - (Date.now() - okDesde)) / 1000))} s…</p>`;
    else if (yaHecho) estado = `<p>Ya tienes este reto${hechos[B.sensor] === 5 ? ' con 5 puntos: hazlo sin Autoset (cambia de componente y vuelve) para conseguir 10' : ''}. Elige otro componente.</p>`;
    else if (B.fault !== 'none') estado = '<p>Los retos se registran con «Sin avería».</p>';
    else estado = `<p>Punta CH1 en la señal del componente y pinza en su masa (o en el negativo de batería). Ajusta hasta que todo salga en verde y mantenlo 3 s.${SENSORS[B.sensor].kind === 'dc' ? ' Esta señal es lenta: usa modo roll y mueve el mando que la hace variar.' : ''}${usoAuto ? ' Has usado Autoset con este componente: vale 5 puntos.' : ''}</p>`;
    caja.innerHTML = `<div class="retos-h"><span>Retos de ajuste</span><b>${n}/${total}</b></div>
      <ul>${Object.keys(SENAL).map(k => `<li class="${hechos[k] === 10 ? 'r10' : hechos[k] === 5 ? 'r5' : ''}${k === B.sensor ? ' act' : ''}" title="${SENSORS[k].name}">${CORTO[k]}${hechos[k] ? ' ✓' : ''}</li>`).join('')}</ul>${estado}`;
  }
  pintar();
})();
