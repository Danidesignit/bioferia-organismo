/* =========================================================================
   ZOOIDE · la forma individual de cada visitante dentro del colectivo.
   - Campana orgánica asimétrica (tamaño = duración, elongación = energía)
   - Tentáculos-cinta cuya curvatura es el trazo del visitante (profile)
   - Ondas rítmicas concéntricas (cantidad = toques)
   Estados: arriving → attached → fading
   ========================================================================= */

// buffers reutilizables (evitan crear arrays por frame)
const ZS = {
  tx: new Float32Array(64), ty: new Float32Array(64), w: new Float32Array(64),
  bx: new Float32Array(64), by: new Float32Array(64),
};
let ZUID = 0;

class Zooid {
  constructor(org, pulse, stem, i, side, opts = {}) {
    this.uid = ++ZUID;
    this.org = org;
    this.p = pulse;
    this.f = pulse.f;
    this.stem = stem; this.i = i; this.side = side;

    const r = U.rng(pulse.seed);
    const f = this.f;
    this.seedN = r() * 1000;
    this.accent = U.hex(PALETTE[SUBSISTEMAS[f.accent].acento]);
    this.base = U.hex(PALETTE[BASES[Math.floor(r() * BASES.length)]]);
    this.base2 = U.hex(PALETTE[BASES[Math.floor(r() * BASES.length)]]);
    this.ink = U.mix(this.accent, this.base, 0.45);   // versión legible del acento sobre blanco

    this.R0 = 6 + 9 * f.duration + r() * 3;
    this.elong = 0.4 + 0.75 * f.energy;
    this.skew = (r() - 0.5) * 0.5;          // asimetría lateral
    this.layers = f.rhythm;
    this.freq = 0.35 + f.energy * 1.1 + r() * 0.15;
    this.seg = 4 + 7 * f.duration + 2 * r();
    this.curl = 0.25 + Math.abs(f.curvature) * 0.6;
    this.profile = f.profile && f.profile.length ? f.profile : [0];
    this.phase = r() * U.TAU;

    this.born = org.t;
    this.excite = 0;
    this.life = 1;
    this.dead = false;
    this.waveSeen = new Set();
    this.trail = [];

    const A = this.anchorInfo();
    this.ang = A.ang;
    if (opts.instant) {
      this.state = 'attached';
      this.alpha = 1;
      this.x = A.x; this.y = A.y;
    } else {
      this.state = 'arriving';
      this.alpha = 0;
      this.travel = 4.8 - f.energy * 2;
      const D = Math.hypot(W.w, W.h) * 0.62;
      if (opts.spawn) { this.sx = opts.spawn.x; this.sy = opts.spawn.y; }
      else { this.sx = A.x - Math.cos(f.direction) * D; this.sy = A.y - Math.sin(f.direction) * D; }
      // punto de control: la curvatura del gesto curva el recorrido de llegada
      const mx = (this.sx + A.x) / 2, my = (this.sy + A.y) / 2;
      const dx = A.x - this.sx, dy = A.y - this.sy;
      const bend = (f.curvature * 0.6 + (r() - 0.5) * 0.5);
      this.cx = mx - dy * bend; this.cy = my + dx * bend;
      this.x = this.sx; this.y = this.sy;
    }
  }

  anchorInfo() {
    const n = this.stem.nodes, k = Math.min(this.i + 1, n.length - 1);
    const a = n[k - 1], b = n[Math.min(k + 1, n.length - 1)], c = n[k];
    let tx = b.x - a.x, ty = b.y - a.y;
    const d = Math.hypot(tx, ty) || 1; tx /= d; ty /= d;
    const sg = this.side ? 1 : -1;
    const nx = -ty * sg, ny = tx * sg;
    const off = (CONFIG.strandRadius * 1.3 * this.stem.scale + this.R0 * 0.8 * CONFIG.bellSize) * W.S;
    return { x: c.x + nx * off, y: c.y + ny * off, ang: Math.atan2(ny, nx) };
  }

  fade() { if (this.state !== 'fading') { this.state = 'fading'; } }

