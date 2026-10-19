/* =========================================================================
   ORGANISMO · la colonia colectiva
   - Tallos (VÍNCULO): cadenas de nodos con física de posiciones; las ramas
     comparten nodo con su tallo madre, así se tiran entre sí.
   - Zooides (PULSO): se alojan en "slots" a los lados de cada nodo.
   - Ondas (IMPACTO): se propagan, empujan la estructura y la tiñen.
   - Corazón (COLECTIVO): en la raíz, mezcla de todos los aportes.
   ========================================================================= */

class Node {
  constructor(x, y) {
    this.x = x; this.y = y; this.px = x; this.py = y;
    this.vx = 0; this.vy = 0; this.fx = 0; this.fy = 0;
  }
}

class Stem {
  constructor(org, base, heading, depth, parent) {
    this.org = org;
    this.nodes = [base];
    this.rest = [];
    this.slots = [];          // slots[i] ↔ nodes[i+1]: [lado A, lado B]
    this.heading = heading;
    this.depth = depth;
    this.parent = parent;
    this.children = 0;
    this.seed = Math.random() * 1000;
    this.scale = Math.max(0.55, 1 - depth * 0.15);
    this.col = parent ? parent.colB.slice() : U.hex(PALETTE.verde);
    this.colB = U.hex(PALETTE[parent ? BASES[(Math.random() * BASES.length) | 0] : 'violeta']);
    this.tCol = this.col.slice();
    this.tColB = this.colB.slice();
    this.g = null;
  }
  get segCount() { return this.nodes.length - 1; }
  get tip() { return this.nodes[this.nodes.length - 1]; }

  grow() {
    const n = this.nodes, tip = this.tip;
    let dx, dy;
    if (n.length > 1) {
      const p = n[n.length - 2];
      dx = tip.x - p.x; dy = tip.y - p.y;
      const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
    } else { dx = Math.cos(this.heading); dy = Math.sin(this.heading); }
    const nn = new Node(tip.x + dx * 1.5, tip.y + dy * 1.5);
    n.push(nn);
    this.rest.push(1.5);
    this.slots.push([null, null]);
    this.org.nodes.push(nn);
    return this.slots.length - 1;
  }
}

class Organism {
  constructor() {
    this.t = 0;
    this.stems = [];
    this.nodes = [];
    this.zooids = [];
    this.links = new Map();
    this.waves = [];
    this.waveId = 0;
    this.linkTimer = 0;
    this.current = 0;
    this.breath = 1;
    this.maturity = 0;
    this.heartKick = 0;
    this.countBy = { pulso: 0, vinculo: 0, impacto: 0 };
    this.total = 0;
    this._w = { dx: 0, dy: 0, e: 0 };
    this.detailLimit = Infinity;   // calidad adaptativa (ver sketch.js)

    this.anchor = { x: W.w * 0.46, y: W.h * 0.5 };
    this.root = new Node(this.anchor.x, this.anchor.y);
    this.nodes.push(this.root);
    const main = new Stem(this, this.root, Math.random() * U.TAU, 0, null);
    this.stems.push(main);
    this.growing = main;
    for (let i = 0; i < 3; i++) main.grow();
  }

  segLen(stem) {
    // reorganización: al crecer la colonia, los segmentos se compactan
    const k = U.clamp(1.1 - this.zooids.length / 500, 0.62, 1.1);
    return CONFIG.stemSegment * W.S * k * stem.scale;
  }

  rescale(ow, oh) {
    const sx = W.w / ow, sy = W.h / oh;
    for (const n of this.nodes) { n.x *= sx; n.y *= sy; n.px *= sx; n.py *= sy; }
    for (const z of this.zooids) { z.x *= sx; z.y *= sy; }
  }

  /* ---------------- incorporación de aportes ---------------- */

