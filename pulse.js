/* =========================================================================
   PULSO · formato de datos
   Un pulso guarda el gesto crudo (suficiente para reconstruirlo) y los
   rasgos derivados que usa la visualización. No contiene datos personales.

   {
     v: 1, id, t (timestamp), seed,
     raw: { points: [[x, y, ms], ...]  // 0..1 normalizado al área táctil
            taps:   [ms, ...]          // inicio de cada toque
            duration: ms },
     f: { energy, duration, length,    // 0..1
          rhythm,                      // 1..7 toques
          direction, curvature,        // radianes / -1..1
          profile: [..32],             // curvatura del trazo, -1..1
          accent: 'pulso'|'vinculo'|'impacto' }
   }
   ========================================================================= */
const Pulse = (() => {
  const P = 32;
  const r3 = (v) => Math.round(v * 1000) / 1000;

  function resample(pts, n) {
    if (pts.length < 2) {
      const p = pts[0] || [0.5, 0.5];
      return Array.from({ length: n }, () => [p[0], p[1]]);
    }
    const d = [0];
    for (let i = 1; i < pts.length; i++) d.push(d[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const L = d[d.length - 1] || 1;
    const out = [];
    let j = 0;
    for (let k = 0; k < n; k++) {
      const target = (k / (n - 1)) * L;
      while (j < d.length - 2 && d[j + 1] < target) j++;
      const seg = d[j + 1] - d[j] || 1;
      const t = U.clamp((target - d[j]) / seg, 0, 1);
      out.push([U.lerp(pts[j][0], pts[j + 1][0], t), U.lerp(pts[j][1], pts[j + 1][1], t)]);
    }
    return out;
  }

  // Rasgos visuales a partir del gesto crudo. Lo usan /pulso y /colectivo.
  function derive(raw) {
    const pts = raw.points || [];
    const n = pts.length;
    let len = 0;
    for (let i = 1; i < n; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const dur = raw.duration != null ? raw.duration : n ? pts[n - 1][2] : 0;

    const duration = U.clamp(dur / 6000, 0, 1);
    const length = U.clamp(len / 2.2, 0, 1);
    const speed = dur > 0 ? len / (dur / 1000) : 0;
    const energy = U.clamp(speed / 1.6, 0, 1);

    // Perfil de curvatura: ángulos de giro del trazo re-muestreado
    const rs = resample(pts.map((p) => [p[0], p[1]]), P + 2);
    let turn = [];
    for (let i = 1; i < rs.length - 1; i++) {
      const a1 = Math.atan2(rs[i][1] - rs[i - 1][1], rs[i][0] - rs[i - 1][0]);
      const a2 = Math.atan2(rs[i + 1][1] - rs[i][1], rs[i + 1][0] - rs[i][0]);
      turn.push(len > 0.01 ? U.angleDiff(a1, a2) : 0);
    }
    turn = turn.map((v, i) => ((turn[i - 1] ?? v) + v * 2 + (turn[i + 1] ?? v)) / 4);
    const maxAbs = Math.max(1e-4, ...turn.map(Math.abs));
    const profile = turn.map((v) => r3(maxAbs > 1e-3 ? v / maxAbs : 0));
    const curvature = U.clamp(turn.reduce((s, v) => s + v, 0) / P / Math.max(maxAbs, 0.05), -1, 1);

    const direction = n > 1 && len > 0.01
      ? Math.atan2(pts[n - 1][1] - pts[0][1], pts[n - 1][0] - pts[0][0])
      : ((raw.taps && raw.taps.length) || 1) * 2.399;
    const rhythm = U.clamp((raw.taps && raw.taps.length) || 1, 1, 7);

    // Subsistema dominante del gesto
    const scores = {
      pulso: ((rhythm - 1) / 6) * 1.1 + 0.05,
      vinculo: length * (0.6 + Math.abs(curvature) * 0.8),
      impacto: energy * 1.05,
    };
    const accent = Object.keys(scores).reduce((a, b) => (scores[b] > scores[a] ? b : a));

    return { energy: r3(energy), duration: r3(duration), length: r3(length), rhythm,
             direction: r3(direction), curvature: r3(curvature), profile, accent };
  }

  function create(raw, seed) {
    const clean = {
      points: (raw.points || []).map((p) => [r3(p[0]), r3(p[1]), Math.round(p[2] || 0)]),
      taps: (raw.taps || [0]).map(Math.round),
      duration: Math.round(raw.duration || 0),
    };
    return { v: 1, id: U.uid(), t: Date.now(), seed: seed != null ? seed : (Math.random() * 2 ** 31) | 0,
             raw: clean, f: derive(clean) };
  }

  // Gesto simulado (para probar sin celulares)
  function simulate(seed) {
    seed = seed != null ? seed : (Math.random() * 2 ** 31) | 0;
    const r = U.rng(seed);
    const n = 15 + Math.floor(r() * 80);
    let x = 0.2 + r() * 0.6, y = 0.2 + r() * 0.6, h = r() * U.TAU, t = 0;
    const step = 0.006 + r() * 0.03;
    const f1 = 0.08 + r() * 0.4, f2 = 0.25 + r() * 1.1, a1 = r() * 0.6, a2 = r() * 0.4;
    const bias = (r() - 0.5) * 0.14;
    const slow = r();
    const pts = [];
    for (let i = 0; i < n; i++) {
      pts.push([x, y, t]);
      h += bias + Math.sin(i * f1) * a1 * 0.3 + Math.sin(i * f2 + 3) * a2 * 0.3;
      const s = step * (0.6 + 0.8 * r());
      x += Math.cos(h) * s; y += Math.sin(h) * s;
      if (x < 0 || x > 1) { h = Math.PI - h; x = U.clamp(x, 0, 1); }
      if (y < 0 || y > 1) { h = -h; y = U.clamp(y, 0, 1); }
      t += 14 + r() * 70 * slow;
    }
    const tapsN = 1 + Math.floor(Math.pow(r(), 1.6) * 6.5);
    const taps = Array.from({ length: tapsN }, (_, i) => Math.round((i / tapsN) * t));
    return create({ points: pts, taps, duration: t + 120 * tapsN }, seed);
  }

  return { derive, create, simulate, resample, PROFILE: P };
})();
