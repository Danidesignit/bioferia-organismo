/* =========================================================================
   TRAZO · el pulso de cada visitante dentro del colectivo.
   Un haz de fibras que tiene LA FORMA DEL GESTO (su recorrido re-muestreado).
   - largo   = longitud + duración del gesto
   - ancho   = energía
   - latidos = cantidad de toques (luz que recorre el trazo)
   - mapa    = subsistema dominante (pulso / vínculo / impacto)
   Con el tiempo el extremo libre se peina con la corriente común.
   Estados: arriving → attached → fading
   ========================================================================= */

const TN = 28;                         // puntos por trazo
const TS = {
  x: new Float32Array(TN), y: new Float32Array(TN),
  nx: new Float32Array(TN), ny: new Float32Array(TN),
};
let TUID = 0;

class Trace {
  constructor(org, pulse, stem, i, side, opts = {}) {
    this.uid = ++TUID;
    this.org = org;
    this.p = pulse;
    this.f = pulse.f;
    this.stem = stem; this.i = i; this.side = side;

    const r = U.rng(pulse.seed), f = this.f;
    this.phase = r() * U.TAU;
    this.shift = U.clamp(SUBSISTEMAS[f.accent].shift + (r() - 0.5) * 0.3, 0, 1);
    this.len = 90 + 160 * f.length + 50 * f.duration;
    this.width = 4 + 10 * f.energy + 4 * f.duration;
    this.freq = 0.3 + f.energy * 0.9;
    this.beatsN = f.rhythm;
    this.buildShape(r);

    this.born = org.t;
    this.dockT = null;
    this.excite = 0;
    this.life = 1;
    this.dead = false;
    this.waveSeen = new Set();
    this.tipX = 0; this.tipY = 0; this.tipAng = 0;
    // compatibilidad con el organismo
    this.R0 = this.width;

    const A = this.anchorInfo();
    this.ang = A.ang;
    if (opts.instant) {
      this.state = 'attached'; this.alpha = 1; this.dockT = org.t - 30;
      this.x = A.x; this.y = A.y;
    } else {
      this.state = 'arriving'; this.alpha = 0;
      this.travel = 4.6 - f.energy * 1.8;
      const D = Math.hypot(W.w, W.h) * 0.62;
      if (opts.spawn) { this.sx = opts.spawn.x; this.sy = opts.spawn.y; }
      else { this.sx = A.x - Math.cos(f.direction) * D; this.sy = A.y - Math.sin(f.direction) * D; }
      const mx = (this.sx + A.x) / 2, my = (this.sy + A.y) / 2;
      const dx = A.x - this.sx, dy = A.y - this.sy;
      const bend = f.curvature * 0.6 + (r() - 0.5) * 0.5;
      this.cx = mx - dy * bend; this.cy = my + dx * bend;
      this.x = this.sx; this.y = this.sy;
    }
  }

