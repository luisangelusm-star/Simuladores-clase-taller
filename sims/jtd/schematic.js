/* Dibujo e interacción del esquema eléctrico */
(function (JT) {
  'use strict';
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const P = pts => pts.map(p => p[0] + ',' + p[1]).join(' ');

  function glyph(c) {
    const x = c.x + 10, y = c.y + c.h - 13;
    const coil = (x, y) => `<path class="gl" d="M${x} ${y}h5a3 3 0 0 1 6 0a3 3 0 0 1 6 0a3 3 0 0 1 6 0a3 3 0 0 1 6 0h5"/>`;
    switch (c.type) {
      case 'ckp': return coil(x, y) + `<rect class="glf" x="${x + 8}" y="${y + 4}" width="24" height="3"/><text class="glt" x="${x + 46}" y="${y + 4}">inductivo</text>`;
      case 'cmp': return `<rect class="gl" x="${x}" y="${y - 7}" width="16" height="12"/><text class="glt" x="${x + 4}" y="${y + 3}">H</text><text class="glt" x="${x + 24}" y="${y + 3}">efecto Hall</text>`;
      case 'rps': case 'tmap': return `<circle class="gl" cx="${x + 7}" cy="${y - 1}" r="7"/><text class="glt" x="${x + 4}" y="${y + 3}">P</text>`;
      case 'ect': return `<rect class="gl" x="${x}" y="${y - 5}" width="22" height="9"/><path class="gl" d="M${x - 3} ${y + 8}l28 -18"/><text class="glt" x="${x + 32}" y="${y + 3}">NTC</text>`;
      case 'maf': return `<path class="gl" d="M${x} ${y}c6 -8 10 8 16 0s10 8 16 0"/><text class="glt" x="${x + 40}" y="${y + 3}">hilo caliente</text>`;
      case 'ped': return `<rect class="gl" x="${x}" y="${y - 5}" width="24" height="9"/><path class="gl" d="M${x + 12} ${y - 14}v9"/><path class="glf" d="M${x + 9} ${y - 8}h6l-3 4z"/><text class="glt" x="${x + 32}" y="${y + 3}">×2</text>`;
      case 'inj': case 'drv': case 'sol': return coil(x, y) + `<path class="gl" d="M${x + 44} ${y - 7}v12M${x + 48} ${y - 7}v12"/>`;
      default: return '';
    }
  }
  function gsym(x, y, label) {
    return `<g><path class="gsym" d="M${x} ${y}v4M${x - 9} ${y + 4}h18M${x - 6} ${y + 8}h12M${x - 3} ${y + 12}h6"/><text class="glbl" x="${x + 12}" y="${y + 12}">${label}</text></g>`;
  }
  function plugTab(c, on, x, y, id, label) {
    return `<g class="plug${on ? ' on' : ''}" data-plug="${id}" data-tip="${esc((on ? 'Conectar: ' : label + ': ') + (c ? c.name : ''))}"><rect x="${x}" y="${y}" width="18" height="13" rx="3"/><path d="M${x + 6} ${y + 3}v7M${x + 12} ${y + 3}v7" stroke="currentColor" class="${on ? 'glf' : 'gl'}" style="stroke:var(--${on ? 'accent' : 'ink-soft'})"/></g>`;
  }

  class Schematic {
    constructor(svg, wrap, tip, h) {
      this.svg = svg; this.wrap = wrap; this.tip = tip; this.h = h;
      this.st = { unplug: new Set(), mode: 'measure', marks: {}, sel: null };
      this.z = 1;
      svg.addEventListener('click', e => this.onClick(e));
      svg.addEventListener('pointermove', e => this.onMove(e));
      svg.addEventListener('pointerleave', () => { tip.hidden = true; });
    }
    set(p) { Object.assign(this.st, p); this.render(); }
    zoom(f) { this.setZoom(this.z * f); }
    fit() { this.setZoom(Math.max(0.35, (this.wrap.clientWidth - 4) / 1600)); }
    setZoom(z) { this.z = Math.max(0.3, Math.min(2.5, z)); this.svg.style.width = 1600 * this.z + 'px'; this.svg.style.height = 1150 * this.z + 'px'; }
    render() {
      const M = JT.model, st = this.st, un = st.unplug, o = [];
      o.push(`<defs><pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="var(--grid)" stroke-width="1"/></pattern></defs><rect class="bgrid" x="0" y="0" width="1600" height="1150"/>`);
      // líneas de reparto
      for (const r of M.railLines) o.push(`<polyline class="rail" points="${P(r.pts)}" data-tip="${esc(r.label)}"/>`);
      o.push(`<text class="raillbl" x="150" y="14">+30 batería</text><text class="raillbl" x="600" y="179">+87 relé principal</text>`);
      // cables
      for (const w of M.wires) {
        const cls = 'wire ' + w.kind + (st.sel && st.sel.k === 'wire' && st.sel.id === w.id ? ' sel' : '');
        let best = 0, mid = w.pts[0];
        for (let i = 1; i < w.pts.length; i++) {
          const a = w.pts[i - 1], b = w.pts[i], l = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
          if (l > best) { best = l; mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, a[1] === b[1]]; }
        }
        const tipTxt = (w.kind === 'gnd' || w.kind === 'gecu' ? 'Masa · ' : 'Cable · ') + w.label + ' · ' + w.col + ' (' + JT.colorName(w.col) + ')';
        o.push(`<g class="${cls}" data-wire="${w.id}" data-tip="${esc(tipTxt)}"><polyline class="hit" points="${P(w.pts)}"/><polyline class="ln" points="${P(w.pts)}"/>`);
        if (best > 40) o.push(mid[2] ? `<text class="wcol" x="${mid[0]}" y="${mid[1] - 4}" text-anchor="middle">${w.col}</text>` : `<text class="wcol" x="${mid[0] + 4}" y="${mid[1]}">${w.col}</text>`);
        o.push('</g>');
      }
      for (const [x, y] of M.junctions) o.push(`<circle class="jn" cx="${x}" cy="${y}" r="3.2"/>`);
      for (const g of M.gsyms) { if (g.from) o.push(`<path class="gsym" d="M${g.from[0]} ${g.from[1]}V${g.y}"/>`); o.push(gsym(g.x, g.y, g.label)); }
      // componentes
      for (const c of M.comps) {
        if (c.type === 'gnd') continue;
        const sel = st.sel && st.sel.k === 'comp' && st.sel.id === c.id;
        o.push(`<g class="comp${sel ? ' sel' : ''}" data-comp="${c.id}" data-tip="${esc(c.name + (c.sub ? ' · ' + c.sub : ''))}">`);
        o.push(`<rect class="box${c.id === 'ecu' ? ' ecu' : ''}" x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" rx="${c.type === 'fuse' ? 3 : 6}"/>`);
        if (c.id === 'ecu') {
          o.push(`<text class="cname" x="800" y="600" text-anchor="middle" style="font-size:20px">${c.name}</text><text class="csub" x="800" y="618" text-anchor="middle">${c.sub}</text>`);
          o.push(`<text class="csub" x="800" y="650" text-anchor="middle">Conector K: motor · Conector A: vehículo</text>`);
        } else if (c.type === 'fuse') {
          o.push(`<path class="gl" d="M${c.x + 10} ${c.y + 4}v${c.h - 8}"/><text class="cname" x="${c.x + c.w + 6}" y="${c.y + c.h / 2 - 1}">${c.name}</text><text class="csub" x="${c.x + c.w + 6}" y="${c.y + c.h / 2 + 11}">${c.sub}</text>`);
        } else if (c.type === 'gp') {
          o.push(`<path class="gl" d="M${c.x + 16} ${c.y + 6}l-6 5l12 5l-12 5l12 5l-6 4"/><text class="pnum" x="${c.x - 4}" y="${c.y + 22}" text-anchor="end">${c.id.slice(2)}</text>`);
        } else {
          const tx = c.x + 8;
          o.push(`<text class="cname" x="${tx}" y="${c.y + 16}">${esc(c.name)}</text>`);
          if (c.sub && c.h >= 50) o.push(`<text class="csub" x="${tx}" y="${c.y + 29}">${esc(c.sub)}</text>`);
          if (c.h >= 60) o.push(glyph(c));
          if (c.type === 'stt') o.push(`<circle class="gl" cx="${c.x + 96}" cy="${c.y + 38}" r="10"/><text class="glt" x="${c.x + 92}" y="${c.y + 42}">M</text>`);
          if (c.type === 'bat') o.push(`<path class="gl" d="M${c.x + 30} ${c.y + 48}h40M${c.x + 38} ${c.y + 56}h24"/><text class="glt" x="${c.x + 76}" y="${c.y + 52}">+</text>`);
          if (c.type === 'rel') o.push(`<rect class="gl" x="${c.x + 8}" y="${c.y + 30}" width="22" height="12"/><path class="gl" d="M${c.x + 50} ${c.y + 50}l22 -10M${c.x + 72} ${c.y + 50}h8"/>`);
        }
        // números de pin
        for (const [p, d] of Object.entries(c.pins)) {
          if (c.id === 'ecu') {
            const t = d.side === 'L' ? `x="${d.x + 7}" y="${d.y + 3}"` : d.side === 'R' ? `x="${d.x - 7}" y="${d.y + 3}" text-anchor="end"` : d.side === 'T' ? `x="${d.x}" y="${d.y + 15}" text-anchor="middle"` : `x="${d.x}" y="${d.y - 7}" text-anchor="middle"`;
            o.push(`<text class="epin" ${t}>${p}</text>`);
          } else if (c.type !== 'fuse' && c.type !== 'gp') {
            const t = d.side === 'R' ? `x="${d.x - 6}" y="${d.y + 3}" text-anchor="end"` : d.side === 'L' ? `x="${d.x + 6}" y="${d.y + 3}"` : d.side === 'T' ? `x="${d.x + 4}" y="${d.y - 3}"` : `x="${d.x + 4}" y="${d.y + 11}"`;
            if (!(c.h < 60 && (d.side === 'L' || d.side === 'R') && c.type !== 'glw' && c.type !== 'rel')) o.push(`<text class="pnum" ${t}>${p}</text>`);
            else o.push(`<text class="pnum" ${t}>${p}</text>`);
          }
        }
        o.push('</g>');
        // pestañas de conector
        if (c.id === 'ecu') {
          for (const [k, yy] of [['ecuK', 668], ['ecuA', 690]]) {
            const on = un.has(k);
            o.push(`<g class="plug${on ? ' on' : ''}" data-plug="${k}" data-tip="${on ? 'Conectar' : 'Desconectar'} el conector ${k.slice(3)} de la ECU"><rect x="742" y="${yy}" width="116" height="17" rx="4"/><text x="800" y="${yy + 12}" text-anchor="middle">${on ? 'conectar' : 'desconectar'} ${k.slice(3)}</text></g>`);
          }
        } else if (c.plug) {
          const on = un.has(c.id);
          let px = c.x + c.w - 21, py = c.y + 3;
          if (c.type === 'fuse' || c.type === 'gp') { px = c.x + c.w + 3; py = c.type === 'fuse' ? c.y + c.h + 3 : c.y + 2; }
          if (c.type === 'fuse' && c.id === 'f15') { px = c.x - 22; py = c.y + 8; }
          if (c.id === 'glw') px = c.x + c.w - 44;
          o.push(plugTab(c, on, px, py, c.id, c.plugText || 'Desconectar'));
        }
        // conector abierto
        const unAll = c.id === 'ecu' ? null : un.has(c.id);
        for (const [p, d] of Object.entries(c.pins)) {
          const isUn = c.id === 'ecu' ? un.has(p[0] === 'A' ? 'ecuA' : 'ecuK') : unAll;
          if (!isUn) continue;
          const [nx, ny] = JT.model.NORM[d.side];
          const gx = d.x - nx * 7, gy = d.y - ny * 7;
          o.push(nx ? `<path class="gap" d="M${gx} ${gy - 8}v16"/>` : `<path class="gap" d="M${gx - 8} ${gy}h16"/>`);
        }
      }
      // puntos de medida
      for (const pt of M.probePoints(un)) {
        const isSel = st.sel && st.sel.k === 'pin' && st.sel.comp === pt.comp && st.sel.pin === pt.pin;
        const tipTxt = pt.label + (pt.desc ? ' · ' + pt.desc : '');
        o.push(`<g data-node="${esc(pt.node)}" data-x="${pt.x}" data-y="${pt.y}" ${pt.comp ? `data-pc="${pt.comp}" data-pp="${esc(pt.pin)}"` : ''} data-tip="${esc(tipTxt)}"><circle cx="${pt.x}" cy="${pt.y}" r="10" fill="transparent"/><circle class="pp${pt.term ? ' term' : ''}" cx="${pt.x}" cy="${pt.y}" r="${isSel ? 6 : 4.2}"${isSel ? ' style="stroke:var(--accent);stroke-width:2.5"' : ''}/></g>`);
      }
      // marcas de puntas
      const lab = { red: '+', black: 'COM', ch1: '1', ch2: '2' };
      for (const [k, m] of Object.entries(st.marks)) {
        if (!m) continue;
        const dx = { red: 10, black: 10, ch1: -10, ch2: -10 }[k], dy = { red: -10, black: 14, ch1: -10, ch2: 14 }[k];
        o.push(`<g class="mk ${k}" pointer-events="none"><circle cx="${m.x}" cy="${m.y}" r="8"/><text x="${m.x + dx}" y="${m.y + dy}" text-anchor="${dx > 0 ? 'start' : 'end'}">${lab[k]}</text></g>`);
      }
      this.svg.innerHTML = o.join('');
      this.svg.classList.toggle('repair', st.mode === 'repair');
    }
    onClick(e) {
      const t = e.target;
      const plug = t.closest('[data-plug]');
      if (plug) { this.h.plug(plug.dataset.plug); return; }
      const node = t.closest('[data-node]');
      if (this.st.mode === 'measure') {
        if (node) this.h.probe({ node: node.dataset.node, x: +node.dataset.x, y: +node.dataset.y, label: node.dataset.tip });
        return;
      }
      if (node && node.dataset.pc) { this.h.repair({ k: 'pin', comp: node.dataset.pc, pin: node.dataset.pp }, node.dataset.tip); return; }
      const w = t.closest('[data-wire]');
      if (w) { this.h.repair({ k: 'wire', id: w.dataset.wire }, w.dataset.tip); return; }
      const c = t.closest('[data-comp]');
      if (c) this.h.repair({ k: 'comp', id: c.dataset.comp }, c.dataset.tip);
    }
    onMove(e) {
      const el = e.target.closest('[data-tip]');
      if (!el) { this.tip.hidden = true; return; }
      const r = this.wrap.getBoundingClientRect();
      this.tip.textContent = el.dataset.tip;
      this.tip.hidden = false;
      let x = e.clientX - r.left + this.wrap.scrollLeft + 14, y = e.clientY - r.top + this.wrap.scrollTop + 14;
      if (e.clientX - r.left > r.width - 260) x -= 280;
      this.tip.style.left = x + 'px'; this.tip.style.top = y + 'px';
    }
  }
  JT.Schematic = Schematic;
})(globalThis.JT = globalThis.JT || {});