  findSlot() {
    const maxSeg = (st) => Math.max(3, Math.round(CONFIG.maxSegments * st.scale));
    const free = (st, from) => {
      for (let i = st.slots.length - 1; i >= Math.max(0, from); i--) {
        const order = Math.random() < 0.5 ? [0, 1] : [1, 0];
        for (const side of order) {
          const z = st.slots[i][side];
          if (!z || z.state === 'fading') return { stem: st, i, side };
        }
      }
      return null;
    };
    const s = this.growing;
    let f = free(s, s.slots.length - 2);
    if (f) return f;
    const wantBranch = s.segCount >= 4 && Math.random() < CONFIG.branchChance;
    if (s.segCount < maxSeg(s) && !wantBranch) return { stem: s, i: s.grow(), side: Math.random() < 0.5 ? 0 : 1 };
    if (this.stems.length < CONFIG.maxStems) {
      const b = this.branch();
      if (b) { this.growing = b; return { stem: b, i: b.grow(), side: Math.random() < 0.5 ? 0 : 1 }; }
    }
    for (const st of this.stems) if (st.segCount < maxSeg(st)) { this.growing = st; return { stem: st, i: st.grow(), side: 0 }; }
    const shuffled = this.stems.slice().sort(() => Math.random() - 0.5);
    for (const st of shuffled) { f = free(st, 0); if (f) return f; }
    return null;
  }

  branch() {
    const cands = this.stems.filter((s) => s.segCount >= 3);
    if (!cands.length) return null;
    let best = null, bw = -1;
    for (const s of cands) {
      const w = Math.random() / (1 + s.children * 1.5) / (1 + s.depth * 0.6);
      if (w > bw) { bw = w; best = s; }
    }
    const i = 1 + Math.floor(Math.random() * (best.segCount - 1));
    const a = best.nodes[i - 1], b = best.nodes[i + 1] || best.nodes[i];
    const tang = Math.atan2(b.y - a.y, b.x - a.x);
    const side = Math.random() < 0.5 ? -1 : 1;
    const heading = tang + side * (Math.PI / 2 - 0.4 + Math.random() * 0.5);
    const s = new Stem(this, best.nodes[i], heading, best.depth + 1, best);
    best.children++;
    this.stems.push(s);
    return s;
  }

  addPulse(pulse, opts = {}) {
    const active = this.zooids.filter((z) => z.state !== 'fading');
    let slot = null;
    if (active.length >= CONFIG.maxZooids && active[0]) {
      const old = active[0]; old.fade();
      slot = { stem: old.stem, i: old.i, side: old.side };
    } else slot = this.findSlot();
    if (!slot) {
      const old = active[0]; if (!old) return null;
      old.fade(); slot = { stem: old.stem, i: old.i, side: old.side };
    }
    if (opts.instant) slot.stem.rest[slot.i] = this.segLen(slot.stem);
    const z = new Zooid(this, pulse, slot.stem, slot.i, slot.side, opts);
    slot.stem.slots[slot.i][slot.side] = z;
    this.zooids.push(z);
    if (opts.instant) this.tintStem(z, 0.35);
    return z;
  }

  tintStem(z, k) {
    const s = z.stem;
    U.mixInto(s.tCol, z.base, k);
    U.mixInto(s.tColB, z.accent, k * 0.85);
    if (s.parent) U.mixInto(s.parent.tColB, z.accent, k * 0.25);
  }

  // VÍNCULO + IMPACTO: la forma se acopla
  onDock(z) {
    this.addWave(z.x, z.y, z.accent, 0.6 + 0.6 * z.f.energy, z);
    z.excite = 1.2;
    this.tintStem(z, 0.35);
    this.heartKick = 1;
    this.updateLinks(false, z);
  }

  addWave(x, y, color, k, src) {
    this.waves.push({ id: ++this.waveId, x, y, t0: this.t, color, k, src, spin: Math.random() < 0.5 ? -1 : 1 });
    if (this.waves.length > 8) this.waves.shift();
  }

  // desplazamiento + energía de todas las ondas en un punto (objeto reutilizado)
  waveAt(x, y) {
    const out = this._w; out.dx = 0; out.dy = 0; out.e = 0;
    const sp = CONFIG.waveSpeed * W.S, wid = CONFIG.waveWidth * W.S;
    for (let i = 0; i < this.waves.length; i++) {
      const w = this.waves[i];
      const age = this.t - w.t0, r = age * sp;
      const ddx = x - w.x, ddy = y - w.y;
      const d = Math.hypot(ddx, ddy) || 1;
      const q = (d - r) / wid;
      if (q > 3 || q < -3) continue;
      const v = Math.exp(-q * q) * Math.exp(-age / CONFIG.waveDecay) * w.k;
      out.e += v;
      out.dx += (ddx / d) * v - (ddy / d) * v * 0.35 * w.spin;
      out.dy += (ddy / d) * v + (ddx / d) * v * 0.35 * w.spin;
    }
    return out;
  }