  // ángulos relativos y largos de segmento del gesto original
  buildShape(r) {
    const raw = (this.p.raw && this.p.raw.points) || [];
    let pts = Pulse.resample(raw.map((q) => [q[0], q[1]]), TN);
    let total = 0;
    for (let i = 1; i < TN; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    this.rel = new Float32Array(TN - 1);
    this.segL = new Float32Array(TN - 1);
    if (total < 0.02) {
      // gesto casi quieto (toques): espiral corta cuyo giro depende del ritmo
      for (let i = 0; i < TN - 1; i++) { this.rel[i] = i * (0.12 + this.f.rhythm * 0.03); this.segL[i] = 1 / (TN - 1); }
      return;
    }
    const base = Math.atan2(pts[TN - 1][1] - pts[0][1], pts[TN - 1][0] - pts[0][0]);
    for (let i = 0; i < TN - 1; i++) {
      const a = Math.atan2(pts[i + 1][1] - pts[i][1], pts[i + 1][0] - pts[i][0]);
      this.rel[i] = U.angleDiff(base, a);
      this.segL[i] = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]) / total;
    }
  }

  anchorInfo() {
    const n = this.stem.nodes, k = Math.min(this.i + 1, n.length - 1);
    const a = n[k - 1], b = n[Math.min(k + 1, n.length - 1)], c = n[k];
    let tx = b.x - a.x, ty = b.y - a.y;
    const d = Math.hypot(tx, ty) || 1; tx /= d; ty /= d;
    const sg = this.side ? 1 : -1;
    return { x: c.x, y: c.y, ang: Math.atan2(tx * sg, -ty * sg) };
  }

  fade() { if (this.state !== 'fading') this.state = 'fading'; }

  update(dt) {
    const o = this.org;
    this.excite *= Math.exp(-dt * 1.4);
    for (const w of o.waves) {
      if (this.waveSeen.has(w.id)) continue;
      const age = o.t - w.t0;
      if (age * CONFIG.waveSpeed * W.S >= Math.hypot(this.x - w.x, this.y - w.y)) {
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
      // viajando, el trazo se arrastra detrás de su cabeza; al llegar gira hacia afuera
      this.ang = U.lerpAngle(Math.atan2(dy, dx) + Math.PI, A.ang, U.smooth(U.clamp((k - 0.65) / 0.35, 0, 1)));
      this.alpha = Math.min(1, (o.t - this.born) / 0.8);
      this.arrive = e;
      this.excite = Math.max(this.excite, 0.35);
      if (k >= 1) { this.state = 'attached'; this.dockT = o.t; o.onDock(this); }
    } else {
      const s = 1 - Math.exp(-dt * 10);
      this.x += (A.x - this.x) * s; this.y += (A.y - this.y) * s;
      const sway = (noise(this.phase * 10, o.t * 0.12) - 0.5) * 0.8;
      this.ang = U.lerpAngle(this.ang, A.ang + sway, s);
      if (this.state === 'fading') { this.life -= dt / 3; if (this.life <= 0) this.dead = true; }
    }
  }

  // recorrido actual del trazo en TS.x / TS.y
  shape() {
    const o = this.org, S = W.S, t = o.t;
    const grow = this.state === 'arriving' ? 0.45 + 0.55 * this.arrive : 1;
    const L = this.len * S * CONFIG.ribbonLength * 0.45 * grow * o.breath;
    const merge = this.dockT == null ? 0 : U.clamp((t - this.dockT) / 15, 0, 1) * 0.8 * CONFIG.merge;
    const cur = o.current;
    let x = this.x, y = this.y;
    TS.x[0] = x; TS.y[0] = y;
    for (let i = 0; i < TN - 1; i++) {
      const u = i / (TN - 2);
      let a = this.ang + this.rel[i]
        + Math.sin(t * this.freq * 2 - u * 4 + this.phase) * 0.22 * CONFIG.ribbonWave * u
        + this.excite * 0.25 * Math.sin(u * 9 - t * 6);
      a = U.lerpAngle(a, cur, merge * u);
      x += Math.cos(a) * this.segL[i] * L;
      y += Math.sin(a) * this.segL[i] * L;
      let rx = x, ry = y;
      if (o.waves.length) { const w = o.waveAt(x, y); rx += w.dx * 20 * S * CONFIG.waveAmp * u; ry += w.dy * 20 * S * CONFIG.waveAmp * u; }
      TS.x[i + 1] = rx; TS.y[i + 1] = ry;
    }
    for (let i = 0; i < TN; i++) {
      const a = i > 0 ? i - 1 : 0, b = i < TN - 1 ? i + 1 : TN - 1;
      const tx = TS.x[b] - TS.x[a], ty = TS.y[b] - TS.y[a], d = Math.hypot(tx, ty) || 1;
      TS.nx[i] = -ty / d; TS.ny[i] = tx / d;
    }
    this.tipX = TS.x[TN - 1]; this.tipY = TS.y[TN - 1];
    this.tipAng = Math.atan2(TS.y[TN - 1] - TS.y[TN - 3], TS.x[TN - 1] - TS.x[TN - 3]);
  }

  // el pulso como partícula sin forma: una nube de manchas de calor que respira,
  // se reacomoda con ruido y sigue (apenas) el recorrido del gesto
  draw(ctx, lod) {
    const a = this.alpha * this.life;
    if (a <= 0.01) return;
    this.shape();
    const S = W.S, t = this.org.t, f = this.f;
    const heat = CONFIG.ribbonHeat * (0.032 + 0.028 * f.energy) * a * (1 + this.excite * 0.9);
    const Wd = this.width * S * CONFIG.ribbonWidth * (1 + this.excite * 0.5);
    let n = Math.max(1, Math.round(CONFIG.ribbonFibers * (0.5 + 0.5 * f.length)));
    if (lod) n = Math.min(n, 4);
    const beatOn = !lod && CONFIG.beats > 0;
    for (let k = 0; k < n; k++) {
      const u = n === 1 ? 0 : k / (n - 1);
      const idx = Math.round(u * (TN - 1));
      const jx = (noise(this.phase * 7 + k * 3.1, t * 0.35) - 0.5) * Wd * 4.4;
      const jy = (noise(this.phase * 7 + k * 3.1 + 40, t * 0.35) - 0.5) * Wd * 4.4;
      let r = Wd * (2.9 - 1.3 * u) * (0.75 + 0.35 * Math.sin(t * this.freq * 2 + k * 1.3 + this.phase));
      let h = heat * (1 - 0.45 * u);
      if (beatOn) {
        // latidos: el calor viaja por la nube al ritmo de los toques
        let bb = 0;
        for (let b = 0; b < this.beatsN; b++) {
          const pos = (t * this.freq * 0.35 + b / this.beatsN + this.phase) % 1, q = (u - pos) / 0.18;
          bb += Math.exp(-q * q);
        }
        h *= 1 + 1.4 * CONFIG.beats * bb;
        r *= 1 + 0.25 * bb;
      }
      heatBlob(ctx, TS.x[idx] + jx, TS.y[idx] + jy, r, h, this.shift);
    }

    // filamento opcional (parámetro Filamentos)
    if (CONFIG.lines > 0 && !lod) {
      ctx.strokeStyle = heatStyle(heat * 0.5 * CONFIG.lines, this.shift);
      ctx.lineWidth = 1.2 * S;
      ctx.beginPath();
      for (let i = 0; i < TN; i++) i ? ctx.lineTo(TS.x[i], TS.y[i]) : ctx.moveTo(TS.x[i], TS.y[i]);
      ctx.stroke();
    }
  }
}
