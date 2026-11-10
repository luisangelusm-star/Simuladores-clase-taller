/* Aplicación: ejercicios, controles y bucle de simulación */
(function (JT) {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const CATALOG = JT.buildFaults();
  const POOL = CATALOG.filter(f => !JT.SILENT.has(f.id));
  let sim = new JT.Sim([]);
  const getSim = () => sim;
  const dmm = new JT.DMM(getSim), scope = new JT.Scope($('scv'), getSim);
  let ex = { fault: null, lines: [], meas: 0, bad: 0, t0: Date.now(), solved: false };
  let tab = 'dmm', mode = 'measure', diagView = 'codes', sel = null, audio = null, lastBeep = false;

  const sch = new JT.Schematic($('sch'), $('svgwrap'), $('tip'), { probe, plug, repair });
  function marks() {
    return { red: dmm.leads.red, black: dmm.leads.black, ch1: scope.ch[0].mark || null, ch2: scope.ch[1].mark || null };
  }
  function redraw() { sch.set({ unplug: sim.unplug, mode, marks: marks(), sel }); }

  /* ---------- puntas ---------- */
  function shortLabel(l) { return (l || '').split(' · ')[0]; }
  function probe(pt) {
    if (tab === 'osc') {
      const ch = scope.ch[scope.active];
      if (ch.node !== pt.node) ex.meas++;
      Object.assign(ch, { node: pt.node, label: shortLabel(pt.label), mark: { x: pt.x, y: pt.y } });
      $('ch1-n').textContent = scope.ch[0].label; $('ch2-n').textContent = scope.ch[1].label;
      scope.acquire(); scope.draw();
    } else {
      const old = dmm.leads[dmm.active];
      if (!old || old.node !== pt.node) ex.meas++;
      dmm.leads[dmm.active] = { node: pt.node, label: shortLabel(pt.label), x: pt.x, y: pt.y };
      $('ld-red-n').textContent = dmm.leads.red ? dmm.leads.red.label : 'sin colocar';
      $('ld-black-n').textContent = dmm.leads.black ? dmm.leads.black.label : 'sin colocar';
      if (tab !== 'dmm') showTab('dmm');
      updateDMM();
    }
    updateStats(); redraw();
  }
  function plug(id) { sim.setUnplug(id, !sim.unplug.has(id)); redraw(); }

  /* ---------- reparación ---------- */
  function actionText(t) {
    const M = JT.model;
    if (t.k === 'wire') { const w = M.wireById[t.id]; return (w.kind === 'gnd' || w.kind === 'gecu') ? 'Limpiar, apretar o sustituir la masa' : 'Reparar el cable (sustituir el tramo)'; }
    if (t.k === 'pin') return 'Reparar el terminal ' + t.pin + ' del conector' + (t.comp === 'ecu' ? ' de la ECU' : '');
    const c = M.byId[t.id];
    if (c.id === 'ecu') return 'Sustituir la centralita';
    if (c.type === 'fuse') return 'Sustituir el fusible ' + c.name;
    if (c.type === 'rel') return 'Sustituir el relé principal';
    return 'Sustituir: ' + c.name;
  }
  function matches(t, f) {
    if (!f) return false;
    const g = f.target;
    if (g.k === 'wire') return t.k === 'wire' && (g.id === t.id || (g.ids || []).includes(t.id));
    if (g.k === 'pin') return t.k === 'pin' && g.comp === t.comp && g.pin === t.pin;
    return t.k === 'comp' && g.id === t.id;
  }
  function repair(t, label) {
    sel = t; redraw();
    if (t.k === 'pin' && JT.model.byId[t.comp].type === 'gnd') return;
    openDlg(`<h3>${esc(actionText(t))}</h3><p>${esc(label || '')}</p>
      ${t.k === 'comp' && t.id === 'ecu' ? '<p class="msg bad">La centralita es cara. Antes de cambiarla comprueba su alimentación y sus masas.</p>' : ''}
      <div class="row"><button class="btn" type="button" data-x="close">Cancelar</button><button class="btn primary" type="button" id="do-rep">Confirmar reparación</button></div>`);
    $('do-rep').onclick = () => {
      if (ex.solved || !ex.fault) { closeDlg(); return; }
      if (matches(t, ex.fault)) {
        ex.solved = true; sim.setFaults([]);
        const mins = Math.round((Date.now() - ex.t0) / 60000);
        $('order').classList.add('solved');
        $('o-solved').hidden = false;
        $('o-solved').textContent = 'Avería resuelta: ' + ex.fault.desc + '. ' + ex.meas + ' medidas, ' + ex.bad + ' reparaciones fallidas, ' + mins + ' min. Comprueba que el motor funciona y borra los códigos.';
        if (globalThis.Seguimiento) Seguimiento.resultado({
          reto: ex.fault.code,
          nota: Math.max(0, 10 - 2 * ex.bad),
          detalle: ex.fault.desc + ' · ' + ex.meas + ' medidas · ' + ex.bad + ' reparaciones fallidas · ' + mins + ' min',
        });
        openDlg(`<h3>Reparación correcta</h3><p class="msg ok">${esc(ex.fault.desc)}</p><p>Arranca el motor y vuelve a medir para confirmar que todo está en valores correctos. Borra los códigos con el equipo de diagnosis.</p><div class="row"><button class="btn primary" type="button" data-x="close">Seguir</button></div>`);
      } else {
        ex.bad++;
        openDlg(`<h3>La avería sigue</h3><p class="msg bad">Has hecho: ${esc(actionText(t))}. Ese elemento estaba bien.</p><p>Vuelve a medir antes de cambiar más piezas.</p><div class="row"><button class="btn primary" type="button" data-x="close">Seguir midiendo</button></div>`);
      }
      sel = null; redraw(); updateStats();
    };
  }

  /* ---------- diálogos ---------- */
  function openDlg(html) { $('dlg').innerHTML = html; $('ov').hidden = false; const b = $('dlg').querySelector('input,button.primary'); if (b) b.focus(); }
  function closeDlg() { $('ov').hidden = true; sel = null; redraw(); }
  $('ov').addEventListener('click', e => { if (e.target.id === 'ov' || e.target.dataset.x === 'close') closeDlg(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('ov').hidden) closeDlg(); });

  /* ---------- ejercicios ---------- */
  function load(f) {
    const keepHot = $('temp').value === 'hot';
    sim = new JT.Sim(f ? [f] : []); sim.engHot = keepHot;
    ex = { fault: f, lines: [], meas: 0, bad: 0, t0: Date.now(), solved: false };
    setKey('off'); $('pedal').value = 0;
    $('order').classList.remove('solved'); $('o-solved').hidden = true;
    $('o-code').textContent = f ? 'ejercicio ' + f.code : 'práctica sin avería';
    const lines = f ? JT.scenario([f]).lines : ['Vehículo sin avería: úsalo para conocer los valores correctos de cada medida.'];
    ex.lines = lines;
    $('o-sym').innerHTML = '<ul>' + lines.map(l => '<li>' + esc(l) + '</li>').join('') + '</ul>';
    updateStats(); redraw();
  }
  function newRandom() {
    for (let i = 0; i < 12; i++) {
      const f = POOL[Math.floor(Math.random() * POOL.length)];
      if (JT.scenario([f]).lines.length) { load(f); return; }
    }
    load(POOL[0]);
  }
  $('b-new').onclick = newRandom;
  $('b-none').onclick = () => load(null);
  $('b-code').onclick = () => {
    openDlg(`<h3>Código de ejercicio</h3><p>Escribe el código de 4 caracteres que te ha dado el profesor.</p>
      <form id="code-f"><input type="text" id="code-in" maxlength="4" autocomplete="off" placeholder="p. ej. K7QD" style="text-transform:uppercase"></form>
      <p class="msg bad" id="code-err" hidden>No existe ningún ejercicio con ese código.</p>
      <div class="row"><button class="btn" type="button" data-x="close">Cancelar</button><button class="btn primary" type="submit" form="code-f">Cargar</button></div>`);
    $('code-f').onsubmit = e => {
      e.preventDefault();
      const c = $('code-in').value.trim().toUpperCase(), f = CATALOG.find(x => x.code === c);
      if (!f) { $('code-err').hidden = false; return; }
      closeDlg(); load(f);
    };
  };
  // en la app de clase, la lista de soluciones solo la ve el profesor
  if (globalThis.Seguimiento && Seguimiento.activo && !Seguimiento.esProfesor()) $('b-teacher').hidden = true;
  $('b-teacher').onclick = () => {
    openDlg(`<h3>Modo profesor</h3><p>Esta lista muestra la solución de cada avería. Cada una tiene un código: dáselo a los alumnos para que todos trabajen la misma.</p>
      ${ex.fault ? `<p class="msg ok">Ejercicio actual ${ex.fault.code}: ${esc(ex.fault.desc)}</p>` : ''}
      <div class="row"><button class="btn" type="button" data-x="close">Cerrar</button><button class="btn primary" type="button" id="t-show">Mostrar la lista (${POOL.length} averías)</button></div>`);
    $('t-show').onclick = () => {
      openDlg(`<h3>Averías disponibles</h3><input type="text" id="t-filter" placeholder="Filtrar: inyector, masa, pedal, P0335…" autocomplete="off"><div class="flist" id="t-list"></div><div class="row"><button class="btn" type="button" data-x="close">Cerrar</button></div>`);
      const paint = () => {
        const q = $('t-filter').value.trim().toLowerCase();
        $('t-list').innerHTML = POOL.filter(f => !q || (f.desc + ' ' + f.cat + ' ' + f.code).toLowerCase().includes(q)).slice(0, 400)
          .map(f => `<button type="button" data-id="${f.id}"><code>${f.code}</code><span class="cat">${f.cat}</span><span>${esc(f.desc)}</span></button>`).join('');
      };
      $('t-filter').oninput = paint; paint();
      $('t-list').onclick = e => { const b = e.target.closest('[data-id]'); if (!b) return; const f = CATALOG.find(x => x.id === b.dataset.id); closeDlg(); load(f); };
    };
  };

  /* ---------- vehículo ---------- */
  function setKey(k) {
    sim.key = k;
    $('k-off').setAttribute('aria-pressed', k === 'off'); $('k-on').setAttribute('aria-pressed', k === 'on'); $('k-start').setAttribute('aria-pressed', k === 'start');
  }
  $('k-off').onclick = () => setKey('off');
  $('k-on').onclick = () => setKey('on');
  const ks = $('k-start');
  ks.addEventListener('pointerdown', e => { e.preventDefault(); ks.setPointerCapture(e.pointerId); setKey('start'); });
  const endStart = () => { if (sim.key === 'start') setKey('on'); };
  ks.addEventListener('pointerup', endStart); ks.addEventListener('pointercancel', endStart); ks.addEventListener('lostpointercapture', endStart);
  ks.addEventListener('keydown', e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); setKey('start'); } });
  ks.addEventListener('keyup', e => { if (e.key === ' ' || e.key === 'Enter') endStart(); });
  ks.addEventListener('contextmenu', e => e.preventDefault());
  $('temp').onchange = () => { sim.engHot = $('temp').value === 'hot'; sim.invalidate(); };
  $('pedal').oninput = () => { sim.pedal = $('pedal').value / 100; };

  /* ---------- modos, zoom, pestañas ---------- */
  function setMode(m) {
    mode = m; $('m-measure').setAttribute('aria-pressed', m === 'measure'); $('m-repair').setAttribute('aria-pressed', m === 'repair');
    $('sheet-hint').textContent = m === 'measure' ? 'Pulsa un punto del esquema para colocar la punta activa. El icono de conector desenchufa.' : 'Pulsa el cable, el terminal, la masa o el componente que quieras reparar.';
    redraw();
  }
  $('m-measure').onclick = () => setMode('measure');
  $('m-repair').onclick = () => setMode('repair');
  $('z-in').onclick = () => sch.zoom(1.25); $('z-out').onclick = () => sch.zoom(0.8); $('z-fit').onclick = () => sch.fit();
  function showTab(t) {
    tab = t;
    for (const k of ['dmm', 'osc', 'diag']) { $('t-' + k).setAttribute('aria-selected', k === t); $('p-' + k).hidden = k !== t; }
    if (t === 'osc') { scope.acquire(); scope.draw(); }
    if (t === 'diag') updateDiag();
  }
  for (const k of ['dmm', 'osc', 'diag']) $('t-' + k).onclick = () => showTab(k);

  /* ---------- polímetro ---------- */
  document.querySelectorAll('[data-mm]').forEach(b => b.onclick = () => {
    dmm.mode = b.dataset.mm;
    document.querySelectorAll('[data-mm]').forEach(x => x.setAttribute('aria-pressed', x === b));
    $('dm-mode').textContent = { V: 'V ⎓', R: 'Ω', C: 'Ω ((•))' }[dmm.mode];
    updateDMM();
  });
  const setLead = k => { dmm.active = k; $('ld-red').setAttribute('aria-pressed', k === 'red'); $('ld-black').setAttribute('aria-pressed', k === 'black'); };
  $('ld-red').onclick = () => setLead('red'); $('ld-black').onclick = () => setLead('black');
  function updateDMM() {
    const r = dmm.read();
    $('dm-val').textContent = r.val; $('dm-unit').textContent = r.unit;
    $('dm-note').textContent = r.note || (dmm.leads.red ? 'Roja en ' + dmm.leads.red.label + ' · negra en ' + (dmm.leads.black ? dmm.leads.black.label : '—') : 'Elige la punta y pulsa un punto del esquema.');
    $('dm-beep').classList.toggle('on', !!r.beep);
    if (r.beep && !lastBeep) beep();
    lastBeep = !!r.beep;
  }
  function beep() {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const o = audio.createOscillator(), g = audio.createGain();
      o.frequency.value = 2400; g.gain.value = 0.05; o.connect(g); g.connect(audio.destination);
      o.start(); o.stop(audio.currentTime + 0.18);
    } catch (e) { /* sin sonido */ }
  }

  /* ---------- osciloscopio ---------- */
  const fillSel = (s, list, fmt, val) => { s.innerHTML = list.map(v => `<option value="${v}"${v === val ? ' selected' : ''}>${fmt(v)}</option>`).join(''); };
  fillSel($('v1'), JT.VD, v => JT.fmtN(v, v < 1 ? 1 : 0) + ' V/div', 2);
  fillSel($('v2'), JT.VD, v => JT.fmtN(v, v < 1 ? 1 : 0) + ' V/div', 2);
  fillSel($('tb'), JT.TB, v => JT.tbLabel(v) + '/div', 0.01);
  $('v1').onchange = () => { scope.ch[0].vdiv = +$('v1').value; scope.draw(); };
  $('v2').onchange = () => { scope.ch[1].vdiv = +$('v2').value; scope.draw(); };
  $('tb').onchange = () => { scope.tb = +$('tb').value; scope.acquire(); scope.draw(); };
  const setCh = k => { scope.active = k; $('ch1').setAttribute('aria-pressed', k === 0); $('ch2').setAttribute('aria-pressed', k === 1); };
  $('ch1').addEventListener('click', e => { if (e.target.tagName !== 'SELECT') setCh(0); });
  $('ch2').addEventListener('click', e => { if (e.target.tagName !== 'SELECT') setCh(1); });
  $('sc-auto').onclick = () => {
    scope.autoset();
    $('v1').value = scope.ch[0].vdiv; $('v2').value = scope.ch[1].vdiv; $('tb').value = scope.tb;
    scope.acquire(); scope.draw();
  };
  $('sc-run').onclick = () => { scope.running = !scope.running; $('sc-run').textContent = scope.running ? 'Parar' : 'Continuar'; scope.draw(); };
  $('sc-clr').onclick = () => { for (const c of scope.ch) { c.node = null; c.mark = null; c.label = 'sin sonda'; } $('ch1-n').textContent = $('ch2-n').textContent = 'sin sonda'; scope.data = null; scope.draw(); redraw(); };

  /* ---------- diagnosis ---------- */
  const setDiag = v => { diagView = v; $('d-codes').setAttribute('aria-pressed', v === 'codes'); $('d-params').setAttribute('aria-pressed', v === 'params'); updateDiag(); };
  $('d-codes').onclick = () => setDiag('codes'); $('d-params').onclick = () => setDiag('params');
  $('d-clear').onclick = () => { if (sim.ecu) sim.clearDTC(); updateDiag(); };
  function updateDiag() { $('d-body').innerHTML = JT.diagHTML(sim, diagView); }

  /* ---------- estado ---------- */
  function updateStats() {
    $('s-meas').textContent = ex.meas; $('s-bad').textContent = ex.bad;
    const s = Math.floor((Date.now() - ex.t0) / 1000);
    if (!ex.solved) $('s-time').textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }
  function updateCar() {
    $('rpm').textContent = Math.round(sim.rpm);
    let t;
    if (sim.key === 'off') t = sim.rpm > 20 ? 'Motor parándose.' : 'Sin contacto.';
    else if (sim.running) t = 'Motor en marcha' + (sim.limp ? ' · la centralita limita la potencia.' : '.');
    else if (sim.key === 'start') t = sim.crankRpm < 40 ? 'Arrancando: el motor de arranque no gira.' : 'Arrancando: el motor gira a ' + Math.round(sim.crankRpm) + ' rpm.';
    else t = 'Contacto puesto, motor parado.' + (sim.F.glowOn ? ' Precalentamiento activo.' : '');
    $('carstate').textContent = t;
    const present = [...sim.dtc.values()].some(d => d.present);
    $('mil').classList.toggle('on', sim.key !== 'off' && (!sim.running || present || !sim.ecu));
  }

  let n = 0;
  setInterval(() => {
    sim.step(0.1); n++;
    updateCar();
    if (n % 3 === 0 && tab === 'dmm') updateDMM();
    if (n % 2 === 0 && tab === 'osc' && scope.running) { scope.acquire(); scope.draw(); $('sc-meas').innerHTML = scope.measures(); }
    if (n % 5 === 0 && tab === 'diag') updateDiag();
    if (n % 10 === 0) updateStats();
  }, 100);

  redraw(); sch.fit();
  window.addEventListener('resize', () => { if (tab === 'osc') scope.draw(); });
  setTimeout(newRandom, 30);
})(globalThis.JT = globalThis.JT || {});