  updateLinks(instant, newcomer) {
    const act = this.zooids.filter((z) => z.state === 'attached');
    const want = new Set();
    const reach = CONFIG.linkReach * W.S, K = Math.round(CONFIG.links);
    for (const z of act) {
      const near = [];
      for (const o of act) {
        if (o === z) continue;
        if (o.stem === z.stem && Math.abs(o.i - z.i) <= 1) continue;
        const d = Math.hypot(o.x - z.x, o.y - z.y);
        if (d < reach) near.push([d, o]);
      }
      near.sort((p, q) => p[0] - q[0]);
      for (let k = 0; k < Math.min(K, near.length); k++) {
        const o = near[k][1];
        const key = z.uid < o.uid ? z.uid + '-' + o.uid : o.uid + '-' + z.uid;
        want.add(key);
        if (!this.links.has(key)) {
          // el vínculo nace desde la forma recién llegada
          const a = newcomer === o ? o : z, b = a === z ? o : z;
          this.links.set(key, { a, b, s: instant ? 1 : 0, g: instant ? 1 : 0, target: 1,
                                seed: Math.random() * 100, cross: 1 + Math.floor(Math.random() * 3) });
        }
      }
    }
    for (const [k, L] of this.links) L.target = want.has(k) ? 1 : 0;
  }

  warmup(sec) {
    for (let i = 0; i < sec * 60; i++) this.update(1 / 60);
    this.waves.length = 0;
    this.updateLinks(true);
  }

  /* ---------------- simulación ---------------- */

  update(dt) {
    if (dt <= 0) return;
    this.t += dt;
    const t = this.t;

    // estado colectivo
    const cb = this.countBy; cb.pulso = cb.vinculo = cb.impacto = 0;
    let act = 0;
    for (const z of this.zooids) if (z.state !== 'fading') { cb[z.f.accent]++; act++; }
    this.total = act;
    this.maturity = U.clamp(act / 160, 0, 1);
    const period = 7 + this.maturity * 5;     // la colonia madura respira más lento
    this.breath = 1 + CONFIG.breathing * 0.035 * Math.sin((t / period) * U.TAU);
    this.heartKick *= Math.exp(-dt * 1.2);
    this.current = noise(t * 0.02, 11) * U.TAU * 2;

    this.anchor.x = W.w * (0.5 + 0.14 * (noise(t * 0.012, 3) - 0.5) * 2);
    this.anchor.y = W.h * (0.5 + 0.12 * (noise(7, t * 0.012) - 0.5) * 2);

    for (const s of this.stems) {
      const target = this.segLen(s), k = Math.min(1, dt * 0.9);
      for (let i = 0; i < s.rest.length; i++) s.rest[i] += (target - s.rest[i]) * k;
      U.mixInto(s.col, s.tCol, Math.min(1, dt * 0.3));
      U.mixInto(s.colB, s.tColB, Math.min(1, dt * 0.3));
    }

    this.physics(dt);

    for (const z of this.zooids) z.update(dt);
    if (this.zooids.some((z) => z.dead)) {
      for (const z of this.zooids) if (z.dead && z.stem.slots[z.i][z.side] === z) z.stem.slots[z.i][z.side] = null;
      this.zooids = this.zooids.filter((z) => !z.dead);
    }

    this.waves = this.waves.filter((w) => t - w.t0 < CONFIG.waveDecay * 5);

    this.linkTimer -= dt;
    if (this.linkTimer <= 0) { this.updateLinks(false); this.linkTimer = 2.5; }
    const lk = 1 - Math.exp(-dt * 1.2);
    for (const [k, L] of this.links) {
      if (L.a.dead || L.b.dead) { this.links.delete(k); continue; }
      L.s += (L.target - L.s) * lk;
      if (L.target > 0) L.g = Math.min(1, L.g + dt * 0.55);
      if (L.target === 0 && L.s < 0.02) this.links.delete(k);
    }
  }

