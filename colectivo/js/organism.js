/* =========================================================================
   ORGANISMO · la colonia colectiva
   - Tallos (VÍNCULO): cadenas de nodos con física de posiciones; las ramas
     comparten nodo con su tallo madre, así se tiran entre sí.
   - Trazos (PULSO): se alojan en "slots" a los lados de cada nodo.
   - Ondas (IMPACTO): se propagan, empujan la estructura y la tiñen.
   - Núcleo (COLECTIVO): en la raíz, se calienta con todos los aportes.
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
    // mapa térmico de la corriente (0 pulso · 0.5 vínculo · 1 impacto); lo tiñen sus trazos
    this.shift = parent ? parent.shift : 0.5;
    this.tShift = parent ? U.clamp(parent.shift + (Math.random() - 0.5) * 0.6, 0, 1) : 0.4;
    this.load = 0;
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
    this.bursts = [];
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
    const z = new Trace(this, pulse, slot.stem, slot.i, slot.side, opts);
    slot.stem.slots[slot.i][slot.side] = z;
    this.zooids.push(z);
    if (opts.instant) this.tintStem(z, 0.35);
    return z;
  }

  tintStem(z, k) {
    const s = z.stem;
    s.tShift = U.lerp(s.tShift, z.shift, k);
    if (s.parent) s.parent.tShift = U.lerp(s.parent.tShift, z.shift, k * 0.25);
  }

  // VÍNCULO + IMPACTO: la forma se acopla
  onDock(z) {
    this.addWave(z.x, z.y, z.shift, 0.6 + 0.6 * z.f.energy, z);
    this.bursts.push({ x: z.x, y: z.y, t0: this.t, shift: z.shift, k: 0.6 + 0.6 * z.f.energy });
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
      s.shift += (s.tShift - s.shift) * Math.min(1, dt * 0.3);
      s.load = 0;
      for (const sl of s.slots) for (const z of sl) if (z && z.state === 'attached') s.load++;
    }

    this.physics(dt);

    for (const z of this.zooids) z.update(dt);
    if (this.zooids.some((z) => z.dead)) {
      for (const z of this.zooids) if (z.dead && z.stem.slots[z.i][z.side] === z) z.stem.slots[z.i][z.side] = null;
      this.zooids = this.zooids.filter((z) => !z.dead);
    }

    this.waves = this.waves.filter((w) => t - w.t0 < CONFIG.waveDecay * 5);
    this.bursts = this.bursts.filter((b) => t - b.t0 < 3);

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
    const m = Math.min(W.w, W.h) * 0.12;

    let cx = 0, cy = 0;
    for (const n of N) { cx += n.x; cy += n.y; }
    cx /= N.length; cy /= N.length;
    const gx = (W.w / 2 - cx) * 0.15, gy = (W.h / 2 - cy) * 0.15;
    const wk = CONFIG.waveAmp * 520 * S;

    for (const n of N) {
      const a = noise(n.x * fs, n.y * fs, t * 0.05) * U.TAU * 2;
      n.fx = Math.cos(a) * drift + gx;
      n.fy = Math.sin(a) * drift + gy;
      if (n.x < m) n.fx += (m - n.x) * 4;
      if (n.x > W.w - m) n.fx -= (n.x - (W.w - m)) * 4;
      if (n.y < m) n.fy += (m - n.y) * 4;
      if (n.y > W.h - m) n.fy -= (n.y - (W.h - m)) * 4;
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

  /* ---------------- dibujo (en el buffer de calor) ---------------- */

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
    // las corrientes engordan a medida que reciben trazos
    const base = CONFIG.stemWidth * S * s.scale * (1 + 0.14 * Math.sqrt(s.load || 0)) * this.breath;
    let arc = 0;
    for (let i = 0; i < k; i++) {
      const a = i > 0 ? i - 1 : 0, b = i < k - 1 ? i + 1 : k - 1;
      const tx = g.x[b] - g.x[a], ty = g.y[b] - g.y[a], d = Math.hypot(tx, ty) || 1;
      g.nx[i] = -ty / d; g.ny[i] = tx / d;
      if (i > 0) arc += Math.hypot(g.x[i] - g.x[i - 1], g.y[i] - g.y[i - 1]);
      g.arc[i] = arc;
      const uN = i / (k - 1);
      let R = base * (1 - 0.55 * uN) * (1 + 0.28 * Math.sin(arc / (22 * S) - t * 2.2 + s.seed));
      if (this.waves.length) R *= 1 + Math.min(1.5, this.waveAt(g.x[i], g.y[i]).e) * 0.8;
      g.R[i] = R;
    }
  }

  draw(ctx) {
    for (const s of this.stems) this.geo(s);
    for (const s of this.stems) this.drawStem(ctx, s);
    const cut = this.zooids.length - Math.min(CONFIG.detailCount, this.detailLimit);
    for (let i = 0; i < this.zooids.length; i++) this.zooids[i].draw(ctx, i < cut);
    this.drawLinks(ctx);
    this.drawBursts(ctx);
    this.drawNucleus(ctx);
  }

  // corriente: haz de fibras que ondulan dentro de un tubo
  drawStem(ctx, s) {
    const g = s.g;
    if (!g || g.n < 2) return;
    const S = W.S, t = this.t, F = Math.max(1, Math.round(CONFIG.stemFibers));
    const heat = 0.035 * CONFIG.stemHeat * (1 + 0.05 * Math.sqrt(s.load || 0));
    const fl = CONFIG.stemFlow;
    // cuerpo difuso de la corriente
    for (let i = 0; i < g.n; i += 3) {
      const wob = noise(s.seed + i * 0.15, t * 0.25 * fl);
      heatBlob(ctx, g.x[i] + g.nx[i] * (wob - 0.5) * g.R[i] * 3, g.y[i] + g.ny[i] * (wob - 0.5) * g.R[i] * 3,
        g.R[i] * (2.2 + wob * 1.6), heat * 0.9, s.shift);
    }
    if (CONFIG.lines <= 0) return;
    ctx.strokeStyle = heatStyle(heat * CONFIG.lines, s.shift);
    ctx.lineWidth = 1.2 * S;
    ctx.beginPath();
    for (let k = 0; k < F; k++) {
      const ok = F === 1 ? 0 : (k / (F - 1) - 0.5) * 2;
      const ph = k * 1.7 + s.seed;
      for (let i = 0; i < g.n; i++) {
        const w = g.arc[i] / S;
        const off = g.R[i] * (ok + 0.6 * fl * Math.sin(w * 0.021 + ph + t * 0.8 * fl) * Math.sin(w * 0.007 - t * 0.3 + k));
        const px = g.x[i] + g.nx[i] * off, py = g.y[i] + g.ny[i] * off;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
    }
    ctx.stroke();
    ctx.strokeStyle = heatStyle(heat * 0.6 * CONFIG.lines, s.shift);
    ctx.lineWidth = Math.max(1, g.R[0] * 0.8);
    ctx.beginPath();
    for (let i = 0; i < g.n; i++) i ? ctx.lineTo(g.x[i], g.y[i]) : ctx.moveTo(g.x[i], g.y[i]);
    ctx.stroke();
  }

  // hilos finos entre los extremos de los trazos (VÍNCULO)
  drawLinks(ctx) {
    const S = W.S, t = this.t, M = 24;
    ctx.lineWidth = 1.1 * S;
    for (const L of this.links.values()) {
      const a = L.a, b = L.b;
      const al = L.s * Math.min(a.alpha * a.life, b.alpha * b.life);
      if (al < 0.01) continue;
      const ax = a.tipX, ay = a.tipY, bx = b.tipX, by = b.tipY, d = Math.hypot(bx - ax, by - ay);
      if (d < 1) continue;
      const k = Math.min(d * 0.55, 200 * S);
      const n1 = (noise(L.seed, t * 0.12) - 0.5) * 2, n2 = (noise(L.seed + 9, t * 0.12) - 0.5) * 2;
      const c1x = ax + Math.cos(a.tipAng + n1 * 0.7) * k, c1y = ay + Math.sin(a.tipAng + n1 * 0.7) * k;
      const c2x = bx + Math.cos(b.tipAng + n2 * 0.7) * k, c2y = by + Math.sin(b.tipAng + n2 * 0.7) * k;
      const gEnd = U.easeOut(L.g);
      const steps = Math.max(2, Math.ceil(M * gEnd));
      ctx.strokeStyle = heatStyle(0.06 * CONFIG.linkHeat * al * (0.3 + 0.7 * CONFIG.lines), (a.shift + b.shift) / 2);
      ctx.beginPath();
      for (let q = 0; q < 2; q++) {
        const amp = (3 + d * 0.03) * S * (q ? -1 : 1);
        for (let i = 0; i <= steps; i++) {
          const u = (i / steps) * gEnd, v = 1 - u;
          let px = v * v * v * ax + 3 * v * v * u * c1x + 3 * v * u * u * c2x + u * u * u * bx;
          let py = v * v * v * ay + 3 * v * v * u * c1y + 3 * v * u * u * c2y + u * u * u * by;
          const env = Math.sin(u * Math.PI) * Math.sin(u * Math.PI * L.cross * 2 + t * 0.9);
          px += amp * env * 0.7; py += amp * env * 0.7;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
      }
      ctx.stroke();
    }
  }

  // destello al acoplarse (IMPACTO)
  drawBursts(ctx) {
    const S = W.S;
    for (const b of this.bursts) {
      const age = this.t - b.t0;
      const k = Math.exp(-age * 1.6) * b.k * CONFIG.burst;
      if (k < 0.01) continue;
      const r = (40 + age * 160) * S;
      const gr = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, r);
      gr.addColorStop(0, heatStyle(0.35 * k, b.shift));
      gr.addColorStop(1, 'rgb(0,0,0)');
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, U.TAU); ctx.fill();
    }
  }

  // COLECTIVO: núcleo que se calienta con cada aporte; su mapa es la mezcla de todos
  drawNucleus(ctx) {
    const r = this.root, S = W.S, t = this.t, cb = this.countBy, tot = this.total;
    if (CONFIG.nucleus <= 0) return;
    const shift = tot ? (cb.vinculo * 0.5 + cb.impacto) / tot : 0.5;
    const R = (50 + 9 * Math.sqrt(tot)) * S * CONFIG.nucleus * this.breath * (1 + this.heartKick * 0.25);
    const heat = (0.05 + 0.008 * Math.sqrt(tot)) * (1 + this.heartKick * 0.6) * (0.85 + 0.15 * Math.sin(t * 0.9));
    for (let l = 0; l < 3; l++) {
      const a = t * 0.11 + l * 2.1, off = R * 0.25;
      const x = r.x + Math.cos(a) * off, y = r.y + Math.sin(a * 1.3) * off;
      const gr = ctx.createRadialGradient(x, y, 0, x, y, R * (1 - l * 0.2));
      gr.addColorStop(0, heatStyle(heat, U.clamp(shift + (l - 1) * 0.25, 0, 1)));
      gr.addColorStop(1, 'rgb(0,0,0)');
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.arc(x, y, R, 0, U.TAU); ctx.fill();
    }
  }
}
