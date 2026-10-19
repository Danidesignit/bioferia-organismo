/* Utilidades compartidas: color, easing, azar con semilla, trazados suaves. */
const U = (() => {
  const TAU = Math.PI * 2;
  const hexCache = {};

  function hex(h) {
    if (hexCache[h]) return hexCache[h].slice();
    const n = parseInt(h.slice(1), 16);
    const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    hexCache[h] = c;
    return c.slice();
  }

  return {
    TAU,
    clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
    lerp: (a, b, t) => a + (b - a) * t,
    smooth: (t) => t * t * (3 - 2 * t),
    easeOut: (t) => 1 - Math.pow(1 - t, 3),
    easeInOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    hex,
    mix: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
    mixInto(a, b, t) { a[0] += (b[0] - a[0]) * t; a[1] += (b[1] - a[1]) * t; a[2] += (b[2] - a[2]) * t; },
    rgba(c, a) {
      a = a < 0 ? 0 : a > 1 ? 1 : a;
      return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${Math.round(a * 1000) / 1000})`;
    },
    angleDiff(a, b) {
      let d = (b - a) % TAU;
      if (d > Math.PI) d -= TAU;
      if (d < -Math.PI) d += TAU;
      return d;
    },
    lerpAngle(a, b, t) { return a + U.angleDiff(a, b) * t; },
    // PRNG determinista (mulberry32): misma semilla => misma forma
    rng(seed) {
      let a = seed >>> 0;
      return () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    },
    uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); },

    // Cinta de ancho variable a lo largo de una polilínea (xs, ys, ws)
    ribbon(ctx, xs, ys, ws, n) {
      ctx.beginPath();
      for (let pass = 0; pass < 2; pass++) {
        for (let k = 0; k < n; k++) {
          const i = pass === 0 ? k : n - 1 - k;
          const a = i > 0 ? i - 1 : 0, b = i < n - 1 ? i + 1 : n - 1;
          let tx = xs[b] - xs[a], ty = ys[b] - ys[a];
          const d = Math.hypot(tx, ty) || 1;
          const s = pass === 0 ? ws[i] : -ws[i];
          const px = xs[i] - (ty / d) * s, py = ys[i] + (tx / d) * s;
          if (k === 0 && pass === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
      }
      ctx.closePath();
    },

    // Contorno cerrado suave a partir de offsets relativos (xs, ys) escalados
    closedSmooth(ctx, cx, cy, xs, ys, n, sc) {
      ctx.beginPath();
      const mx0 = cx + (xs[n - 1] + xs[0]) * 0.5 * sc, my0 = cy + (ys[n - 1] + ys[0]) * 0.5 * sc;
      ctx.moveTo(mx0, my0);
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const mx = cx + (xs[i] + xs[j]) * 0.5 * sc, my = cy + (ys[i] + ys[j]) * 0.5 * sc;
        ctx.quadraticCurveTo(cx + xs[i] * sc, cy + ys[i] * sc, mx, my);
      }
      ctx.closePath();
    },
  };
})();