  physics(dt) {
    const N = this.nodes, S = W.S, t = this.t;
    const fs = 0.0016 / S;
    const drift = CONFIG.drift * 38 * S * (1 - 0.35 * this.maturity);
    const m = Math.min(W.w, W.h) * 0.08;

    let cx = 0, cy = 0;
    for (const n of N) { cx += n.x; cy += n.y; }
    cx /= N.length; cy /= N.length;
    const gx = (W.w / 2 - cx) * 0.15, gy = (W.h / 2 - cy) * 0.15;
    const wk = CONFIG.waveAmp * 520 * S;

    for (const n of N) {
      const a = noise(n.x * fs, n.y * fs, t * 0.05) * U.TAU * 2;
      n.fx = Math.cos(a) * drift + gx;
      n.fy = Math.sin(a) * drift + gy;
      if (n.x < m) n.fx += (m - n.x) * 1.2;
      if (n.x > W.w - m) n.fx -= (n.x - (W.w - m)) * 1.2;
      if (n.y < m) n.fy += (m - n.y) * 1.2;
      if (n.y > W.h - m) n.fy -= (n.y - (W.h - m)) * 1.2;
      if (this.waves.length) { const w = this.waveAt(n.x, n.y); n.fx += w.dx * wk; n.fy += w.dy * wk; }
    }
    this.root.fx += (this.anchor.x - this.root.x) * 3;
    this.root.fy += (this.anchor.y - this.root.y) * 3;

    // repulsión entre nodos: la colonia se expande y se reorganiza
    const R = CONFIG.stemSegment * S * 2, R2 = R * R, kr = CONFIG.repulsion * 1400 * S;
    for (let i = 0; i < N.length; i++) {
      const a = N[i];
      for (let j = i + 1; j < N.length; j++) {
        const b = N[j];
        const dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
        if (d2 >= R2 || d2 < 0.01) continue;
        const d = Math.sqrt(d2), f = (kr * (1 - d / R)) / d;
        a.fx -= dx * f; a.fy -= dy * f; b.fx += dx * f; b.fy += dy * f;
      }
    }
    // las puntas empujan hacia adelante (crecimiento)
    for (const s of this.stems) {
      if (s.segCount < 1) continue;
      const tip = s.tip, p = s.nodes[s.nodes.length - 2];
      const dx = tip.x - p.x, dy = tip.y - p.y, d = Math.hypot(dx, dy) || 1;
      tip.fx += (dx / d) * 30 * S; tip.fy += (dy / d) * 30 * S;
    }

    const damp = Math.pow(0.9, dt * 60);
    for (const n of N) {
      n.vx = (n.vx + n.fx * dt) * damp; n.vy = (n.vy + n.fy * dt) * damp;
      n.px = n.x; n.py = n.y;
      n.x += n.vx * dt; n.y += n.vy * dt;
    }
    for (let it = 0; it < 4; it++) {
      for (const s of this.stems) {
        const n = s.nodes;
        for (let i = 0; i < s.segCount; i++) this.solve(n[i], n[i + 1], s.rest[i], 1);
        for (let i = 0; i < s.segCount - 1; i++) this.solve(n[i], n[i + 2], (s.rest[i] + s.rest[i + 1]) * 0.96, 0.22);
      }
    }
    for (const n of N) { n.vx = (n.x - n.px) / dt; n.vy = (n.y - n.py) / dt; }
  }

  solve(a, b, r, k) {
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.0001;
    const diff = ((d - r) / d) * k * 0.5;
    a.x += dx * diff; a.y += dy * diff; b.x -= dx * diff; b.y -= dy * diff;
  }

  /* ---------------- dibujo ---------------- */

