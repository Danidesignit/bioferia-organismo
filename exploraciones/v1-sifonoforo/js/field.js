/* =========================================================================
   ATMÓSFERA · degradados difusos y orgánicos
   Se pinta en un canvas de baja resolución y se amplía: el reescalado
   produce el desenfoque. Cada forma, tallo y onda tiñe el campo, así la
   mezcla cromática sale de la propia participación.
   ========================================================================= */
class Field {
  constructor() {
    this.amb = [
      { c: U.hex(PALETTE.lima), s: 1 },
      { c: U.hex(PALETTE.violeta), s: 2 },
      { c: U.hex(PALETTE.cian), s: 3 },
      { c: U.hex(PALETTE.verde), s: 4 },
    ];
    this.resize();
  }

  resize() {
    const sc = CONFIG.fieldScale;
    this.w = Math.max(2, Math.ceil(W.w * sc));
    this.h = Math.max(2, Math.ceil(W.h * sc));
    this.cv = document.createElement('canvas');
    this.cv.width = this.w; this.cv.height = this.h;
    this.ctx = this.cv.getContext('2d');
    this.cv2 = document.createElement('canvas');
    this.cv2.width = this.w; this.cv2.height = this.h;
    this.ctx2 = this.cv2.getContext('2d');
    this.canFilter = typeof this.ctx2.filter === 'string';
  }

  blob(x, y, r, c, a) {
    if (r <= 0.5 || a <= 0.005) return;
    const ctx = this.ctx;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, U.rgba(c, a));
    g.addColorStop(0.5, U.rgba(c, a * 0.45));
    g.addColorStop(1, U.rgba(c, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, U.TAU);
    ctx.fill();
  }

  render(main, org) {
    if (CONFIG.fieldOpacity <= 0) return;
    const c = this.ctx, sc = this.w / W.w, sp = CONFIG.fieldSpread, S = W.S, t = org.t;
    const light = theme.name === 'claro';
    c.globalCompositeOperation = 'source-over';
    c.fillStyle = theme.bg;
    c.fillRect(0, 0, this.w, this.h);
    c.globalCompositeOperation = theme.fieldOp;

    // masas ambientales lentas (mantienen la composición aun vacía)
    const mn = Math.min(this.w, this.h);
    for (const a of this.amb) {
      const x = this.w * noise(a.s * 13, t * 0.008), y = this.h * noise(a.s * 29, t * 0.008 + 5);
      this.blob(x, y, mn * 0.55 * sp, a.c, light ? 0.16 : 0.12);
    }
    // tallos
    for (const s of org.stems) {
      const n = s.nodes;
      for (let i = 0; i < n.length; i += 2) {
        this.blob(n[i].x * sc, n[i].y * sc, 60 * S * sc * sp * s.scale, U.mix(s.col, s.colB, i / n.length), 0.16);
      }
    }
    // formas
    for (const z of org.zooids) {
      const a = z.alpha * z.life;
      this.blob(z.x * sc, z.y * sc, z.R0 * S * 4.5 * (1 + z.excite * 0.8) * sc * sp, U.mix(z.base, z.accent, 0.55), 0.3 * a);
    }
    // corazón colectivo
    const r = org.root, keys = ['pulso', 'vinculo', 'impacto'];
    keys.forEach((k, i) => {
      const w = (org.countBy[k] + 1) / (org.total + 3);
      const ang = t * 0.05 + (i * U.TAU) / 3;
      this.blob((r.x + Math.cos(ang) * 40 * S) * sc, (r.y + Math.sin(ang) * 40 * S) * sc,
        (90 + 260 * w * Math.min(1, org.total / 40)) * S * sc * sp, U.hex(PALETTE[SUBSISTEMAS[k].acento]), 0.22 + org.heartKick * 0.2);
    });
    // ondas: reacción cromática que se propaga
    for (const w of org.waves) {
      const age = t - w.t0, rr = age * CONFIG.waveSpeed * S;
      const fall = Math.exp(-age / CONFIG.waveDecay) * w.k;
      if (fall < 0.02) continue;
      c.strokeStyle = U.rgba(w.color, 0.22 * fall);
      c.lineWidth = Math.max(1, CONFIG.waveWidth * S * sc * 0.9);
      c.beginPath();
      c.arc(w.x * sc, w.y * sc, rr * sc, 0, U.TAU);
      c.stroke();
      this.blob(w.x * sc, w.y * sc, (80 + age * 40) * S * sc, w.color, 0.25 * fall);
    }

    // pequeño desenfoque extra en baja resolución (barato)
    const c2 = this.ctx2;
    c2.globalCompositeOperation = 'copy';
    if (this.canFilter) c2.filter = 'blur(2px)';
    c2.drawImage(this.cv, 0, 0);
    if (this.canFilter) c2.filter = 'none';

    main.save();
    main.globalAlpha = CONFIG.fieldOpacity;
    main.imageSmoothingEnabled = true;
    main.imageSmoothingQuality = 'high';
    main.drawImage(this.canFilter ? this.cv2 : this.cv, 0, 0, W.w, W.h);
    main.restore();
  }
}
