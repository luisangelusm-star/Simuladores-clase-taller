/* Simulación del motor y lógica de la centralita EDC16 */
(function (JT) {
  'use strict';
  const OFF_F = { key: 'off', run: false, glowCmd: false, stEng: false, wake: false, relay: false, alive: false, pw: { cmp: false, rps: false, maf: false, tmap: false }, glowOn: false };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const mod = (a, n) => ((a % n) + n) % n;

  function injProfile(tau, dur) {
    if (tau < 0.00012) return 78 * (1 - Math.exp(-tau / 0.000015));
    if (tau > dur - 0.00004) return 12 * Math.exp(-(tau - (dur - 0.00004)) / 0.00001);
    return Math.floor(tau / 0.000025) % 2 === 0 ? 12 : 2;
  }

  const DTC_TXT = {
    drv: ['P0090', 'Regulador de presión de combustible: '], egr: ['P0403', 'Electroválvula EGR: '], vgt: ['P0045', 'Electroválvula de turbo: '],
  };
  const ACT_TXT = { open_gnd: 'circuito abierto o cortocircuito a masa', short: 'cortocircuito a positivo o bobina en corto', open: 'resistencia elevada en el circuito' };

  class Sim {
    constructor(faults) {
      this.unplug = new Set(); this.key = 'off'; this.engHot = true; this.pedal = 0;
      this.t = 0; this.rpm = 0; this.th0 = 0; this.t0 = 0; this.running = false; this.railP = 0;
      this.mafKg = 0; this.mapBar = 1.0; this.injMs = 0; this.duty = { drv: 0, egr: 0, vgt: 0 };
      this.inject = false; this.glowCmd = false; this.keyOnT = 0; this.crankT = 0; this.startProg = 0; this.runT = 0;
      this.crankRpm = 0; this.crankRpmMax = 0; this.plugsHot = 0; this.injEnable = [false, false, false, false];
      this.F = JSON.parse(JSON.stringify(OFF_F)); this.c = null; this.ecu = null; this.dtc = new Map(); this.pedEff = 0;
      this.cache = new Map(); this.version = 0;
      this.setFaults(faults || []);
    }
    setFaults(f) { this.faults = f; this.fx = JT.faultFx(f); this.invalidate(); }
    invalidate() { this.cache.clear(); this.passiveC = null; this.version++; }
    setUnplug(id, v) { if (v) this.unplug.add(id); else this.unplug.delete(id); this.invalidate(); }
    get engT() { return this.engHot ? 85 : 5; }
    get airT() { return this.engHot ? 32 : 8; }
    theta(t) { return this.th0 + (t - this.t0) * this.rpm * 6; }
    setRpm(r) { this.th0 = this.theta(this.t); this.t0 = this.t; this.rpm = Math.max(0, r); }

    /* ---- señales dependientes del tiempo ---- */
    starterEmf(t) { return 3.0 + 0.9 * Math.sin(2 * this.theta(t) * Math.PI / 180); }
    ckpFactor() { const m = this.fx.comp.ckp; return m === 'gap' ? 0.3 : (m === 'short' ? 0.14 : 1); }
    ckpV(t) {
      if (this.rpm < 5) return 0;
      const A = 0.0045 * this.rpm * this.ckpFactor(), a = mod(this.theta(t), 360);
      if (a >= 348) return -A * 1.7 * Math.sin(2 * Math.PI * (a - 348) / 12);
      return A * Math.sin(2 * Math.PI * a / 6);
    }
    camOn(t) { const c = mod(this.theta(t), 720) / 2; return c >= 20 && c < 80; }
    rpsV(t) {
      const P = Math.max(0, this.railP + (this.rpm > 0 ? 5 * Math.sin(this.theta(t) * Math.PI / 45) : 0));
      const m = this.fx.comp.rps;
      if (m === 'high') return 4.95;
      return 0.5 + 4 * P / 1800 + (m === 'drift' ? 0.4 : 0);
    }
    mafV(t) {
      let d = 1.6 * Math.sqrt(Math.max(0, this.mafKg) / 100) + (this.rpm > 0 ? 0.03 * Math.sin(this.theta(t) * Math.PI / 90) : 0);
      if (this.fx.comp.maf === 'dirty') d *= 0.65;
      return 1.0 + d;
    }
    mapV() { return 0.4 + 1.4 * (this.mapBar - 0.2); }
    pedFrac(k) { const q = Math.round(this.pedal * 20) / 20, f = 0.15 + 0.62 * q; return k === 1 ? f : f / 2; }
    injTau(i, t) {
      if (!this.inject || this.rpm < 30) return null;
      const tdc = { 1: 0, 3: 180, 4: 360, 2: 540 }[i], dps = this.rpm * 6, th = this.theta(t);
      const main = tdc - 4, tm = mod(th - main, 720) / dps, dur = this.injMs / 1000;
      if (tm < dur) return [tm, dur];
      const tp = mod(th - (main - 1.4e-3 * dps), 720) / dps;
      if (tp < 0.00025) return [tp, 0.00025];
      return null;
    }
    injOn(i, t) { return !!this.injTau(i, t); }
    boostV(t) { for (let i = 1; i <= 4; i++) { const r = this.injTau(i, t); if (r) return injProfile(r[0], r[1]); } return 0; }
    pwmOn(id, t) {
      const d = this.duty[id]; if (d <= 0) return false; if (d >= 1) return true;
      const f = { drv: 1000, egr: 300, vgt: 300 }[id];
      return mod(t * f, 1) < d;
    }

    /* ---- circuito ---- */
    circuitFor(F) {
      const k = JSON.stringify(F) + '|' + Math.round(this.pedal * 20) + '|' + this.engHot;
      let c = this.cache.get(k);
      if (!c) { c = new JT.Circuit(JT.build(this, F, false)); if (this.cache.size > 80) this.cache.clear(); this.cache.set(k, c); }
      return c;
    }
    passive() {
      const k = Math.round(this.pedal * 20) + '|' + this.engHot;
      if (!this.passiveC || this.passiveKey !== k) { this.passiveC = new JT.Circuit(JT.build(this, OFF_F, true)); this.passiveKey = k; }
      return this.passiveC;
    }
    evalFlags(c, F) {
      const x = c.solve(this.t, { '*': false }, { emf: 3 });
      const V = (a, b) => c.v(x, a) - c.v(x, b), m = this.fx.comp;
      const nf = { key: F.key, run: F.run, glowCmd: F.glowCmd };
      nf.stEng = F.key === 'start' && m.stt !== 'sol_open' && V('stt.50', 'gmo.1') > 7;
      nf.wake = F.key !== 'off' && V('ecu.A3', 'ecu.gnd') > 6;
      nf.relay = F.wake && m.rel !== 'coil' && m.rel !== 'stuck' && V('rel.85', 'rel.86') > 7;
      nf.alive = F.relay && V('ecu.A1', 'ecu.gnd') > 9;
      nf.pw = F.alive ? {
        cmp: V('cmp.1', 'cmp.3') > 4, rps: V('rps.1', 'rps.3') > 4.5,
        maf: V('maf.1', 'maf.2') > 7 && V('maf.3', 'maf.2') > 4.5, tmap: V('tmap.1', 'tmap.2') > 4.5,
      } : { cmp: false, rps: false, maf: false, tmap: false };
      nf.glowOn = F.glowCmd && F.alive && m.glw !== 'dead' && V('glw.30', 'glw.31') > 9 && V('glw.C', 'glw.31') < 2;
      return nf;
    }
    refresh() {
      let F = Object.assign({}, this.F, { key: this.key, run: this.running, glowCmd: this.glowCmd });
      for (let i = 0; i < 8; i++) {
        const c = this.circuitFor(F), nf = this.evalFlags(c, F);
        if (JSON.stringify(nf) === JSON.stringify(F)) { this.F = F; this.c = c; return; }
        F = nf;
      }
      this.F = F; this.c = this.circuitFor(F);
    }

    /* ---- lo que lee la centralita ---- */
    readECU() {
      const F = this.F, c = this.c, t = this.t;
      if (!F.alive) { this.ecu = null; return; }
      const x = c.solve(t, { '*': false }, { ckp: 0, boost: 0 }), g = c.v(x, 'ecu.gnd');
      const vp = p => c.v(x, 'ecu.' + p) - g;
      const r = { dtc: [] }, D = (cd, tx) => r.dtc.push([cd, tx]);
      r.vbat = vp('A1');
      if (r.vbat < 10.5 && this.key !== 'start') D('P0562', 'Tensión de alimentación baja');
      r.reg1 = c.v(x, 'ecu.5v1') - g; r.reg2 = c.v(x, 'ecu.5v2') - g;
      if (r.reg1 < 4.5) D('P0641', 'Alimentación 5 V de sensores 1: fuera de rango');
      if (r.reg2 < 4.5) D('P0651', 'Alimentación 5 V de sensores 2: fuera de rango');
      // régimen
      const k = c.gain('ckp', 'ecu.K1', 'ecu.K2');
      r.ckpAmp = Math.abs(k) * 0.0045 * this.rpm * this.ckpFactor();
      const b1 = vp('K1'), b2 = vp('K2'), biasOk = b1 > 1.5 && b1 < 3.5 && b2 > 1.5 && b2 < 3.5;
      r.ckpSync = this.rpm > 40 && k > 0.2 && r.ckpAmp > 0.35;
      if (!biasOk) D('P0335', 'Sensor de régimen: circuito eléctrico');
      else if (this.rpm > 120 && !r.ckpSync) D(k < -0.2 ? 'P0336' : 'P0335', k < -0.2 ? 'Sensor de régimen: señal no plausible' : 'Sensor de régimen: sin señal');
      // fase
      const xo = c.solve(t, { '*': false, cmp: true });
      const von = c.v(xo, 'ecu.K4') - c.v(xo, 'ecu.gnd'), voff = vp('K4');
      r.cmpOk = voff > 3.5 && von < 1.5;
      if (!r.cmpOk && this.rpm > 120) D('P0340', 'Sensor de fase: sin señal');
      // presión rail
      r.vRps = vp('K7'); r.rpsValid = r.vRps > 0.25 && r.vRps < 4.8;
      if (r.vRps <= 0.25) D('P0192', 'Sensor de presión de rail: señal baja');
      else if (r.vRps >= 4.8) D('P0193', 'Sensor de presión de rail: señal alta');
      r.pRead = r.rpsValid ? Math.max(0, (r.vRps - 0.5) / 4 * 1800) : 0;
      // temperaturas
      const ntcRead = (p, lo, hi, name) => {
        const v = vp(p);
        if (v > 4.85) { D(hi, name + ': señal alta (circuito abierto)'); return [v, -40, 20]; }
        if (v < 0.15) { D(lo, name + ': señal baja (cortocircuito)'); return [v, 140, 20]; }
        const T = JT.ntcInv(2490 * v / (5 - v)); return [v, T, T];
      };
      [r.vEct, r.tEct, r.tUse] = ntcRead('K9', 'P0117', 'P0118', 'Sensor de temperatura de motor');
      [r.vIat, r.tIat] = ntcRead('K16', 'P0112', 'P0113', 'Sensor de temperatura de aire');
      // caudalímetro
      r.vMaf = vp('K11');
      const mafRange = r.vMaf >= 0.3 && r.vMaf <= 4.8;
      if (r.vMaf < 0.3) D('P0102', 'Caudalímetro: señal baja'); else if (r.vMaf > 4.8) D('P0103', 'Caudalímetro: señal alta');
      r.kgRead = r.vMaf > 1 ? ((r.vMaf - 1) / 1.6) ** 2 * 100 : 0;
      const kgExp = this.running ? this.mafKg : 0;
      r.mafPlaus = !(this.running && mafRange && Math.abs(r.kgRead - kgExp) > 0.25 * kgExp + 4);
      if (!r.mafPlaus) D('P0101', 'Caudalímetro: señal no plausible');
      // presión turbo
      r.vMap = vp('K15');
      if (r.vMap < 0.3) D('P0237', 'Sensor de presión de turbo: señal baja'); else if (r.vMap > 4.8) D('P0238', 'Sensor de presión de turbo: señal alta');
      r.barRead = Math.max(0, (r.vMap - 0.4) / 1.4 + 0.2);
      // pedal
      r.vP1 = vp('A12'); r.vP2 = vp('A15');
      const ok1 = r.vP1 > 0.3 && r.vP1 < 4.6, ok2 = r.vP2 > 0.15 && r.vP2 < 2.4;
      if (!ok1) D(r.vP1 <= 0.3 ? 'P2122' : 'P2123', 'Pedal del acelerador, pista 1: señal ' + (r.vP1 <= 0.3 ? 'baja' : 'alta'));
      if (!ok2) D(r.vP2 <= 0.15 ? 'P2127' : 'P2128', 'Pedal del acelerador, pista 2: señal ' + (r.vP2 <= 0.15 ? 'baja' : 'alta'));
      const corr = ok1 && ok2 && Math.abs(r.vP1 - 2 * r.vP2) > 0.35;
      if (corr) D('P2138', 'Pedal del acelerador: las dos pistas no coinciden');
      r.pedMode = ok1 && ok2 && !corr ? 'ok' : (ok1 || ok2 ? 'limp' : 'fixed');
      r.pedPos = ok1 ? clamp((r.vP1 - 0.75) / 3.1, 0, 1) : (ok2 ? clamp((2 * r.vP2 - 0.75) / 3.1, 0, 1) : 0);
      // actuadores PWM
      r.act = {};
      for (const [id, p, Rn] of [['drv', 'K28', 2.8], ['egr', 'K29', 15], ['vgt', 'K30', 15.5]]) {
        const vo = vp(p), xa = c.solve(t, { '*': false, [id]: true });
        const I = (c.v(xa, 'ecu.' + p) - c.v(xa, 'ecu.gnd')) / 0.1, In = 12 / Rn;
        let st = 'ok';
        if (vo < 3) st = 'open_gnd'; else if (I > 1.7 * In) st = 'short'; else if (I < 0.6 * In) st = 'open';
        r.act[id] = st;
        if (st !== 'ok') D(DTC_TXT[id][0], DTC_TXT[id][1] + ACT_TXT[st]);
      }
      // inyectores
      r.inj = [];
      for (let i = 1; i <= 4; i++) {
        const hs = 'ecu.K' + (18 + 2 * i), ls = 'ecu.K' + (19 + 2 * i);
        const xi = c.solve(t, { '*': false, ['hs' + i]: true, ['ls' + i]: true }, { boost: 12 });
        const gi = c.v(xi, 'ecu.gnd'), Il = (c.v(xi, ls) - gi) / 0.05, Ih = (c.v(xi, 'ecu.boost') - c.v(xi, hs)) / 0.12, In = 18;
        let st = 'ok';
        if (Ih > 2 * In) st = 'short_gnd'; else if (Il < 0.5 * In) st = 'open'; else if (Il > 1.7 * In) st = 'short'; else if (Math.abs(Ih - Il) > 0.4 * In) st = 'leak';
        r.inj.push(st);
        if (st !== 'ok') D('P020' + i, 'Inyector cilindro ' + i + ': ' + ({ short_gnd: 'cortocircuito a masa', open: 'circuito abierto', short: 'cortocircuito', leak: 'fuga de corriente' })[st]);
      }
      // mando de precalentamiento
      if (!F.glowCmd) { r.glowCirc = vp('A7') > 3; this.glowCirc = r.glowCirc; } else r.glowCirc = this.glowCirc !== false;
      if (!r.glowCirc) D('P0380', 'Precalentamiento: circuito de mando');
      this.ecu = r;
    }

    /* ---- un paso de simulación ---- */
    step(dt) {
      this.t += dt;
      if (this.key === 'off') { this.keyOnT = 0; this.plugsHot = 0; } else this.keyOnT += dt;
      this.refresh(); this.readECU();
      const F = this.F, e = this.ecu, alive = !!e, m = this.fx.comp;
      if (e) {
        for (const s of this.dtc.values()) s.present = false;
        for (const [cd, tx] of e.dtc) this.dtc.set(cd, { txt: tx, present: true });
      }
      const tUse = e ? e.tUse : 20;
      const cranking = this.key === 'start' && F.stEng;
      this.glowCmd = alive && tUse < 20 && (this.keyOnT < 4 || cranking || (this.running && this.runT < 15));
      if (F.glowOn) {
        const x = this.c.solve(this.t, { '*': false });
        let n = 0;
        for (let i = 1; i <= 4; i++) if (m['gp' + i] !== 'open' && this.c.v(x, 'gp' + i + '.1') - this.c.v(x, 'gmo.1') > 6) n++;
        this.plugsHot = Math.max(this.plugsHot, n);
      }
      // motor de arranque
      if (cranking) {
        const x = this.c.solve(this.t, { '*': false }, { emf: 3 });
        const vm = this.c.v(x, 'stt.M') - this.c.v(x, 'gmo.1');
        this.crankRpm = m.stt === 'brush' ? 0 : clamp((vm - 1.5) * 40, 0, 260);
        this.crankRpmMax = Math.max(this.crankRpmMax, this.crankRpm);
        this.crankT += dt;
      } else { this.crankRpm = 0; if (this.key !== 'start') this.crankT = 0; }
      // decisiones de la centralita
      const limp = alive && (e.act.vgt !== 'ok' || !e.mafPlaus || e.vMaf < 0.3 || e.vMaf > 4.8 || e.vMap < 0.3 || e.vMap > 4.8 || e.pedMode === 'limp');
      this.limp = limp;
      this.pedEff = !alive ? 0 : e.pedMode === 'ok' ? e.pedPos : (e.pedMode === 'limp' ? Math.min(e.pedPos, 0.35) : 0);
      this.injEnable = alive ? e.inj.map(s => s === 'ok') : [false, false, false, false];
      const nInj = this.injEnable.filter(Boolean).length;
      this.inject = alive && e.ckpSync && e.rpsValid && (e.cmpOk || this.crankT > 3 || this.running);
      const target = this.running ? 300 + 1100 * this.pedEff : 250;
      const drvOK = alive && e.act.drv === 'ok';
      const errBar = m.rps === 'drift' ? 180 : 0;
      const pumping = this.rpm > 60;
      const pT = pumping ? (drvOK ? Math.max(0, target - errBar) : 60) : 0;
      this.railP += (pT - this.railP) * Math.min(1, dt * (pT > this.railP ? 3 : 1.5));
      this.pTarget = target;
      this.duty.drv = alive && pumping ? Math.min(0.9, 0.2 + 0.45 * target / 1600) : 0;
      this.duty.egr = alive && this.running ? (this.pedEff < 0.25 ? 0.55 : 0) : 0;
      this.duty.vgt = alive && this.running ? 0.3 + 0.45 * this.pedEff : 0;
      this.injMs = this.running ? 0.55 + 1.0 * this.pedEff : 0.9;
      // estado del motor
      if (!this.running) {
        if (cranking && this.crankRpm >= 40) {
          this.setRpm(this.crankRpm);
          const ready = this.inject && this.railP >= 150 && nInj >= 3 && this.crankRpm >= 150;
          if (ready) {
            let need = 0.5;
            if (!this.engHot) { const h = this.plugsHot; need = h >= 4 ? 0.9 : h === 3 ? 2.6 : h === 2 ? 4 : 8; }
            this.startProg += dt;
            if (this.startProg >= need) { this.running = true; this.runT = 0; this.setRpm(this.engHot ? 900 : 1000); }
          }
        } else { this.startProg = 0; this.setRpm(Math.max(0, this.rpm - dt * 700)); }
      } else {
        this.runT += dt;
        const stall = this.key === 'off' || !alive || !e.ckpSync || !e.rpsValid || this.railP < 120 || nInj < 2 || !this.inject;
        if (stall) { this.running = false; this.startProg = 0; }
        else {
          const idle = e.pedMode === 'fixed' ? 1100 : (tUse < 40 ? 950 : 850);
          const tgt = idle + this.pedEff * ((limp ? 2500 : 4300) - idle);
          let r = this.rpm + (tgt - this.rpm) * Math.min(1, dt * 2.5);
          if (nInj === 3) r += (Math.random() - 0.5) * 140;
          if (nInj === 2) r += (Math.random() - 0.5) * 280;
          if (!this.engHot && this.plugsHot < 4 && this.runT < 5) r += (Math.random() - 0.5) * 160;
          this.setRpm(r);
        }
      }
      const vgtOK = alive && e.act.vgt === 'ok';
      this.mapBar = 1.0 + (this.running ? (vgtOK ? 1.1 : 0.15) * this.pedEff * Math.min(1, this.rpm / 2500) : 0);
      this.mafKg = this.rpm * 0.0225 * this.mapBar;
    }
    clearDTC() { this.dtc.clear(); }
  }
  JT.Sim = Sim;

  /* ---- prueba de síntomas (para redactar la orden de reparación) ---- */
  JT.scenario = function (faults) {
    const s = new Sim(faults);
    const run = sec => { for (let i = 0; i < Math.round(sec / 0.1); i++) s.step(0.1); };
    const crank = () => { s.key = 'start'; let tc = 0; while (tc < 7 && !s.running) { s.step(0.1); tc += 0.1; } s.key = 'on'; return tc; };
    s.engHot = false; s.key = 'on'; run(1.2);
    const comm = !!s.ecu;
    const coldTime = crank(), coldStarted = s.running, crankMax = s.crankRpmMax;
    run(2.5); const coldStall = coldStarted && !s.running;
    s.engHot = true; s.invalidate(); s.key = 'off'; run(0.5); s.key = 'on'; run(1.0);
    const hotTime = crank(), hotStarted = s.running;
    let rmin = 1e9, rmax = 0;
    for (let i = 0; i < 30; i++) { s.step(0.1); if (i > 10 && s.running) { rmin = Math.min(rmin, s.rpm); rmax = Math.max(rmax, s.rpm); } }
    const hotStall = hotStarted && !s.running, idle = s.rpm;
    s.pedal = 1; run(4); const maxRpm = s.running ? s.rpm : 0; s.pedal = 0; run(1);
    const dtcs = [...s.dtc.keys()];
    const L = [];
    if (crankMax < 40) L.push('Al girar la llave a arranque, el motor de arranque no gira.');
    else if (crankMax < 150) L.push('El motor de arranque gira muy despacio' + (hotStarted ? '.' : ' y el motor no arranca.'));
    else if (!coldStarted && !hotStarted) L.push('El motor gira con normalidad pero no arranca.');
    else if (!coldStarted && hotStarted) L.push('En frío no arranca; con el motor caliente arranca.');
    else if (coldStarted && coldTime > 2.2 && hotTime <= 1.6) L.push('Cuesta arrancar en frío y echa humo blanco al arrancar.');
    else if (hotStarted && hotTime > 1.6) L.push('Arranque prolongado: hay que insistir con la llave para que arranque.');
    if (coldStall || hotStall) L.push('Arranca y se para.');
    if (hotStarted && !hotStall && rmax - rmin > 90) L.push('Ralentí inestable, el motor vibra.');
    if (hotStarted && !hotStall && idle > 920) L.push('Ralentí alto con el motor caliente.');
    if (hotStarted && !hotStall) {
      if (maxRpm < idle + 300) L.push('El motor no sube de vueltas al pisar el acelerador.');
      else if (maxRpm < 3000) L.push('Falta de potencia: no pasa de 2500 rpm.');
    }
    if (!comm && crankMax >= 40) L.push('El equipo de diagnosis no comunica con la centralita.');
    if (dtcs.length) L.push('Testigo de avería encendido.');
    return { lines: L, dtcs, crankMax, comm };
  };
})(globalThis.JT = globalThis.JT || {});
