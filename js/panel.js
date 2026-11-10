/* Panel del profesor: estadísticas por alumno */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const API = self.SimAPI;
  const CAT = self.CATALOGO || [];
  const simNombre = id => (CAT.find(x => x.id === id) || {}).titulo || id;
  const PROF = 'PROFESOR';
  const nf1 = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  const dfmt = new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  const dia = new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const hm = m => { m = Math.round(m || 0); return Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0'); };
  const fecha = iso => { const d = new Date(iso); return isFinite(d) ? dfmt.format(d) : '—'; };
  const diaLocal = iso => { const d = new Date(iso); return isFinite(d) ? d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate() : ''; };

  const s = API.sesion();
  if (!s || (s.demo && !API.demo)) { location.replace('index.html?volver=' + encodeURIComponent(location.pathname)); return; }
  if (s.rol !== 'profesor') { $('err').textContent = 'Esta página es solo para el profesor.'; $('err').hidden = false; $('gen').textContent = ''; return; }

  let D = null, filas = [], orden = { k: 'nombre', dir: 1 }, abierto = null;

  async function cargar() {
    $('gen').textContent = 'Cargando datos…'; $('err').hidden = true;
    try {
      D = await API.consultar('datos');
      $('gen').textContent = API.demo ? 'Modo prueba: sin datos' : 'Datos de las ' + new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' }).format(new Date(D.generado));
      llenarFiltros(); calcular();
    } catch (e) {
      $('err').textContent = 'No se pudieron cargar los datos: ' + e.message; $('err').hidden = false; $('gen').textContent = '';
    }
  }

  function llenarFiltros() {
    const grupos = [...new Set(D.alumnos.map(a => a.grupo).filter(g => g && g.toUpperCase() !== PROF))].sort();
    const gSel = $('f-grupo'), prev = gSel.value;
    gSel.innerHTML = '<option value="">Todos</option>' + grupos.map(g => `<option>${esc(g)}</option>`).join('');
    if (grupos.includes(prev)) gSel.value = prev;
    const sims = [...new Set([...CAT.map(c => c.id), ...D.sesiones.map(x => x.sim)])];
    const sSel = $('f-sim'), prevS = sSel.value;
    sSel.innerHTML = '<option value="">Todos</option>' + sims.map(id => `<option value="${esc(id)}">${esc(simNombre(id))}</option>`).join('');
    if (sims.includes(prevS)) sSel.value = prevS;
  }

  function calcular() {
    if (!D) return;
    const g = $('f-grupo').value, sim = $('f-sim').value, q = $('f-q').value.trim().toLowerCase();
    const desde = $('f-desde').value ? new Date($('f-desde').value + 'T00:00:00') : null;
    const hasta = $('f-hasta').value ? new Date($('f-hasta').value + 'T23:59:59') : null;
    const enFecha = iso => { const d = new Date(iso); return (!desde || d >= desde) && (!hasta || d <= hasta); };

    const alumnos = D.alumnos.filter(a => a.grupo.toUpperCase() !== PROF && (!g || a.grupo === g) &&
      (!q || a.nombre.toLowerCase().includes(q) || a.usuario.includes(q)));
    const ses = D.sesiones.filter(x => (!sim || x.sim === sim) && enFecha(x.inicio));
    const res = D.resultados.filter(x => (!sim || x.sim === sim) && enFecha(x.fecha));

    filas = alumnos.map(a => {
      const S = ses.filter(x => x.usuario === a.usuario), R = res.filter(x => x.usuario === a.usuario);
      const notas = R.filter(x => x.nota !== null).map(x => x.nota);
      const retos = new Set(R.filter(x => x.nota !== null && x.nota >= 5).map(x => x.sim + '|' + x.reto));
      const ult = [...S.map(x => x.ultima), ...R.map(x => x.fecha)].sort().pop() || '';
      return {
        a, S, R, usuario: a.usuario, nombre: a.nombre, grupo: a.grupo,
        sesiones: S.length, activo: S.reduce((t, x) => t + x.activo, 0), pantalla: S.reduce((t, x) => t + x.pantalla, 0),
        dias: new Set(S.map(x => diaLocal(x.inicio))).size, retos: retos.size, intentos: R.length,
        media: notas.length ? notas.reduce((t, x) => t + x, 0) / notas.length : null,
        mejor: notas.length ? Math.max(...notas) : null, ultima: ult,
      };
    });
    pintarKpis(); pintarTabla();
  }

  function pintarKpis() {
    const con = filas.filter(f => f.sesiones > 0).length;
    const min = filas.reduce((t, f) => t + f.activo, 0);
    const k = [
      [con + ' / ' + filas.length, 'alumnos con actividad'],
      [hm(min), 'horas activas en total'],
      [filas.length ? hm(min / filas.length) : '0:00', 'media por alumno'],
      [filas.reduce((t, f) => t + f.retos, 0), 'retos superados'],
    ];
    $('kpis').innerHTML = k.map(([v, t]) => `<div class="kpi"><b>${esc(v)}</b><span>${esc(t)}</span></div>`).join('');
  }

  const COLS = [
    ['nombre', 'Alumno', ''], ['grupo', 'Grupo', ''], ['sesiones', 'Sesiones', 'n'], ['activo', 'Tiempo activo', 'n'],
    ['pantalla', 'En pantalla', 'n'], ['dias', 'Días', 'n'], ['retos', 'Retos', 'n'], ['intentos', 'Resultados', 'n'],
    ['media', 'Nota media', 'n'], ['mejor', 'Mejor nota', 'n'], ['ultima', 'Último acceso', ''],
  ];
  function celda(f, k) {
    switch (k) {
      case 'activo': case 'pantalla': return f.sesiones ? hm(f[k]) : '—';
      case 'media': case 'mejor': return f[k] === null ? '—' : nf1.format(f[k]);
      case 'ultima': return f.ultima ? fecha(f.ultima) : '—';
      case 'sesiones': case 'dias': case 'retos': case 'intentos': return f.sesiones || f.intentos ? f[k] : '—';
      default: return esc(f[k]);
    }
  }
  function pintarTabla() {
    const t = $('tbl');
    t.tHead.innerHTML = '<tr>' + COLS.map(([k, n, c]) => `<th class="${c}"${orden.k === k ? ` aria-sort="${orden.dir > 0 ? 'ascending' : 'descending'}"` : ''}><button type="button" data-k="${k}">${n}${orden.k === k ? (orden.dir > 0 ? ' ▲' : ' ▼') : ''}</button></th>`).join('') + '</tr>';
    const v = x => x === null || x === '' ? -Infinity : x;
    filas.sort((x, y) => {
      const a = x[orden.k], b = y[orden.k];
      if (typeof a === 'string' || typeof b === 'string') return orden.dir * String(a || '').localeCompare(String(b || ''), 'es');
      return orden.dir * (v(a) - v(b));
    });
    if (!filas.length) { t.tBodies[0].innerHTML = `<tr><td colspan="${COLS.length}" class="empty">No hay alumnos con estos filtros. Da de alta a los alumnos en la pestaña «Alumnos» de la hoja.</td></tr>`; return; }
    t.tBodies[0].innerHTML = filas.map(f => {
      let h = `<tr class="row${f.sesiones ? '' : ' sin'}" data-u="${esc(f.usuario)}" tabindex="0">` + COLS.map(([k, , c]) => `<td class="${c}${k === 'nombre' ? ' name' : ''}">${celda(f, k)}</td>`).join('') + '</tr>';
      if (abierto === f.usuario) h += `<tr class="det"><td colspan="${COLS.length}">${detalle(f)}</td></tr>`;
      return h;
    }).join('');
  }

  function detalle(f) {
    const porSim = {};
    for (const x of f.S) { const p = porSim[x.sim] || (porSim[x.sim] = { min: 0, ses: 0, retos: new Set(), notas: [] }); p.min += x.activo; p.ses++; }
    for (const x of f.R) { const p = porSim[x.sim] || (porSim[x.sim] = { min: 0, ses: 0, retos: new Set(), notas: [] }); if (x.nota !== null) { p.notas.push(x.nota); if (x.nota >= 5) p.retos.add(x.reto); } }
    const t1 = Object.entries(porSim).map(([id, p]) => `<tr><td>${esc(simNombre(id))}</td><td class="n">${p.ses}</td><td class="n">${hm(p.min)}</td><td class="n">${p.retos.size}</td><td class="n">${p.notas.length ? nf1.format(p.notas.reduce((a, b) => a + b, 0) / p.notas.length) : '—'}</td></tr>`).join('');
    const R = f.R.slice().sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 60);
    const t2 = R.map(x => `<tr><td>${fecha(x.fecha)}</td><td>${esc(simNombre(x.sim))}</td><td>${esc(x.reto)}</td><td class="n">${x.nota === null ? '—' : nf1.format(x.nota)}</td><td>${esc(x.detalle)}</td></tr>`).join('');
    const S = f.S.slice().sort((a, b) => b.inicio.localeCompare(a.inicio)).slice(0, 60);
    const t3 = S.map(x => `<tr><td>${fecha(x.inicio)}</td><td>${esc(simNombre(x.sim))}</td><td class="n">${nf1.format(x.activo)}</td><td class="n">${nf1.format(x.pantalla)}</td><td>${esc(x.dispositivo)}</td></tr>`).join('');
    return `<div class="det"><div class="det-grid">
      <div><h4>Por simulador</h4><table><thead><tr><th>Simulador</th><th class="n">Sesiones</th><th class="n">Activo</th><th class="n">Retos</th><th class="n">Media</th></tr></thead><tbody>${t1 || '<tr><td colspan="5">Sin actividad</td></tr>'}</tbody></table></div>
      <div><h4>Sesiones</h4><table><thead><tr><th>Inicio</th><th>Simulador</th><th class="n">Min. activos</th><th class="n">Min. pantalla</th><th>Dispositivo</th></tr></thead><tbody>${t3 || '<tr><td colspan="5">Sin sesiones</td></tr>'}</tbody></table></div>
    </div>
    <h4 style="margin-top:14px">Resultados</h4><table><thead><tr><th>Fecha</th><th>Simulador</th><th>Reto</th><th class="n">Nota</th><th>Detalle</th></tr></thead><tbody>${t2 || '<tr><td colspan="5">Sin resultados</td></tr>'}</tbody></table></div>`;
  }

  $('tbl').addEventListener('click', e => {
    const b = e.target.closest('th button');
    if (b) { const k = b.dataset.k; orden = { k, dir: orden.k === k ? -orden.dir : (['nombre', 'grupo'].includes(k) ? 1 : -1) }; pintarTabla(); return; }
    const r = e.target.closest('tr.row');
    if (r) { abierto = abierto === r.dataset.u ? null : r.dataset.u; pintarTabla(); }
  });
  $('tbl').addEventListener('keydown', e => {
    const r = e.target.closest('tr.row');
    if (r && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); abierto = abierto === r.dataset.u ? null : r.dataset.u; pintarTabla(); const n = document.querySelector(`tr.row[data-u="${CSS.escape(r.dataset.u)}"]`); if (n) n.focus(); }
  });
  ['f-grupo', 'f-sim', 'f-desde', 'f-hasta'].forEach(id => $(id).addEventListener('change', calcular));
  $('f-q').addEventListener('input', calcular);
  $('b-reload').addEventListener('click', cargar);

  $('b-csv').addEventListener('click', () => {
    if (!filas.length) return;
    const num = x => x === null || x === undefined ? '' : String(Math.round(x * 100) / 100).replace('.', ',');
    const cab = ['Usuario', 'Alumno', 'Grupo', 'Sesiones', 'Minutos activos', 'Minutos en pantalla', 'Días', 'Retos superados', 'Resultados', 'Nota media', 'Mejor nota', 'Último acceso'];
    const lineas = filas.map(f => [f.usuario, f.nombre, f.grupo, f.sesiones, num(f.activo), num(f.pantalla), f.dias, f.retos, f.intentos, num(f.media), num(f.mejor), f.ultima ? fecha(f.ultima) : '']);
    const csv = '﻿' + [cab, ...lineas].map(l => l.map(c => { c = String(c); return /[;"\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(';')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const sim = $('f-sim').value, g = $('f-grupo').value;
    a.download = 'simuladores_' + (g || 'todos') + (sim ? '_' + sim : '') + '_' + dia.format(new Date()).replace(/\//g, '-') + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });

  cargar();
})();
