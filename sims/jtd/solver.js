/* Solver nodal: resistencias, fuentes (Norton) e interruptores dinámicos (Woodbury) */
(function (JT) {
  'use strict';
  const GND = 'bat.-';
  const LEAK = 1e-9;

  function luFactor(A, n) {
    const piv = new Int32Array(n);
    for (let i = 0; i < n; i++) piv[i] = i;
    for (let k = 0; k < n; k++) {
      let p = k, m = Math.abs(A[k * n + k]);
      for (let i = k + 1; i < n; i++) { const v = Math.abs(A[i * n + k]); if (v > m) { m = v; p = i; } }
      if (p !== k) {
        for (let j = 0; j < n; j++) { const t = A[k * n + j]; A[k * n + j] = A[p * n + j]; A[p * n + j] = t; }
        const t = piv[k]; piv[k] = piv[p]; piv[p] = t;
      }
      const d = A[k * n + k] || 1e-300;
      for (let i = k + 1; i < n; i++) {
        const f = A[i * n + k] / d;
        if (f === 0) continue;
        A[i * n + k] = f;
        const ri = i * n, rk = k * n;
        for (let j = k + 1; j < n; j++) A[ri + j] -= f * A[rk + j];
      }
    }
    return piv;
  }
  function luSolve(A, piv, n, b) {
    const x = new Float64Array(n);
    for (let i = 0; i < n; i++) x[i] = b[piv[i]];
    for (let i = 0; i < n; i++) { let s = x[i]; const r = i * n; for (let j = 0; j < i; j++) s -= A[r + j] * x[j]; x[i] = s; }
    for (let i = n - 1; i >= 0; i--) { let s = x[i]; const r = i * n; for (let j = i + 1; j < n; j++) s -= A[r + j] * x[j]; x[i] = s / A[r + i]; }
    return x;
  }
  function smallSolve(M, w, k) {
    const a = M.map(r => r.slice()), b = w.slice();
    for (let c = 0; c < k; c++) {
      let p = c; for (let i = c + 1; i < k; i++) if (Math.abs(a[i][c]) > Math.abs(a[p][c])) p = i;
      [a[c], a[p]] = [a[p], a[c]]; [b[c], b[p]] = [b[p], b[c]];
      const d = a[c][c] || 1e-300;
      for (let i = c + 1; i < k; i++) { const f = a[i][c] / d; for (let j = c; j < k; j++) a[i][j] -= f * a[c][j]; b[i] -= f * b[c]; }
    }
    const x = new Array(k).fill(0);
    for (let i = k - 1; i >= 0; i--) { let s = b[i]; for (let j = i + 1; j < k; j++) s -= a[i][j] * x[j]; x[i] = s / (a[i][i] || 1e-300); }
    return x;
  }

  class Circuit {
    constructor(E) {
      const idx = new Map(); let n = 0;
      const id = name => { if (name === GND) return -1; let i = idx.get(name); if (i === undefined) { i = n++; idx.set(name, i); } return i; };
      for (const e of E) { e.ia = id(e.a); e.ib = id(e.b); }
      this.idx = idx; this.n = n;
      const G = new Float64Array(n * n);
      const stamp = (a, b, g) => {
        if (a >= 0) G[a * n + a] += g;
        if (b >= 0) G[b * n + b] += g;
        if (a >= 0 && b >= 0) { G[a * n + b] -= g; G[b * n + a] -= g; }
      };
      this.srcs = []; this.sws = [];
      for (const e of E) {
        if (e.t === 'R') { if (isFinite(e.r) && e.r > 0) stamp(e.ia, e.ib, 1 / e.r); }
        else if (e.t === 'V') { stamp(e.ia, e.ib, 1 / e.r); this.srcs.push(e); }
        else if (e.t === 'S') { this.sws.push(e); }
      }
      for (let i = 0; i < n; i++) G[i * n + i] += LEAK;
      this.piv = luFactor(G, n); this.LU = G;
      for (const s of this.srcs) {
        const b = new Float64Array(n);
        if (s.ia >= 0) b[s.ia] += 1 / s.r; if (s.ib >= 0) b[s.ib] -= 1 / s.r;
        s.y = luSolve(this.LU, this.piv, n, b);
      }
      for (const s of this.sws) {
        const u = new Float64Array(n);
        if (s.ia >= 0) u[s.ia] = 1; if (s.ib >= 0) u[s.ib] = -1;
        s.z = luSolve(this.LU, this.piv, n, u); s.g = 1 / s.r;
      }
      this.srcById = {}; for (const s of this.srcs) this.srcById[s.id] = s;
    }
    has(name) { return name === GND || this.idx.has(name); }
    v(x, name) { if (name === GND) return 0; const i = this.idx.get(name); return i === undefined ? 0 : x[i]; }
    // so: overrides de interruptores {id:bool, '*':bool}; vo: overrides de fuentes {id:valor}
    solve(t, so, vo) {
      const n = this.n, x = new Float64Array(n);
      for (const s of this.srcs) {
        let v = vo && vo[s.id] !== undefined ? vo[s.id] : (typeof s.v === 'function' ? s.v(t) : s.v);
        if (!v) continue;
        const y = s.y; for (let i = 0; i < n; i++) x[i] += v * y[i];
      }
      const on = [];
      for (const s of this.sws) {
        let st;
        if (so && so[s.id] !== undefined) st = so[s.id];
        else if (so && so['*'] !== undefined) st = so['*'];
        else st = typeof s.on === 'function' ? s.on(t) : s.on;
        if (st) on.push(s);
      }
      const k = on.length;
      if (!k) return x;
      const gv = (vec, i) => (i >= 0 ? vec[i] : 0);
      const M = [], w = [];
      for (let p = 0; p < k; p++) {
        const sp = on[p], row = [];
        for (let q = 0; q < k; q++) row.push((p === q ? 1 / sp.g : 0) + gv(on[q].z, sp.ia) - gv(on[q].z, sp.ib));
        M.push(row); w.push(gv(x, sp.ia) - gv(x, sp.ib));
      }
      const c = smallSolve(M, w, k);
      for (let q = 0; q < k; q++) { const z = on[q].z, cq = c[q]; if (!cq) continue; for (let i = 0; i < n; i++) x[i] -= cq * z[i]; }
      return x;
    }
    // ganancia de una fuente entre dos nodos (V/V)
    gain(srcId, a, b) {
      const s = this.srcById[srcId]; if (!s) return 0;
      const g = name => { if (name === GND) return 0; const i = this.idx.get(name); return i === undefined ? 0 : s.y[i]; };
      return g(a) - g(b);
    }
    // resistencia equivalente entre dos nodos (circuito pasivo)
    ohm(a, b) {
      if (a === b) return 0;
      const ia = a === GND ? -1 : this.idx.get(a), ib = b === GND ? -1 : this.idx.get(b);
      if (ia === undefined || ib === undefined) return Infinity;
      const n = this.n, u = new Float64Array(n);
      if (ia >= 0) u[ia] = 1; if (ib >= 0) u[ib] = -1;
      const z = luSolve(this.LU, this.piv, n, u);
      return (ia >= 0 ? z[ia] : 0) - (ib >= 0 ? z[ib] : 0);
    }
  }
  JT.GND = GND;
  JT.Circuit = Circuit;
})(globalThis.JT = globalThis.JT || {});