  update(dt) {
    const o = this.org;
    this.excite *= Math.exp(-dt * 1.4);

    // IMPACTO en cadena: cuando una onda me alcanza, respondo con mi propio pulso
    for (const w of o.waves) {
      if (this.waveSeen.has(w.id)) continue;
      const age = o.t - w.t0, r = age * CONFIG.waveSpeed * W.S;
      if (r >= Math.hypot(this.x - w.x, this.y - w.y)) {
        this.waveSeen.add(w.id);
        if (w.src !== this) this.excite = Math.min(1.3, this.excite + 0.9 * Math.exp(-age / CONFIG.waveDecay) * w.k);
      }
    }
    if (this.waveSeen.size > 24) this.waveSeen = new Set(o.waves.map((w) => w.id).filter((id) => this.waveSeen.has(id)));

    const A = this.anchorInfo();
    if (this.state === 'arriving') {
      const k = U.clamp((o.t - this.born) / this.travel, 0, 1);
      const e = U.easeInOut(k), u = 1 - e;
      this.x = u * u * this.sx + 2 * u * e * this.cx + e * e * A.x;
      this.y = u * u * this.sy + 2 * u * e * this.cy + e * e * A.y;
      const dx = 2 * u * (this.cx - this.sx) + 2 * e * (A.x - this.cx);
      const dy = 2 * u * (this.cy - this.sy) + 2 * e * (A.y - this.cy);
      const moveAng = Math.atan2(dy, dx);
      this.ang = U.lerpAngle(moveAng, A.ang, U.smooth(U.clamp((k - 0.7) / 0.3, 0, 1)));
      this.alpha = Math.min(1, (o.t - this.born) / 0.8);
      this.excite = Math.max(this.excite, 0.45);
      this.arrive = e;
      this.trail.push(this.x, this.y);
      if (this.trail.length > 120) this.trail.splice(0, 2);
      if (k >= 1) { this.state = 'attached'; o.onDock(this); }
    } else {
      const s = 1 - Math.exp(-dt * 10);
      this.x += (A.x - this.x) * s; this.y += (A.y - this.y) * s;
      const sway = (noise(this.seedN, o.t * 0.15) - 0.5) * 0.9;
      this.ang = U.lerpAngle(this.ang, A.ang + sway, s);
      if (this.trail.length) this.trail.splice(0, 4);
      if (this.state === 'fading') {
        this.life -= dt / 3;
        if (this.life <= 0) this.dead = true;
      }
    }
  }

  draw(ctx, lod) {
    const a = this.alpha * this.life;
    if (a <= 0.01) return;
    const o = this.org, S = W.S, t = o.t;
    const pulse = 0.5 + 0.5 * Math.sin(t * this.freq * U.TAU + this.phase);
    const grow = this.state === 'arriving' ? 0.55 + 0.45 * this.arrive : 1;
    const R = this.R0 * S * CONFIG.bellSize * (1 + 0.1 * pulse + this.excite * 0.4) * grow * o.breath;

    if (this.trail.length > 4) this.drawTrail(ctx, a);
    this.drawTentacles(ctx, R, a, lod);
    this.drawBell(ctx, R, a, lod);
  }

  drawTrail(ctx, a) {
    const tr = this.trail;
    ctx.strokeStyle = U.rgba(theme.name === 'claro' ? this.ink : this.accent, 0.35 * a);
    ctx.lineWidth = 0.9 * W.S;
    ctx.beginPath();
    ctx.moveTo(tr[0], tr[1]);
    for (let i = 2; i < tr.length; i += 2) ctx.lineTo(tr[i], tr[i + 1]);
    ctx.stroke();
  }

  drawTentacles(ctx, R, a, lod) {
    const o = this.org, S = W.S, t = o.t, f = this.f;
    let n = U.clamp(Math.round(CONFIG.tentacles * (0.35 + 0.65 * f.length)), 1, 12);
    if (lod) n = Math.min(n, 2);
    const N = lod ? 10 : 18, q = 18 / N;
    const arriving = this.state === 'arriving';
    const seg = this.seg * S * CONFIG.tentacleLength * q * (arriving ? 0.75 : 1);
    const P = this.profile, PL = P.length;
    const spread = 0.28 + 0.3 * f.length;
    const dir = arriving ? this.ang + Math.PI : this.ang;
    const reach = arriving ? R * 0.5 : R * (0.75 + this.elong * 0.9);
    const bx = this.x + Math.cos(dir) * reach, by = this.y + Math.sin(dir) * reach;
    const cur = o.current, coh = CONFIG.current * (0.4 + 0.9 * o.maturity);
    const w0 = (1.3 + 1.7 * f.energy) * S * (lod ? 0.7 : 1);
    const amp = CONFIG.waveAmp * 16 * S;
    const tx = ZS.tx, ty = ZS.ty, ws = ZS.w;
    const lineCol = theme.name === 'claro' ? this.base : U.mix(this.base, this.accent, 0.4);

    for (let j = 0; j < n; j++) {
      const off = n === 1 ? 0 : (j / (n - 1) - 0.5) * 2 * spread;
      let h = dir + off, x = bx, y = by;
      tx[0] = x; ty[0] = y; ws[0] = w0;
      for (let i = 1; i <= N; i++) {
        const u = i / N;
        const pr = P[(Math.floor(u * (PL - 1)) + j * 5) % PL];
        h += pr * this.curl * 0.3 * q
           + Math.sin(t * this.freq * Math.PI - i * 0.55 * q + j * 1.9 + this.phase) * 0.13 * CONFIG.tentacleWave * (0.3 + u) * q
           + U.angleDiff(h, cur) * 0.04 * coh * u * q;
        const st = seg * (1 - u * 0.35);
        x += Math.cos(h) * st; y += Math.sin(h) * st;
        let rx = x, ry = y;
        if (o.waves.length) { const w = o.waveAt(x, y); rx += w.dx * amp * u; ry += w.dy * amp * u; }
        tx[i] = rx; ty[i] = ry;
        const bead = Math.pow(Math.max(0, Math.sin(i * 1.3 * q + this.phase + j)), 6);
        ws[i] = w0 * Math.pow(1 - u, 0.8) * (1 + 0.9 * bead) + 0.3 * S;
      }
      const gr = ctx.createLinearGradient(tx[0], ty[0], tx[N], ty[N]);
      gr.addColorStop(0, U.rgba(this.accent, 0.85 * a));
      gr.addColorStop(0.55, U.rgba(U.mix(this.accent, this.base, 0.5), 0.45 * a));
      gr.addColorStop(1, U.rgba(this.base, 0));
      ctx.fillStyle = gr;
      U.ribbon(ctx, tx, ty, ws, N + 1);
      ctx.fill();

      if (!lod) {
        ctx.strokeStyle = U.rgba(lineCol, 0.4 * a);
        ctx.lineWidth = 0.7 * S;
        ctx.beginPath();
        ctx.moveTo(tx[0], ty[0]);
        for (let i = 1; i <= N * 0.7; i++) ctx.lineTo(tx[i], ty[i]);
        ctx.stroke();
      }
    }
  }

