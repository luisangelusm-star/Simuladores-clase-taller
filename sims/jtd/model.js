/* Modelo: componentes, cableado, disposición del esquema y circuito equivalente */
(function (JT) {
  'use strict';
  const comps = [], byId = {}, wires = [], wireById = {}, rails = [], gsyms = [];
  const NORM = { L: [-1, 0], R: [1, 0], T: [0, -1], B: [0, 1] };

  function comp(c) {
    c.pins = c.pins || {};
    comps.push(c); byId[c.id] = c; return c;
  }
  // pins: { pin: [x, y, lado, etiqueta] }
  function pin(c, p, x, y, side, label) { c.pins[p] = { x, y, side, label }; }
  function wire(id, a, b, col, kind, pts, extra) {
    const w = Object.assign({ id, a, b, col, kind, pts }, extra || {});
    wires.push(w); wireById[id] = w; return w;
  }

  /* ---------- ECU ---------- */
  const ECU = comp({ id: 'ecu', name: 'Centralita EDC16', sub: 'Gestión motor diésel', type: 'ecu', x: 700, y: 200, w: 200, h: 880, plug: true });
  const ecuPin = (p, x, y, side, label) => pin(ECU, p, x, y, side, label);
  ecuPin('A1', 730, 200, 'T', '+12 V relé principal (87)');
  ecuPin('A3', 770, 200, 'T', '+15 llave (despertador)');
  ecuPin('A6', 810, 200, 'T', 'Mando relé principal');
  ecuPin('A7', 850, 200, 'T', 'Mando precalentamiento');
  ecuPin('A4', 770, 1080, 'B', 'Masa de potencia 1');
  ecuPin('A5', 830, 1080, 'B', 'Masa de potencia 2');

  /* ---------- Parte superior: alimentación ---------- */
  const bat = comp({ id: 'bat', name: 'Batería', sub: '12 V · 60 Ah', type: 'bat', x: 20, y: 40, w: 100, h: 70, plug: true, plugText: 'Desconectar batería' });
  pin(bat, '+', 120, 55, 'R', 'Borne positivo'); pin(bat, '-', 70, 110, 'B', 'Borne negativo');
  const stt = comp({ id: 'stt', name: 'Motor de arranque', sub: 'Relé + motor', type: 'stt', x: 160, y: 120, w: 120, h: 55 });
  pin(stt, '30', 190, 120, 'T', 'Borne 30 (batería)'); pin(stt, '50', 250, 120, 'T', 'Borne 50 (mando llave)');
  const key = comp({ id: 'key', name: 'Llave', sub: 'Conmutador', type: 'key', x: 320, y: 40, w: 80, h: 55 });
  pin(key, '30', 340, 40, 'T', 'Entrada 30'); pin(key, '15', 340, 95, 'B', 'Salida 15 (contacto)'); pin(key, '50', 380, 95, 'B', 'Salida 50 (arranque)');
  const f15 = comp({ id: 'f15', name: 'F2', sub: '7,5 A', type: 'fuse', x: 330, y: 125, w: 20, h: 30, plug: true, plugText: 'Quitar fusible' });
  pin(f15, 'i', 340, 125, 'T', 'Entrada'); pin(f15, 'o', 340, 155, 'B', 'Salida');
  const fr = comp({ id: 'fr', name: 'F1', sub: '30 A', type: 'fuse', x: 510, y: 26, w: 20, h: 24, plug: true, plugText: 'Quitar fusible' });
  pin(fr, 'i', 520, 26, 'T', 'Entrada'); pin(fr, 'o', 520, 50, 'B', 'Salida');
  const rel = comp({ id: 'rel', name: 'Relé ECU', sub: 'principal', type: 'rel', x: 500, y: 60, w: 100, h: 70, plug: true, plugText: 'Quitar relé' });
  pin(rel, '30', 520, 60, 'T', '30 (entrada potencia)'); pin(rel, '85', 500, 110, 'L', '85 (bobina +)');
  pin(rel, '86', 540, 130, 'B', '86 (bobina −, mando ECU)'); pin(rel, '87', 580, 130, 'B', '87 (salida potencia)');
  const fg = comp({ id: 'fg', name: 'F3', sub: '60 A', type: 'fuse', x: 1090, y: 26, w: 20, h: 24, plug: true, plugText: 'Quitar fusible' });
  pin(fg, 'i', 1100, 26, 'T', 'Entrada'); pin(fg, 'o', 1100, 50, 'B', 'Salida');
  const glw = comp({ id: 'glw', name: 'Precalentamiento', sub: 'centralita · 4 salidas', type: 'glw', x: 1080, y: 70, w: 140, h: 70, plug: true });
  pin(glw, '30', 1100, 70, 'T', '30 (alimentación)'); pin(glw, 'C', 1080, 105, 'L', 'Mando desde ECU'); pin(glw, '31', 1100, 140, 'B', '31 (masa)');
  [80, 97, 114, 131].forEach((y, i) => pin(glw, String(i + 1), 1220, y, 'R', 'Salida bujía ' + (i + 1)));
  const gpx = { 4: 1290, 3: 1360, 2: 1430, 1: 1500 };
  for (let i = 1; i <= 4; i++) {
    const cx = gpx[i];
    const g = comp({ id: 'gp' + i, name: 'Bujía ' + i, sub: '', type: 'gp', x: cx - 16, y: 150, w: 32, h: 38, plug: true, plugText: 'Soltar cable' });
    pin(g, '1', cx, 150, 'T', 'Borne');
    gsyms.push({ node: 'gmo.1', x: cx, y: 205, label: 'G2', from: [cx, 188] });
  }
  // puntos de masa (sin caja propia)
  comp({ id: 'gch', name: 'Masa carrocería G1', type: 'gnd' });
  comp({ id: 'gmo', name: 'Masa motor G2', type: 'gnd' });
  comp({ id: 'gecu', name: 'Masa centralita G3', type: 'gnd' });

  /* ---------- Sensores (izquierda) ---------- */
  const LEFT = [
    { id: 'ckp', name: 'Sensor de régimen', sub: 'Cigüeñal · inductivo', type: 'ckp', pins: [['1', 'Señal +', 'K1', 'B'], ['2', 'Señal −', 'K2', 'N']] },
    { id: 'cmp', name: 'Sensor de fase', sub: 'Árbol de levas · Hall', type: 'cmp', pins: [['1', '+5 V', 'K3', 'RN'], ['2', 'Señal', 'K4', 'G'], ['3', 'Masa', 'K5', 'M']] },
    { id: 'rps', name: 'Sensor presión rail', sub: '0–1800 bar', type: 'rps', pins: [['1', '+5 V', 'K6', 'RV'], ['2', 'Señal', 'K7', 'GV'], ['3', 'Masa', 'K8', 'MB']] },
    { id: 'ect', name: 'Sensor temp. motor', sub: 'NTC refrigerante', type: 'ect', pins: [['1', 'Señal', 'K9', 'LB'], ['2', 'Masa', 'K10', 'MN']] },
    { id: 'maf', name: 'Caudalímetro', sub: 'Película caliente', type: 'maf', pins: [['2', 'Masa', 'K12', 'M'], ['3', '+5 V ref.', 'K13', 'RG'], ['4', 'Señal', 'K11', 'V']], rail: ['1', '+12 V (relé)', 'RB'] },
    { id: 'tmap', name: 'Sensor presión turbo', sub: 'Presión + temp. aire', type: 'tmap', pins: [['1', '+5 V', 'K14', 'RL'], ['2', 'Masa', 'K17', 'MG'], ['3', 'Señal presión', 'K15', 'Z'], ['4', 'Señal temp.', 'K16', 'H']] },
    { id: 'ped', name: 'Pedal acelerador', sub: 'Doble potenciómetro', type: 'ped', ecuConn: 'A', pins: [['1', '+5 V pista 1', 'A10', 'R'], ['2', 'Masa pista 1', 'A11', 'MR'], ['3', 'Señal pista 1', 'A12', 'BL'], ['4', '+5 V pista 2', 'A13', 'RS'], ['5', 'Masa pista 2', 'A14', 'MV'], ['6', 'Señal pista 2', 'A15', 'A']] },
  ];
  const RIGHT = [
    { id: 'inj1', name: 'Inyector 1', sub: 'Electroinyector', type: 'inj', cyl: 1, pins: [['1', '+ (alta)', 'K20', 'C'], ['2', '− (baja)', 'K21', 'CN']] },
    { id: 'inj2', name: 'Inyector 2', sub: 'Electroinyector', type: 'inj', cyl: 2, pins: [['1', '+ (alta)', 'K22', 'S'], ['2', '− (baja)', 'K23', 'SN']] },
    { id: 'inj3', name: 'Inyector 3', sub: 'Electroinyector', type: 'inj', cyl: 3, pins: [['1', '+ (alta)', 'K24', 'Z'], ['2', '− (baja)', 'K25', 'ZN']] },
    { id: 'inj4', name: 'Inyector 4', sub: 'Electroinyector', type: 'inj', cyl: 4, pins: [['1', '+ (alta)', 'K26', 'A'], ['2', '− (baja)', 'K27', 'AN']] },
    { id: 'drv', name: 'Regulador presión', sub: 'Válvula PWM bomba', type: 'drv', pins: [['2', 'Mando', 'K28', 'LR']], rail: ['1', '+12 V (relé)', 'R'] },
    { id: 'egr', name: 'Electroválvula EGR', sub: 'PWM', type: 'sol', R: 15, pins: [['2', 'Mando', 'K29', 'HN']], rail: ['1', '+12 V (relé)', 'RN'] },
    { id: 'vgt', name: 'Electroválvula turbo', sub: 'Geometría variable', type: 'sol', R: 15.5, pins: [['2', 'Mando', 'K30', 'VN']], rail: ['1', '+12 V (relé)', 'RV'] },
  ];
  const RAIL_L = 350, RAIL_R = 1250, RAIL_Y = 185;
  function column(list, side, y0) {
    let y = y0;
    for (const d of list) {
      const n = d.pins.length, h = Math.max(50, 40 + (n - 1) * 24);
      const x = side === 'L' ? 390 : 1040, w = side === 'L' ? 170 : 160;
      const c = comp(Object.assign({}, d, { x, y, w, h, plug: true, pins: {}, def: d.pins }));
      d.pins.forEach(([p, label, ep, col], i) => {
        const py = y + 20 + i * 24 + (n === 1 ? 5 : 0);
        const px = side === 'L' ? x + w : x;
        pin(c, p, px, py, side === 'L' ? 'R' : 'L', label);
        const sid = side === 'L' ? 'L' : 'R';
        ecuPin(ep, side === 'L' ? 700 : 900, py, sid, label + ' · ' + d.name);
        const kind = /\+5/.test(label) ? 's5' : (/Masa/.test(label) ? 'sig' : (d.type === 'inj' ? 'inj' : (side === 'R' ? 'act' : 'sig')));
        wire('w_' + d.id + '_' + p, ['ecu', ep], [d.id, p], col, kind, [[px, py], [side === 'L' ? 700 : 900, py]]);
      });
      if (d.rail) {
        const [p, label, col] = d.rail;
        const py = y + 20 + (n === 1 ? 5 : 0);
        const px = side === 'L' ? x : x + w;
        pin(c, p, px, py, side === 'L' ? 'L' : 'R', label);
        const rx = side === 'L' ? RAIL_L : RAIL_R;
        wire('w_' + d.id + '_' + p, ['rel', '87'], [d.id, p], col, 'p12', [[px, py], [rx, py]], { railDrop: true });
        rails.push({ y: py, x: rx, side });
      }
      y += h + 28;
    }
  }
  column(LEFT, 'L', 232);
  column(RIGHT, 'R', 262);

  /* ---------- Cableado de la parte superior ---------- */
  wire('w_bat_stt', ['bat', '+'], ['stt', '30'], 'R', 'power', [[190, 120], [190, 20]], { railDrop: true, label: 'Cable batería – motor de arranque' });
  wire('w_bat_fr', ['bat', '+'], ['fr', 'i'], 'R', 'power', [[520, 26], [520, 20]], { railDrop: true });
  wire('w_bat_key', ['bat', '+'], ['key', '30'], 'R', 'power', [[340, 40], [340, 20]], { railDrop: true });
  wire('w_bat_fg', ['bat', '+'], ['fg', 'i'], 'R', 'power', [[1100, 26], [1100, 20]], { railDrop: true });
  wire('w_fr_rel', ['fr', 'o'], ['rel', '30'], 'R', 'p12', [[520, 50], [520, 60]]);
  wire('w_key_f15', ['key', '15'], ['f15', 'i'], 'GN', 'p12', [[340, 95], [340, 125]]);
  wire('w_f15_ecu', ['f15', 'o'], ['ecu', 'A3'], 'GR', 'p12', [[340, 155], [340, 172], [770, 172], [770, 200]]);
  wire('w_f15_rel', ['f15', 'o'], ['rel', '85'], 'GR', 'p12', [[340, 155], [340, 162], [470, 162], [470, 110], [500, 110]]);
  wire('w_rel_ecu86', ['rel', '86'], ['ecu', 'A6'], 'LN', 'sig', [[540, 130], [540, 150], [810, 150], [810, 200]]);
  wire('w_rel_ecu87', ['rel', '87'], ['ecu', 'A1'], 'RN', 'p12', [[730, RAIL_Y], [730, 200]], { railDrop: true });
  wire('w_key_stt', ['key', '50'], ['stt', '50'], 'BR', 'p12', [[380, 95], [380, 105], [250, 105], [250, 120]]);
  wire('w_fg_glw', ['fg', 'o'], ['glw', '30'], 'R', 'power', [[1100, 50], [1100, 70]]);
  wire('w_ecu_glw', ['ecu', 'A7'], ['glw', 'C'], 'HR', 'sig', [[850, 200], [850, 105], [1080, 105]]);
  [[1, 80, 1500], [2, 97, 1430], [3, 114, 1360], [4, 131, 1290]].forEach(([i, y, x]) =>
    wire('w_glw_gp' + i, ['glw', String(i)], ['gp' + i, '1'], 'N', 'glow', [[1220, y], [x, y], [x, 150]]));
  // masas
  wire('g1', ['bat', '-'], ['gch', '1'], 'N', 'gnd', [[70, 110], [70, 135]], { gnd: 'G1', label: 'Cable negativo batería – carrocería (G1)' });
  wire('g2', ['gmo', '1'], ['gch', '1'], 'N', 'gnd', [[220, 175], [220, 198]], { gnd: 'G1', label: 'Trenza de masa motor – carrocería (G2–G1)' });
  wire('g7', ['glw', '31'], ['gch', '1'], 'N', 'gnd', [[1100, 140], [1100, 160]], { gnd: 'G1', label: 'Masa centralita precalentamiento (G1)' });
  wire('g3', ['ecu', 'A4'], ['gecu', '1'], 'N', 'gecu', [[770, 1080], [770, 1100], [800, 1100]], { label: 'Masa ECU A4 – punto G3' });
  wire('g4', ['ecu', 'A5'], ['gecu', '1'], 'N', 'gecu', [[830, 1080], [830, 1100], [800, 1100]], { label: 'Masa ECU A5 – punto G3' });
  wire('g5', ['gecu', '1'], ['gch', '1'], 'N', 'gnd', [[800, 1100], [800, 1122]], { gnd: 'G1', label: 'Punto de masa G3 (centralita) – carrocería' });
  gsyms.push({ node: 'gch.1', x: 70, y: 135, label: 'G1' }, { node: 'gch.1', x: 220, y: 198, label: 'G1' },
    { node: 'gch.1', x: 1100, y: 160, label: 'G1' }, { node: 'gch.1', x: 800, y: 1122, label: 'G1' });
  const gprobe = [{ node: 'gmo.1', x: 220, y: 175, label: 'G2 · bloque motor' }, { node: 'gecu.1', x: 800, y: 1100, label: 'G3 · masa centralita' }];

  // líneas de reparto (dibujo del mismo nodo eléctrico)
  const railLines = [
    { node: 'h.bat.+', pts: [[120, 55], [140, 55], [140, 20], [1100, 20]], label: '+30 batería' },
    { node: 'h.rel.87', pts: [[580, 130], [580, RAIL_Y], [RAIL_L, RAIL_Y], [RAIL_L, Math.max(...rails.filter(r => r.side === 'L').map(r => r.y))]], label: '+87 relé principal' },
    { node: 'h.rel.87', pts: [[580, RAIL_Y], [RAIL_R, RAIL_Y], [RAIL_R, Math.max(...rails.filter(r => r.side === 'R').map(r => r.y))]], label: '+87 relé principal' },
  ];
  const junctions = [[190, 20], [340, 20], [520, 20], [730, RAIL_Y], [580, RAIL_Y], ...rails.map(r => [r.x, r.y])];

  /* ---------- Etiquetas de cable ---------- */
  function endName(e) {
    const [c, p] = e;
    if (c === 'ecu') return 'ECU ' + p;
    const cc = byId[c];
    if (cc.type === 'gnd') return cc.name;
    return cc.name + ' (' + p + ')';
  }
  for (const w of wires) if (!w.label) w.label = endName(w.a) + ' – ' + endName(w.b);
  JT.COLORS = { A: 'celeste', B: 'blanco', C: 'naranja', G: 'amarillo', H: 'gris', L: 'azul', M: 'marrón', N: 'negro', R: 'rojo', S: 'rosa', V: 'verde', Z: 'violeta' };
  JT.colorName = code => code.split('').map(c => JT.COLORS[c]).join('-');

  /* ---------- Resistencias de cable y valores de avería ---------- */
  const WR = { power: 0.003, p12: 0.02, s5: 0.03, sig: 0.03, act: 0.02, inj: 0.015, glow: 0.01, gnd: 0.002, gecu: 0.004 };
  const RESF = { power: 0.08, p12: 6, s5: 150, sig: 0, act: 6, inj: 2.5, glow: 0.6, gnd: 0.08, gecu: 4 };
  JT.RESF = RESF;

  function ntc(T) { return 2000 * Math.exp(3500 * (1 / (T + 273.15) - 1 / 298.15)); }
  JT.ntc = ntc;
  JT.ntcInv = R => 1 / (Math.log(R / 2000) / 3500 + 1 / 298.15) - 273.15;

  const hn = (c, p) => 'h.' + c + '.' + p;
  const tn = (c, p) => c + '.' + p;
  JT.hn = hn; JT.tn = tn;

  /* ---------- Efecto de las averías ---------- */
  JT.faultFx = function (faults) {
    const fx = { wire: {}, contact: {}, extra: [], comp: {} };
    for (const f of faults || []) {
      const m = f.mod;
      if (m.wire) fx.wire[m.wire] = m.mode;
      if (m.contact) fx.contact[m.contact] = m.r;
      if (m.comp) fx.comp[m.comp] = m.mode;
      if (m.extra) fx.extra.push(...m.extra);
    }
    return fx;
  };

  /* ---------- Construcción del circuito equivalente ---------- */
  // F: banderas de estado; sim: simulación (funciones dependientes del tiempo)
  JT.build = function (sim, F, passive) {
    const E = [], fx = sim.fx, un = sim.unplug;
    const R = (a, b, r) => { if (isFinite(r)) E.push({ t: 'R', a, b, r }); };
    const V = (a, b, r, v, id) => E.push({ t: 'V', a, b, r, v: passive ? 0 : v, id });
    const S = (a, b, r, on, id) => { if (!passive) E.push({ t: 'S', a, b, r, on, id }); };
    for (const w of wires) {
      const m = fx.wire[w.id];
      if (m === 'open') continue;
      let r = WR[w.kind];
      if (m === 'res') r += RESF[w.kind];
      R(hn(...w.a), hn(...w.b), r);
    }
    // contactos de conectores
    const seen = new Set();
    for (const w of wires) for (const e of [w.a, w.b]) {
      const k = tn(...e); if (seen.has(k)) continue; seen.add(k);
      const [c, p] = e;
      if (c === 'ecu') { if (un.has(p[0] === 'A' ? 'ecuA' : 'ecuK')) continue; }
      else if (un.has(c)) continue;
      const r = fx.contact[k] !== undefined ? fx.contact[k] : 0.004;
      R(hn(c, p), k, r);
    }
    for (const e of fx.extra) R(e.a, e.b, e.r);
    const m = fx.comp;
    // batería
    if (!un.has('bat')) {
      const weak = m.bat === 'weak';
      V('bat.+', 'bat.-', weak ? 0.05 : 0.012, F.run ? 14.2 : (weak ? 12.1 : 12.6), 'bat');
    }
    // motor de arranque
    if (m.stt !== 'sol_open') R('stt.50', 'gmo.1', 1.1);
    if (F.stEng) {
      R('stt.30', 'stt.M', m.stt === 'contact' ? 0.12 : 0.002);
      if (m.stt !== 'brush') V('stt.M', 'gmo.1', 0.035, t => sim.starterEmf(t), 'emf');
    }
    // llave
    if (F.key !== 'off' && m.key !== 'k15') R('key.30', 'key.15', 0.01);
    if (F.key === 'start' && m.key !== 'k50') R('key.30', 'key.50', 0.01);
    // fusibles
    for (const id of ['f15', 'fr', 'fg']) if (m[id] !== 'blown') R(id + '.i', id + '.o', 0.004);
    // relé
    if (m.rel !== 'coil') R('rel.85', 'rel.86', 85);
    if (F.relay) R('rel.30', 'rel.87', m.rel === 'burn' ? 3 : 0.005);
    // precalentamiento
    R('glw.30', 'glw.31', 2000); R('glw.30', 'glw.C', 10000);
    if (F.glowOn) for (let i = 1; i <= 4; i++) R('glw.30', 'glw.' + i, 0.01);
    for (let i = 1; i <= 4; i++) if (m['gp' + i] !== 'open') R('gp' + i + '.1', 'gmo.1', 0.75);
    // sensores
    if (m.ckp !== 'open') V('ckp.1', 'ckp.2', m.ckp === 'short' ? 120 : 860, t => sim.ckpV(t), 'ckp');
    R('cmp.1', 'cmp.3', 1000);
    if (F.pw.cmp && m.cmp !== 'dead') { if (m.cmp === 'stuck') R('cmp.2', 'cmp.3', 30); else S('cmp.2', 'cmp.3', 30, t => sim.camOn(t), 'cmp'); }
    R('rps.1', 'rps.3', 500);
    if (F.pw.rps && m.rps !== 'dead') V('rps.2', 'rps.3', 200, t => sim.rpsV(t), 'rps');
    if (m.ect !== 'open') R('ect.1', 'ect.2', m.ect === 'short' ? 40 : ntc(sim.engT) * (m.ect === 'drift' ? 6 : 1));
    R('maf.1', 'maf.2', 140); R('maf.3', 'maf.2', 22000);
    if (F.pw.maf && m.maf !== 'dead') V('maf.4', 'maf.2', 100, t => sim.mafV(t), 'maf');
    R('tmap.1', 'tmap.2', 1000);
    if (F.pw.tmap && m.tmap !== 'dead') V('tmap.3', 'tmap.2', 150, t => sim.mapV(t), 'map');
    if (m.tmap !== 'ntc') R('tmap.4', 'tmap.2', ntc(sim.airT));
    // pedal (dos potenciómetros)
    [[1, '1', '2', '3', 1500], [2, '4', '5', '6', 2500]].forEach(([k, sp, gp, sg, Rt]) => {
      const f = sim.pedFrac(k), w = 'ped.w' + k;
      if (m.ped !== 't' + k + 'open') { R('ped.' + sp, w, Rt * (1 - f) + 5); R(w, 'ped.' + gp, Rt * f + 5); }
      R(w, 'ped.' + sg, m.ped === 'w' + k ? 60000 : 10);
    });
    // actuadores
    for (let i = 1; i <= 4; i++) { const q = m['inj' + i]; if (q !== 'open') R('inj' + i + '.1', 'inj' + i + '.2', q === 'short' ? 0.04 : 0.38); }
    if (m.drv !== 'open') R('drv.1', 'drv.2', m.drv === 'short' ? 0.5 : 2.8);
    for (const id of ['egr', 'vgt']) if (m[id] !== 'open') R(id + '.1', id + '.2', m[id] === 'short' ? 1.5 : byId[id].R);
    // centralita
    R('ecu.A4', 'ecu.gnd', 0.003); R('ecu.A5', 'ecu.gnd', 0.003);
    R('ecu.A3', 'ecu.gnd', 10000);
    R('ecu.A1', 'ecu.gnd', F.alive ? 60 : 4700);
    R('ecu.A6', 'ecu.gnd', F.wake && !passive ? 0.4 : 47000);
    if (F.alive) {
      V('ecu.5v1', 'ecu.gnd', 0.6, 5, 'reg1'); V('ecu.5v2', 'ecu.gnd', 0.6, 5, 'reg2');
      V('ecu.ref', 'ecu.gnd', 0.05, 5, 'ref'); V('ecu.ckb', 'ecu.gnd', 100, 2.5, 'ckb');
    } else for (const n of ['5v1', '5v2', 'ref', 'ckb']) R('ecu.' + n, 'ecu.gnd', 10000);
    for (const p of ['K3', 'K6', 'A10']) R('ecu.5v1', 'ecu.' + p, 0.3);
    for (const p of ['K13', 'K14', 'A13']) R('ecu.5v2', 'ecu.' + p, 0.3);
    for (const p of ['K5', 'K8', 'K10', 'K12', 'K17', 'A11', 'A14']) R('ecu.' + p, 'ecu.gnd', 0.8);
    for (const p of ['K7', 'K11', 'K15', 'A12', 'A15']) R('ecu.' + p, 'ecu.gnd', 100000);
    R('ecu.ref', 'ecu.K9', 2490); R('ecu.ref', 'ecu.K16', 2490); R('ecu.ref', 'ecu.K4', 2200);
    R('ecu.ckb', 'ecu.K1', 10000); R('ecu.ckb', 'ecu.K2', 10000);
    for (let i = 1; i <= 4; i++) {
      const hs = 'ecu.K' + (18 + 2 * i), ls = 'ecu.K' + (19 + 2 * i);
      R(hs, 'ecu.gnd', 10000); R(ls, 'ecu.gnd', 10000);
      if (F.alive) { S('ecu.boost', hs, 0.12, t => sim.injOn(i, t), 'hs' + i); S(ls, 'ecu.gnd', 0.05, t => sim.injOn(i, t), 'ls' + i); }
    }
    if (F.alive) V('ecu.boost', 'ecu.gnd', 0.05, t => sim.boostV(t), 'boost');
    for (const [id, p] of [['drv', 'K28'], ['egr', 'K29'], ['vgt', 'K30']]) {
      R('ecu.' + p, 'ecu.gnd', 22000);
      if (F.alive) S('ecu.' + p, 'ecu.gnd', 0.1, t => sim.pwmOn(id, t), id);
    }
    R('ecu.A7', 'ecu.gnd', F.glowCmd && F.alive && !passive ? 0.5 : 47000);
    return E;
  };

  /* ---------- Puntos de medida ---------- */
  function probePoints(un) {
    const pts = [];
    for (const c of comps) {
      for (const [p, d] of Object.entries(c.pins)) {
        const nm = c.id === 'ecu' ? 'ECU ' + p : c.name + ' · pin ' + p;
        pts.push({ node: hn(c.id, p), x: d.x, y: d.y, label: nm + ' (lado mazo)', desc: d.label, comp: c.id, pin: p, harness: true });
        const unplugged = c.id === 'ecu' ? un.has(p[0] === 'A' ? 'ecuA' : 'ecuK') : un.has(c.id);
        if (unplugged) {
          const [nx, ny] = NORM[d.side];
          pts.push({ node: tn(c.id, p), x: d.x - nx * 14, y: d.y - ny * 14, label: nm + ' (lado componente)', desc: d.label, comp: c.id, pin: p, term: true });
        }
      }
    }
    for (const g of gsyms) pts.push({ node: g.node, x: g.x, y: g.y + 4, label: byId[g.node.split('.')[0]].name, gnd: true });
    for (const g of gprobe) pts.push({ node: g.node, x: g.x, y: g.y, label: g.label, gnd: true });
    return pts;
  }

  JT.model = { comps, byId, wires, wireById, railLines, junctions, gsyms, probePoints, NORM, LEFT, RIGHT };
})(globalThis.JT = globalThis.JT || {});