  geo(s) {
    const n = s.nodes, m = n.length;
    if (m < 2) { if (s.g) s.g.n = 0; return; }
    const steps = 6, cnt = (m - 1) * steps + 1;
    if (!s.g || s.g.cap < cnt) {
      const cap = cnt + 60;
      s.g = { cap, n: 0, x: new Float32Array(cap), y: new Float32Array(cap), nx: new Float32Array(cap),
              ny: new Float32Array(cap), R: new Float32Array(cap), arc: new Float32Array(cap) };
    }
    const g = s.g;
    let k = 0;
    for (let i = 0; i < m - 1; i++) {
      const p0 = n[Math.max(0, i - 1)], p1 = n[i], p2 = n[i + 1], p3 = n[Math.min(m - 1, i + 2)];
      for (let st = 0; st < steps; st++) {
        const t = st / steps, t2 = t * t, t3 = t2 * t;
        g.x[k] = 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
        g.y[k] = 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
        k++;
      }
    }
    g.x[k] = n[m - 1].x; g.y[k] = n[m - 1].y; k++;
    g.n = k;

    const S = W.S, t = this.t;
    let arc = 0;
    for (let i = 0; i < k; i++) {
      const a = i > 0 ? i - 1 : 0, b = i < k - 1 ? i + 1 : k - 1;
      const tx = g.x[b] - g.x[a], ty = g.y[b] - g.y[a], d = Math.hypot(tx, ty) || 1;
      g.nx[i] = -ty / d; g.ny[i] = tx / d;
      if (i > 0) arc += Math.hypot(g.x[i] - g.x[i - 1], g.y[i] - g.y[i - 1]);
      g.arc[i] = arc;
      const uN = i / (k - 1);
      let R = CONFIG.strandRadius * S * s.scale * (1 - 0.5 * uN) * this.breath;
      R *= 1 + CONFIG.peristalsis * 0.28 * Math.sin(arc / (22 * S) - t * 2.2 + s.seed);
      if (this.waves.length) R *= 1 + Math.min(1.5, this.waveAt(g.x[i], g.y[i]).e) * 0.8;
      g.R[i] = R;
    }
  }

  draw(ctx) {
    for (const s of this.stems) this.geo(s);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    this.drawWaves(ctx);
    const cut = this.zooids.length - Math.min(CONFIG.detailCount, this.detailLimit);
    for (let i = 0; i < this.zooids.length; i++) this.zooids[i].lodFlag = i < cut;
    this.drawLinks(ctx);
    for (const s of this.stems) this.drawStrands(ctx, s, false);
    for (const s of this.stems) this.drawMembrane(ctx, s);
    for (const s of this.stems) this.drawStrands(ctx, s, true);
    for (let i = 0; i < this.zooids.length; i++) this.zooids[i].draw(ctx, i < cut);

    this.drawHeart(ctx);
  }

  drawStrands(ctx, s, front) {
    const g = s.g;
    if (!g || g.n < 2) return;
    const Sn = Math.max(1, Math.round(CONFIG.strands)), S = W.S, t = this.t;
    const x0 = g.x[0], y0 = g.y[0], x1 = g.x[g.n - 1], y1 = g.y[g.n - 1];
    const tw = CONFIG.twist / S;
    for (let j = 0; j < Sn; j++) {
      const ph0 = t * CONFIG.twistSpeed * (1 - 0.4 * this.maturity) + (j * U.TAU) / Sn + s.seed;
      const cA = j % 2 ? s.colB : s.col, cB = j % 2 ? s.col : s.colB;
      const gr = ctx.createLinearGradient(x0, y0, x1, y1);
      gr.addColorStop(0, U.rgba(cA, front ? 0.95 : 0.4));
      gr.addColorStop(1, U.rgba(cB, front ? 0.85 : 0.3));
      ctx.strokeStyle = gr;
      ctx.lineWidth = (front ? 1.7 : 0.8) * S * (0.7 + 0.3 * s.scale);
      ctx.beginPath();
      let inRun = false, lx = 0, ly = 0;
      for (let i = 0; i < g.n; i++) {
        const ph = g.arc[i] * tw + ph0;
        const isFront = Math.cos(ph) >= 0;
        const off = g.R[i] * Math.sin(ph);
        const px = g.x[i] + g.nx[i] * off, py = g.y[i] + g.ny[i] * off;
        if (isFront === front) {
          if (!inRun) { if (i > 0) ctx.moveTo(lx, ly), ctx.lineTo(px, py); else ctx.moveTo(px, py); inRun = true; }
          else ctx.lineTo(px, py);
        } else if (inRun) { ctx.lineTo(px, py); inRun = false; }
        lx = px; ly = py;
      }
      ctx.stroke();
    }
  }