  drawBell(ctx, R, a, lod) {
    const o = this.org, S = W.S, t = o.t;
    const M = lod ? 20 : 32, bx = ZS.bx, by = ZS.by, el = this.elong;
    const p1 = this.seedN, p2 = this.seedN * 1.7, p3 = this.seedN * 2.3;
    for (let m = 0; m < M; m++) {
      const th = (m / M) * U.TAU, c = Math.cos(th), s = Math.sin(th);
      let r = R * (1 + el * Math.pow(Math.max(0, c), 1.6) * 1.3) * (1 - 0.3 * Math.max(0, -c)) * (1 + this.skew * s * Math.max(0, c));
      // deformación orgánica: suma de armónicos lentos (más barato que noise())
      r *= 1 + 0.28 * (0.5 * Math.sin(2 * th + t * 0.5 + p1) + 0.3 * Math.sin(3 * th - t * 0.37 + p2) + 0.2 * Math.sin(5 * th + t * 0.29 + p3));
      const wa = th + this.ang;
      bx[m] = Math.cos(wa) * r; by[m] = Math.sin(wa) * r;
    }
    const x = this.x, y = this.y;

    // ondas rítmicas (PULSO): expansiones que nacen de la forma
    const L = lod ? 1 : this.layers, rk = CONFIG.rings;
    if (rk > 0) {
      const rc = theme.name === 'claro' ? this.ink : this.accent;
      for (let k = 0; k < L; k++) {
        const ph = (t * this.freq * 0.5 + k / L + this.phase) % 1;
        const sc = 1 + ph * (1.1 + this.excite * 1.4) * rk;
        const al = (1 - ph) * (1 - ph) * 0.5 * a * (0.55 + 0.45 * Math.min(1, this.excite + 0.3));
        ctx.strokeStyle = U.rgba(rc, al);
        ctx.lineWidth = (1.3 - ph) * S;
        U.closedSmooth(ctx, x, y, bx, by, M, sc);
        ctx.stroke();
      }
    }

    // cuerpo
    const fx = x + Math.cos(this.ang) * R * 0.35, fy = y + Math.sin(this.ang) * R * 0.35;
    const gr = ctx.createRadialGradient(fx, fy, 0, x, y, R * (1.15 + el));
    gr.addColorStop(0, U.rgba(this.accent, 0.92 * a));
    gr.addColorStop(0.5, U.rgba(U.mix(this.base, this.accent, 0.35), 0.58 * a));
    gr.addColorStop(1, U.rgba(this.base, 0.14 * a));
    ctx.fillStyle = gr;
    U.closedSmooth(ctx, x, y, bx, by, M, 1);
    ctx.fill();
    ctx.strokeStyle = U.rgba(this.base, 0.55 * a);
    ctx.lineWidth = 0.9 * S;
    ctx.stroke();

    // núcleo interior desplazado (capas translúcidas)
    const ix = x - Math.cos(this.ang) * R * 0.2, iy = y - Math.sin(this.ang) * R * 0.2;
    ctx.fillStyle = U.rgba(this.base2, 0.32 * a);
    U.closedSmooth(ctx, ix, iy, bx, by, M, 0.45 + 0.1 * this.excite);
    ctx.fill();
  }
}
