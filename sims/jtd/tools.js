/* Instrumentos: polímetro, osciloscopio y equipo de diagnosis */
(function (JT) {
  'use strict';
  const fmtN = (v, d) => v.toFixed(d).replace('.', ',');

  /* ---------- Polímetro ---------- */
  class DMM {
    constructor(getSim) {
      this.getSim = getSim; this.mode = 'V'; this.active = 'red';
      this.leads = { red: null, black: { node: 'gch.1', label: 'Masa carrocería G1', x: 70, y: 139 } };
    }
    vdc(sim, a, b) {
      const c = sim.c; if (!c) return 0;
      let s = 0; const N = 40;
      for (let k = 0; k < N; k++) { const x = c.solve(sim.t + k * 0.0025 + 0.0007); s += c.v(x, a) - c.v(x, b); }
      return s / N;
    }
    read() {
      const sim = this.getSim(), r = this.leads.red, b = this.leads.black;
      if (!r || !b) return { val: '----', unit: this.mode === 'V' ? 'V' : 'Ω', note: 'Coloca las dos puntas en el esquema.' };
      if (this.mode === 'V') {
        let v = this.vdc(sim, r.node, b.node);
        v += (Math.random() - 0.5) * 0.004;
        if (Math.abs(v) < 0.005) v = 0;
        return { val: Math.abs(v) >= 100 ? fmtN(v, 1) : fmtN(v, 2), unit: 'V', note: '' };
      }
      const vv = this.vdc(sim, r.node, b.node);
      if (Math.abs(vv) > 0.05) return { val: 'Err', unit: 'Ω', note: 'Hay tensión entre las puntas (' + fmtN(vv, 2) + ' V). Quita el contacto, desconecta la batería o el conector antes de medir resistencia.' };
      let R = Math.abs(sim.passive().ohm(r.node, b.node));
      const beep = this.mode === 'C' && R < 30;
      if (!isFinite(R) || R > 40e6) return { val: 'OL', unit: 'Ω', note: '', beep: false };
      let val, unit;
      if (R < 1000) { val = fmtN(R, R < 10 ? 2 : 1); unit = 'Ω'; }
      else if (R < 1e6) { val = fmtN(R / 1000, R < 1e4 ? 3 : 2); unit = 'kΩ'; }
      else { val = fmtN(R / 1e6, 2); unit = 'MΩ'; }
      return { val, unit, note: '', beep };
    }
  }

  /* ---------- Osciloscopio ---------- */
  const TB = [0.0001, 0.0002, 0.0005, 0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5];
  const VD = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20];
  const tbLabel = s => s < 0.001 ? fmtN(s * 1e6, 0) + ' µs' : s < 1 ? fmtN(s * 1000, 0) + ' ms' : s + ' s';
  class Scope {
    constructor(canvas, getSim) {
      this.cv = canvas; this.ctx = canvas.getContext('2d'); this.getSim = getSim;
      this.ch = [{ node: null, label: 'sin sonda', vdiv: 2, pos: -3 }, { node: null, label: 'sin sonda', vdiv: 2, pos: 1 }];
      this.tb = 0.01; this.running = true; this.active = 0; this.data = null; this.N = 500;
    }
    sampleAt(sim, ts) {
      const c = sim.c, x = c.solve(ts);
      return this.ch.map(ch => ch.node ? c.v(x, ch.node) : null);
    }
    acquire() {
      const sim = this.getSim(); if (!sim.c) return;
      const N = this.N, W = 10 * this.tb, dt = W / N;
      const t0 = sim.t;
      const buf = [];
      for (let i = 0; i < 2 * N; i++) buf.push(this.sampleAt(sim, t0 + i * dt));
      let start = 0;
      const lead = this.ch[0].node ? 0 : (this.ch[1].node ? 1 : -1);
      if (lead >= 0) {
        const s = buf.map(b => b[lead]);
        let mn = Infinity, mx = -Infinity; for (const v of s) { if (v < mn) mn = v; if (v > mx) mx = v; }
        const lvl = (mn + mx) / 2, found = mx - mn > 0.15 * this.ch[lead].vdiv;
        let idx = -1;
        if (found) for (let i = Math.round(N * 0.1); i < N; i++) if (s[i - 1] < lvl && s[i] >= lvl) { idx = i; break; }
        if (idx >= 0) start = idx - Math.round(N * 0.1);
        else if (this.tb <= 0.002 && sim.inject && sim.rpm > 30) {
          // disparo por evento de inyección
          const dps = sim.rpm * 6, th = sim.theta(t0);
          let best = null, bestA = 0;
          for (const [cyl, tdc] of [[1, 0], [3, 180], [4, 360], [2, 540]]) {
            const tm = t0 + (((tdc - 4 - th) % 720) + 720) % 720 / dps;
            const a = Math.abs(this.sampleAt(sim, tm + 0.0002)[lead] - this.sampleAt(sim, tm - 0.004)[lead]);
            if (a > bestA) { bestA = a; best = tm; }
          }
          if (best !== null && bestA > 0.5) {
            const ts = best - (W > 0.004 ? 0.0019 : 0.1 * W);
            this.data = []; for (let i = 0; i < N; i++) this.data.push(this.sampleAt(sim, ts + i * dt));
            return;
          }
        }
      }
      this.data = buf.slice(start, start + N);
    }
    measures() {
      if (!this.data) return '';
      const out = [], W = 10 * this.tb;
      this.ch.forEach((ch, k) => {
        if (!ch.node) return;
        const s = this.data.map(d => d[k]);
        let mn = Infinity, mx = -Infinity, sum = 0; for (const v of s) { mn = Math.min(mn, v); mx = Math.max(mx, v); sum += v; }
        const lvl = (mn + mx) / 2; let cr = 0, hi = 0;
        for (let i = 1; i < s.length; i++) { if (s[i - 1] < lvl && s[i] >= lvl) cr++; if (s[i] >= lvl) hi++; }
        let txt = 'CH' + (k + 1) + ': máx ' + fmtN(mx, 2) + ' V · mín ' + fmtN(mn, 2) + ' V · media ' + fmtN(sum / s.length, 2) + ' V';
        if (mx - mn > 0.3 && cr >= 2) txt += ' · ' + fmtN(cr / W, cr / W < 100 ? 1 : 0) + ' Hz · ciclo ' + fmtN(100 * hi / s.length, 0) + ' %';
        out.push(`<span style="color:var(--ch${k + 1})">${txt}</span>`);
      });
      return out.join('');
    }
    autoset() {
      const sim = this.getSim(); if (!sim.c) return;
      const k = this.ch[this.active].node ? this.active : (this.ch[0].node ? 0 : 1);
      if (!this.ch[k].node) return;
      // tensión
      const probe = [];
      for (let i = 0; i < 1200; i++) probe.push(this.sampleAt(sim, sim.t + i * 0.0001)[k]);
      let mn = Math.min(...probe), mx = Math.max(...probe);
      const span = Math.max(Math.abs(mx), Math.abs(mn), mx - mn);
      this.ch[k].vdiv = VD.find(v => v * 5 >= span) || 20;
      this.ch[k].pos = -3;
      // base de tiempos: busca 2–6 ciclos en pantalla
      for (const tb of TB.slice(2)) {
        this.tb = tb; this.acquire();
        const s = this.data.map(d => d[k]); let a = Infinity, b = -Infinity; for (const v of s) { a = Math.min(a, v); b = Math.max(b, v); }
        const l = (a + b) / 2; let cr = 0; for (let i = 1; i < s.length; i++) if (s[i - 1] < l && s[i] >= l) cr++;
        if (b - a > 0.2 && cr >= 2) break;
      }
    }
    draw() {
      const cv = this.cv, ctx = this.ctx, dpr = window.devicePixelRatio || 1;
      const w = cv.clientWidth, h = cv.clientHeight;
      if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#0b1014'; ctx.fillRect(0, 0, w, h);
      const gx = w / 10, gy = h / 8;
      ctx.strokeStyle = 'rgba(160,190,200,0.13)'; ctx.lineWidth = 1;
      for (let i = 1; i < 10; i++) { ctx.beginPath(); ctx.moveTo(Math.round(i * gx) + .5, 0); ctx.lineTo(Math.round(i * gx) + .5, h); ctx.stroke(); }
      for (let j = 1; j < 8; j++) { ctx.beginPath(); ctx.moveTo(0, Math.round(j * gy) + .5); ctx.lineTo(w, Math.round(j * gy) + .5); ctx.stroke(); }
      ctx.strokeStyle = 'rgba(160,190,200,0.3)';
      ctx.beginPath(); ctx.moveTo(0, h / 2 + .5); ctx.lineTo(w, h / 2 + .5); ctx.moveTo(w / 2 + .5, 0); ctx.lineTo(w / 2 + .5, h); ctx.stroke();
      const cols = ['#f5c542', '#3fd0e0'];
      this.ch.forEach((ch, k) => {
        if (!ch.node) return;
        const y0 = h / 2 - ch.pos * gy;
        ctx.fillStyle = cols[k]; ctx.beginPath(); ctx.moveTo(0, y0 - 5); ctx.lineTo(8, y0); ctx.lineTo(0, y0 + 5); ctx.fill();
        ctx.font = '600 10px "IBM Plex Mono", monospace'; ctx.fillText(String(k + 1), 10, y0 + 4);
        if (!this.data) return;
        ctx.save(); ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
        ctx.beginPath();
        this.data.forEach((d, i) => { const x = i / (this.data.length - 1) * w, y = y0 - d[k] / ch.vdiv * gy; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
        ctx.strokeStyle = cols[k]; ctx.lineWidth = 1.6; ctx.lineJoin = 'round'; ctx.stroke(); ctx.restore();
      });
      ctx.font = '11px "IBM Plex Mono", monospace'; ctx.textBaseline = 'top';
      let x = 6;
      this.ch.forEach((ch, k) => { if (!ch.node) return; ctx.fillStyle = cols[k]; const t = 'CH' + (k + 1) + ' ' + fmtN(ch.vdiv, ch.vdiv < 1 ? 1 : 0) + ' V/div'; ctx.fillText(t, x + 14, 5); x += ctx.measureText(t).width + 26; });
      ctx.fillStyle = '#9fb3bc'; ctx.textAlign = 'right'; ctx.fillText(tbLabel(this.tb) + '/div' + (this.running ? '' : ' · PARADO'), w - 6, 5); ctx.textAlign = 'left';
      if (!this.ch[0].node && !this.ch[1].node) { ctx.fillStyle = '#9fb3bc'; ctx.textAlign = 'center'; ctx.fillText('Selecciona CH1 o CH2 y pulsa un punto del esquema', w / 2, h / 2 - 20); ctx.textAlign = 'left'; }
    }
  }

  /* ---------- Equipo de diagnosis ---------- */
  function diagHTML(sim, view) {
    if (sim.key === 'off') return '<div class="diag-off">Pon el contacto para comunicar con la centralita.</div>';
    const e = sim.ecu;
    if (!e) return '<div class="diag-off">Sin comunicación con la centralita. Comprueba su alimentación, sus masas y el relé principal.</div>';
    if (view === 'codes') {
      if (!sim.dtc.size) return '<div class="diag-off">No hay códigos de avería memorizados.</div>';
      return '<ul class="dtcs">' + [...sim.dtc.entries()].map(([c, d]) => `<li><code>${c}</code><span>${d.txt}</span><span class="st${d.present ? ' pr' : ''}">${d.present ? 'Presente' : 'Memorizado (intermitente)'}</span></li>`).join('') + '</ul>';
    }
    const f1 = (v, d) => fmtN(v, d);
    const rows = [
      ['Régimen motor', Math.round(sim.rpm) + ' rpm'],
      ['Temperatura motor', f1(e.tEct, 0) + ' °C · ' + f1(e.vEct, 2) + ' V'],
      ['Temperatura aire', f1(e.tIat, 0) + ' °C · ' + f1(e.vIat, 2) + ' V'],
      ['Presión rail leída', Math.round(e.pRead) + ' bar · ' + f1(e.vRps, 2) + ' V'],
      ['Presión rail objetivo', (sim.rpm > 60 ? Math.round(sim.pTarget || 0) : 0) + ' bar'],
      ['Caudal de aire', f1(e.kgRead, 1) + ' kg/h · ' + f1(e.vMaf, 2) + ' V'],
      ['Presión de sobrealimentación', Math.round(e.barRead * 1000) + ' mbar · ' + f1(e.vMap, 2) + ' V'],
      ['Pedal pista 1 / pista 2', f1(e.vP1, 2) + ' V / ' + f1(e.vP2, 2) + ' V'],
      ['Posición del pedal', Math.round(sim.pedEff * 100) + ' %'],
      ['Tensión de alimentación ECU', f1(e.vbat, 1) + ' V'],
      ['Sincronismo cigüeñal', e.ckpSync ? 'Sí' : 'No'],
      ['Señal árbol de levas', e.cmpOk ? 'Correcta' : 'No detectada'],
      ['Precalentamiento', sim.F.glowOn ? 'Activo' : (sim.glowCmd ? 'Mandado' : 'No')],
      ['Regulador de presión', Math.round(sim.duty.drv * 100) + ' %'],
      ['Electroválvula EGR / turbo', Math.round(sim.duty.egr * 100) + ' % / ' + Math.round(sim.duty.vgt * 100) + ' %'],
    ];
    return '<table class="params"><tbody>' + rows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join('') + '</tbody></table>';
  }

  JT.DMM = DMM; JT.Scope = Scope; JT.diagHTML = diagHTML; JT.TB = TB; JT.VD = VD; JT.tbLabel = tbLabel; JT.fmtN = fmtN;
})(globalThis.JT = globalThis.JT || {});