  drawMembrane(ctx, s) {
    const g = s.g, mb = CONFIG.membrane;
    if (!g || g.n < 2 || mb <= 0) return;
    ctx.beginPath();
    for (let i = 0; i < g.n; i++) {
      const r = g.R[i] * 1.5, x = g.x[i] + g.nx[i] * r, y = g.y[i] + g.ny[i] * r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    for (let i = g.n - 1; i >= 0; i--) {
      const r = g.R[i] * 1.5;
      ctx.lineTo(g.x[i] - g.nx[i] * r, g.y[i] - g.ny[i] * r);
    }
    ctx.closePath();
    const gr = ctx.createLinearGradient(g.x[0], g.y[0], g.x[g.n - 1], g.y[g.n - 1]);
    gr.addColorStop(0, U.rgba(s.col, 0.2 * mb));
    gr.addColorStop(1, U.rgba(s.colB, 0.12 * mb));
    ctx.fillStyle = gr;
    ctx.fill();
  }

  drawLinks(ctx) {
    const S = W.S, t = this.t, M = 26, light = theme.name === 'claro';
    for (const L of this.links.values()) {
      const a = L.a, b = L.b;
      const al = L.s * Math.min(a.alpha * a.life, b.alpha * b.life);
      if (al < 0.01) continue;
      const ax = a.x, ay = a.y, bx = b.x, by = b.y, d = Math.hypot(bx - ax, by - ay);
      if (d < 1) continue;
      const k = Math.min(d * 0.5, 160 * S);
      const n1 = (noise(L.seed, t * 0.12) - 0.5) * 2, n2 = (noise(L.seed + 9, t * 0.12) - 0.5) * 2;
      const c1x = ax + Math.cos(a.ang + n1 * 0.6) * k, c1y = ay + Math.sin(a.ang + n1 * 0.6) * k;
      const c2x = bx + Math.cos(b.ang + n2 * 0.6) * k, c2y = by + Math.sin(b.ang + n2 * 0.6) * k;
      const gEnd = U.easeOut(L.g);
      const steps = Math.max(2, Math.ceil(M * gEnd));
      const xs = ZS.tx, ys = ZS.ty;
      for (let i = 0; i <= steps; i++) {
        const u = (i / steps) * gEnd, v = 1 - u;
        xs[i] = v * v * v * ax + 3 * v * v * u * c1x + 3 * v * u * u * c2x + u * u * u * bx;
        ys[i] = v * v * v * ay + 3 * v * v * u * c1y + 3 * v * u * u * c2y + u * u * u * by;
      }
      const ca = light ? a.ink : a.accent, cbb = light ? b.ink : b.accent;
      const gr = ctx.createLinearGradient(ax, ay, bx, by);
      gr.addColorStop(0, U.rgba(ca, 0.6 * al));
      gr.addColorStop(1, U.rgba(cbb, 0.6 * al));
      ctx.strokeStyle = gr;
      ctx.lineWidth = 0.85 * S;
      const amp = (2.5 + d * 0.025) * S * CONFIG.linkTwist;
      ctx.beginPath();
      const strands = Math.min(a.lodFlag, b.lodFlag) ? 1 : 2;
      for (let q = 0; q < strands; q++) {
        for (let i = 0; i <= steps; i++) {
          const u = (i / steps) * gEnd;
          const i0 = i > 0 ? i - 1 : 0, i1 = i < steps ? i + 1 : steps;
          const tx = xs[i1] - xs[i0], ty = ys[i1] - ys[i0], dd = Math.hypot(tx, ty) || 1;
          const env = Math.sin(u * Math.PI);
          const off = amp * env * Math.sin(u * Math.PI * L.cross * 2 + t * 0.9 + q * Math.PI);
          let px = xs[i] - (ty / dd) * off, py = ys[i] + (tx / dd) * off;
          if (this.waves.length) { const w = this.waveAt(px, py); px += w.dx * 14 * S * env; py += w.dy * 14 * S * env; }
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
      }
      ctx.stroke();
    }
  }

  // frentes de onda: anillos orgánicos que se deforman al expandirse
  drawWaves(ctx) {
    const S = W.S, M = 72, light = theme.name === 'claro';
    for (const w of this.waves) {
      const age = this.t - w.t0, r = age * CONFIG.waveSpeed * S;
      const fall = Math.exp(-age / CONFIG.waveDecay) * w.k;
      if (fall < 0.02 || r < 2) continue;
      const c = light ? U.mix(w.color, [26, 16, 51], 0.25) : w.color;
      for (let q = 0; q < 2; q++) {
        const rr = r * (1 - q * 0.08);
        ctx.strokeStyle = U.rgba(c, (q ? 0.12 : 0.28) * fall);
        ctx.lineWidth = (q ? 3 : 1.2) * S;
        ctx.beginPath();
        for (let i = 0; i <= M; i++) {
          const th = (i / M) * U.TAU;
          const k = 1 + 0.07 * (noise(w.id * 3 + Math.cos(th) * 1.2, Math.sin(th) * 1.2, this.t * 0.4 + q) - 0.5) * 2;
          const x = w.x + Math.cos(th) * rr * k, y = w.y + Math.sin(th) * rr * k;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }
  }

  // COLECTIVO: lóbulos de los tres subsistemas, proporcionales a los aportes
  drawHeart(ctx) {
    const r = this.root, S = W.S, t = this.t, cb = this.countBy, tot = this.total;
    const Rh = Math.min(80 * S, (18 + 4 * Math.sqrt(tot)) * S) * this.breath * (1 + this.heartKick * 0.18);
    const keys = ['pulso', 'vinculo', 'impacto'], M = 36, bx = ZS.bx, by = ZS.by;
    ctx.save();
    ctx.globalCompositeOperation = theme.heartOp;
    keys.forEach((key, k) => {
      const w = (cb[key] + 1) / (tot + 3);
      const ang = t * 0.07 + (k * U.TAU) / 3 + (noise(k * 10, t * 0.1) - 0.5) * 1.5;
      const cx = r.x + Math.cos(ang) * Rh * 0.38, cy = r.y + Math.sin(ang) * Rh * 0.38;
      const R = Rh * (0.5 + 0.9 * w);
      for (let m = 0; m < M; m++) {
        const th = (m / M) * U.TAU;
        const rr = R * (1 + 0.2 * (noise(k * 7 + Math.cos(th), Math.sin(th), t * 0.2) - 0.5) * 2);
        bx[m] = Math.cos(th) * rr; by[m] = Math.sin(th) * rr;
      }
      const c = U.hex(PALETTE[SUBSISTEMAS[key].acento]);
      const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.2);
      gr.addColorStop(0, U.rgba(c, 0.75));
      gr.addColorStop(1, U.rgba(c, 0));
      ctx.fillStyle = gr;
      U.closedSmooth(ctx, cx, cy, bx, by, M, 1);
      ctx.fill();
    });
    ctx.restore();

    // contorno y respiración colectiva
    const ink = U.hex(theme.name === 'claro' ? PALETTE.violeta : PALETTE.lima);
    for (let m = 0; m < M; m++) {
      const th = (m / M) * U.TAU;
      const rr = Rh * 1.05 * (1 + 0.16 * (noise(50 + Math.cos(th), Math.sin(th), t * 0.15) - 0.5) * 2);
      bx[m] = Math.cos(th) * rr; by[m] = Math.sin(th) * rr;
    }
    ctx.strokeStyle = U.rgba(ink, 0.55);
    ctx.lineWidth = 1.2 * S;
    U.closedSmooth(ctx, r.x, r.y, bx, by, M, 1);
    ctx.stroke();
    for (let q = 0; q < 2; q++) {
      const ph = ((t / 6) + q * 0.5) % 1;
      ctx.strokeStyle = U.rgba(ink, (1 - ph) * (1 - ph) * 0.3 * CONFIG.breathing);
      ctx.lineWidth = 0.9 * S;
      U.closedSmooth(ctx, r.x, r.y, bx, by, M, 1 + ph * 1.8);
      ctx.stroke();
    }
  }
}
