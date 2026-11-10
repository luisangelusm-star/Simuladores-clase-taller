/* Catálogo de averías */
(function (JT) {
  'use strict';
  const ALPH = 'ABCDEFGHJKLMNPRSTUVWXYZ23456789';
  function code(id) {
    let h = 2166136261;
    for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    let s = '';
    for (let i = 0; i < 4; i++) { s += ALPH[h % ALPH.length]; h = Math.floor(h / ALPH.length); }
    return s;
  }

  const COMP_FAULTS = {
    bat: [['weak', 'Batería deteriorada (tensión baja y resistencia interna alta)']],
    stt: [['sol_open', 'Bobina del relé del motor de arranque cortada'], ['contact', 'Contactos del relé del motor de arranque quemados'], ['brush', 'Escobillas del motor de arranque gastadas (inducido sin contacto)']],
    key: [['k15', 'Contacto 15 del conmutador de arranque defectuoso'], ['k50', 'Contacto 50 del conmutador de arranque defectuoso']],
    f15: [['blown', 'Fusible F2 (7,5 A) fundido']], fr: [['blown', 'Fusible F1 (30 A) fundido']], fg: [['blown', 'Fusible F3 (60 A) fundido']],
    rel: [['coil', 'Bobina del relé principal cortada'], ['burn', 'Contactos del relé principal quemados'], ['stuck', 'Relé principal agarrotado: no cierra aunque la bobina está bien']],
    glw: [['dead', 'Centralita de precalentamiento averiada']],
    gp1: [['open', 'Bujía de precalentamiento 1 cortada']], gp2: [['open', 'Bujía de precalentamiento 2 cortada']],
    gp3: [['open', 'Bujía de precalentamiento 3 cortada']], gp4: [['open', 'Bujía de precalentamiento 4 cortada']],
    ckp: [['open', 'Sensor de régimen con bobina cortada'], ['short', 'Sensor de régimen con espiras en cortocircuito'], ['gap', 'Sensor de régimen con entrehierro excesivo o sucio de limaduras']],
    cmp: [['dead', 'Sensor de fase averiado (no conmuta)'], ['stuck', 'Sensor de fase con la salida siempre a masa']],
    rps: [['dead', 'Sensor de presión de rail sin señal'], ['drift', 'Sensor de presión de rail descalibrado (marca de más)'], ['high', 'Sensor de presión de rail con la salida al máximo']],
    ect: [['open', 'Sensor de temperatura de motor cortado'], ['short', 'Sensor de temperatura de motor en cortocircuito'], ['drift', 'Sensor de temperatura de motor descalibrado (marca frío)']],
    maf: [['dead', 'Caudalímetro sin señal'], ['dirty', 'Caudalímetro sucio (marca menos aire)']],
    tmap: [['dead', 'Sensor de presión de turbo sin señal'], ['ntc', 'NTC de temperatura de aire del sensor de turbo cortada']],
    ped: [['t1open', 'Pedal: pista 1 cortada'], ['t2open', 'Pedal: pista 2 cortada'], ['w1', 'Pedal: cursor de la pista 1 sin contacto'], ['w2', 'Pedal: cursor de la pista 2 sin contacto']],
    inj1: [['open', 'Inyector 1 con bobina cortada'], ['short', 'Inyector 1 con bobina en cortocircuito']],
    inj2: [['open', 'Inyector 2 con bobina cortada'], ['short', 'Inyector 2 con bobina en cortocircuito']],
    inj3: [['open', 'Inyector 3 con bobina cortada'], ['short', 'Inyector 3 con bobina en cortocircuito']],
    inj4: [['open', 'Inyector 4 con bobina cortada'], ['short', 'Inyector 4 con bobina en cortocircuito']],
    drv: [['open', 'Regulador de presión con bobina cortada'], ['short', 'Regulador de presión con bobina en cortocircuito']],
    egr: [['open', 'Electroválvula EGR con bobina cortada'], ['short', 'Electroválvula EGR con bobina en cortocircuito']],
    vgt: [['open', 'Electroválvula de turbo con bobina cortada'], ['short', 'Electroválvula de turbo con bobina en cortocircuito']],
  };
  const CROSS = [['ckp', '1', '2'], ['cmp', '1', '2'], ['rps', '1', '2'], ['rps', '2', '3'], ['tmap', '3', '4'], ['maf', '3', '4'], ['ped', '3', '4'], ['ect', '1', '2']];

  JT.buildFaults = function () {
    const M = JT.model, L = [];
    const add = (id, cat, desc, mod, target) => L.push({ id, code: code(id), cat, desc, mod, target });
    const pinLabel = (c, p) => (M.byId[c].pins[p] || {}).label || '';
    for (const w of M.wires) {
      const isG = w.kind === 'gnd' || w.kind === 'gecu';
      const lbl = w.label + ' (' + w.col + ')';
      const tgt = { k: 'wire', id: w.id };
      const masaSig = /Masa/.test(pinLabel(...w.b));
      add(w.id + ':open', isG ? 'Masas' : 'Cables', (isG ? 'Masa suelta: ' : 'Cable cortado: ') + lbl, { wire: w.id, mode: 'open' }, tgt);
      if (JT.RESF[w.kind] > 0) add(w.id + ':res', isG ? 'Masas' : 'Cables', (isG ? 'Masa oxidada o floja: ' : 'Resistencia elevada en el cable: ') + lbl, { wire: w.id, mode: 'res' }, tgt);
      if (!masaSig && ['sig', 's5', 'act', 'inj'].includes(w.kind) && w.a[0] === 'ecu')
        add(w.id + ':sg', 'Cortocircuitos', 'Cortocircuito a masa: ' + lbl, { extra: [{ a: JT.hn(...w.b), b: 'gch.1', r: 0.05 }] }, tgt);
      if (!masaSig && ['sig', 'act'].includes(w.kind) && w.a[0] === 'ecu' && w.id !== 'w_rel_ecu86')
        add(w.id + ':sp', 'Cortocircuitos', 'Cortocircuito a positivo de batería: ' + lbl, { extra: [{ a: JT.hn(...w.b), b: 'h.bat.+', r: 0.3 }] }, tgt);
    }
    for (const [c, p1, p2] of CROSS) {
      const a = 'w_' + c + '_' + p1, b = 'w_' + c + '_' + p2;
      add('x:' + c + ':' + p1 + p2, 'Cortocircuitos', 'Cortocircuito entre los cables ' + p1 + ' y ' + p2 + ' de ' + M.byId[c].name,
        { extra: [{ a: JT.hn(c, p1), b: JT.hn(c, p2), r: 1 }] }, { k: 'wire', ids: [a, b] });
    }
    // terminales de conector
    const seen = new Set();
    for (const w of M.wires) for (const e of [w.a, w.b]) {
      const [c, p] = e, key = c + '.' + p;
      if (seen.has(key)) continue; seen.add(key);
      const cc = M.byId[c];
      if (cc.type === 'gnd' || !cc.plug) continue;
      const where = c === 'ecu' ? 'conector de la ECU, pin ' + p + ' (' + pinLabel(c, p) + ')' : 'conector de ' + cc.name + ', pin ' + p + ' (' + pinLabel(c, p) + ')';
      const tgt = { k: 'pin', comp: c, pin: p };
      if (c === 'bat') { add('p:' + key + ':res', 'Terminales', 'Borne de batería sulfatado: ' + pinLabel(c, p), { contact: key, r: 0.08 }, tgt); continue; }
      add('p:' + key + ':open', 'Terminales', 'Terminal abierto o salido en el ' + where, { contact: key, r: Infinity }, tgt);
      const r = JT.RESF[w.kind];
      if (r > 0 && w.kind !== 'gnd') add('p:' + key + ':res', 'Terminales', 'Terminal oxidado en el ' + where, { contact: key, r: Math.max(r, 0.5) }, tgt);
    }
    for (const [c, list] of Object.entries(COMP_FAULTS))
      for (const [mode, desc] of list) add('c:' + c + ':' + mode, 'Componentes', desc, { comp: c, mode }, { k: 'comp', id: c });
    return L;
  };
  // averías que no producen síntomas ni códigos (redundantes): fuera del sorteo
  JT.SILENT = new Set(["w_cmp_1:res", "w_maf_3:res", "w_maf_1:res", "w_ped_4:res", "w_bat_fr:res", "w_bat_key:res", "w_key_f15:res", "w_f15_ecu:res", "w_f15_rel:res", "g7:res", "g3:open", "g3:res", "g4:open", "g4:res", "g5:res", "x:tmap:34", "p:ecu.K3:res", "p:cmp.1:res", "p:ecu.K13:res", "p:maf.3:res", "p:maf.1:res", "p:ecu.A13:res", "p:ped.4:res", "p:f15.i:res", "p:f15.o:res", "p:ecu.A3:res", "p:rel.85:res", "p:ecu.A4:open", "p:ecu.A4:res", "p:ecu.A5:open", "p:ecu.A5:res"]);
  JT.faultCode = code;
})(globalThis.JT = globalThis.JT || {});
