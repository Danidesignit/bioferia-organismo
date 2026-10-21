/* =========================================================================
   /pulso · web móvil — cada visitante crea su pulso individual
   Pantallas: bienvenida → creación (gesto táctil) → vista previa → confirmación.
   El pulso se dibuja como CALOR (mismo motor térmico que los videos de la marca)
   y se guarda como datos livianos (shared/pulse.js), no como imagen.
   ========================================================================= */
const Q = 0.5;                         // resolución del buffer de calor
const FINISH_MS = 900;                 // espera después de soltar (permite sumar toques)
const SUB = { pulso: 'Pulso', vinculo: 'Vínculo', impacto: 'Impacto' };

// mapa térmico nocturno (el mismo de la pantalla colectiva): negro → azul → violeta → rosa → blanco
const RAMP = [
  [0.00, '#000000'], [0.08, '#04031f'], [0.22, '#1f1fe0'], [0.4, '#6b2cff'],
  [0.58, '#e23bd6'], [0.78, '#ffa6ea'], [1.0, '#ffffff'],
];

const VERT = `
precision highp float;
attribute vec3 aPosition; attribute vec2 aTexCoord;
uniform mat4 uModelViewMatrix, uProjectionMatrix;
varying vec2 vUv;
void main(){ vUv = aTexCoord; gl_Position = uProjectionMatrix * uModelViewMatrix * vec4(aPosition, 1.0); }`;

const FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uHeat, uRamp;
uniform vec2 uRes;
uniform float uTime, uCell;
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
vec3 ramp(float h){ return texture2D(uRamp, vec2(clamp(h, 0.0, 1.0), 0.5)).rgb; }
// se descuenta el residuo mínimo que deja la estela (redondeo de 8 bits), así no quedan fantasmas
float heatAt(vec2 uv){ return 1.0 - exp(-max(texture2D(uHeat, uv).r - 0.035, 0.0) * 1.8); }
void main(){
  vec2 uv = vUv;
  vec2 wp = uv * vec2(3.4, 6.0);
  uv += (vec2(vnoise(wp + uTime * 0.35), vnoise(wp + 7.3 - uTime * 0.3)) - 0.5) * 0.014;
  float h = heatAt(uv);
  float g = hash(gl_FragCoord.xy + fract(uTime) * 91.0) - 0.5;
  // trama de puntos donde el calor se apaga
  float a = 0.4, ca = cos(a), sa = sin(a);
  vec2 px = uv * uRes;
  vec2 r = vec2(ca * px.x - sa * px.y, sa * px.x + ca * px.y);
  vec2 cell = (floor(r / uCell) + 0.5) * uCell, f = fract(r / uCell) - 0.5;
  vec2 cp = vec2(ca * cell.x + sa * cell.y, -sa * cell.x + ca * cell.y);
  float hc = heatAt(cp / uRes);
  float rad = sqrt(hc) * 0.7;
  float dotM = smoothstep(rad, rad - 0.12, length(f));
  float dots = smoothstep(0.34, 0.1, h) * step(0.015, hc);
  vec3 col = mix(ramp(h + g * 0.05), mix(ramp(0.0), ramp(clamp(0.22 + hc * 1.4, 0.0, 1.0)), dotM), dots);
  // isolíneas (lima / rosa) como en los afiches
  float b = h * 7.0, fb = fract(b), d = min(fb, 1.0 - fb);
  float line = (1.0 - smoothstep(0.01, 0.045, d)) * smoothstep(0.3, 0.45, h);
  col = mix(col, mod(floor(b + 0.5), 2.0) < 1.0 ? vec3(0.85, 1.0, 0.23) : vec3(1.0, 0.31, 0.85), line * 0.7);
  col += g * 0.05 * smoothstep(0.0, 0.05, h + dots * hc) + g * 0.012;
  gl_FragColor = vec4(col, 1.0);
}`;

let sh, heat, hctx, rampG, cv;
let screen = 'welcome', gesture = null, pulse = null, view = null, finishTimer = null;
let ripples = [], lastBeat = -1;
const V = { w: 0, h: 0, S: 1 };

/* ---------- utilidades ---------- */
const TAU = Math.PI * 2;
const mod = (a, n) => ((a % n) + n) % n;
const gauss = (x, c, w) => { const q = (x - c) / w; return Math.exp(-q * q); };
const heatRGB = (v) => `rgb(${Math.round(255 * Math.min(1, Math.max(0, v)))},0,0)`;
const lubdub = (q) => gauss(q, 0.05, 0.04) + 0.7 * gauss(q, 0.24, 0.04);   // doble golpe, q en [0,1)
function blob(c, x, y, r, v) {
  if (r <= 0.5 || v <= 0.003) return;
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, heatRGB(v)); g.addColorStop(0.5, heatRGB(v * 0.5)); g.addColorStop(1, 'rgb(0,0,0)');
  c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
}
function ring(c, x, y, r, seed, t) {
  c.beginPath();
  for (let i = 0; i <= 80; i++) {
    const a = (i / 80) * TAU, w = 1 + 0.05 * Math.sin(a * 3 + seed + t * 1.5) + 0.03 * Math.sin(a * 7 - seed * 2 + t * 2.2);
    const px = x + Math.cos(a) * r * w, py = y + Math.sin(a) * r * w;
    i ? c.lineTo(px, py) : c.moveTo(px, py);
  }
}

/* ---------- p5 ---------- */
function setup() {
  pixelDensity(Math.min(2, displayDensity()));
  cv = createCanvas(windowWidth, windowHeight, WEBGL);
  cv.parent('stage');
  sh = createShader(VERT, FRAG);
  rampG = createGraphics(256, 1); rampG.pixelDensity(1);
  const rc = rampG.drawingContext, gr = rc.createLinearGradient(0, 0, 256, 0);
  RAMP.forEach(([p, c]) => gr.addColorStop(p, c));
  rc.fillStyle = gr; rc.fillRect(0, 0, 256, 1);
  buildHeat();
  bindTouch(cv.elt);
  bindUI();
  loadLogo();
}

function buildHeat() {
  V.w = windowWidth; V.h = windowHeight; V.S = Math.min(V.w, V.h);
  if (heat) heat.remove();
  heat = createGraphics(Math.ceil(V.w * Q), Math.ceil(V.h * Q)); heat.pixelDensity(1);
  hctx = heat.drawingContext;
  hctx.fillStyle = '#000'; hctx.fillRect(0, 0, heat.width, heat.height);
  if (pulse) view = layoutPulse(pulse);
}
function windowResized() { resizeCanvas(windowWidth, windowHeight); buildHeat(); }

function draw() {
  const t = millis() / 1000, c = hctx;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalCompositeOperation = 'source-over'; c.filter = 'none'; c.globalAlpha = 1;
  c.fillStyle = `rgba(0,0,0,${screen === 'create' ? 0.05 : 0.14})`;
  c.fillRect(0, 0, heat.width, heat.height);
  c.setTransform(Q, 0, 0, Q, 0, 0);                 // a partir de acá se dibuja en px de pantalla
  c.globalCompositeOperation = 'lighter';
  c.lineCap = 'round'; c.lineJoin = 'round';

  if (screen === 'welcome') drawIdle(c, t);
  if (screen === 'create') drawCreate(c, t);
  if ((screen === 'preview' || screen === 'sent') && view) drawPulse(c, view, t);
  drawRipples(c, t);
  c.filter = 'none';

  const pd = pixelDensity();
  shader(sh);
  sh.setUniform('uHeat', heat);
  sh.setUniform('uRamp', rampG);
  sh.setUniform('uRes', [V.w * pd, V.h * pd]);
  sh.setUniform('uTime', t);
  sh.setUniform('uCell', (V.S * pd) / 60);
  noStroke();
  rect(-width / 2, -height / 2, width, height);
}

/* ---------- 1 · bienvenida: un pulso que late en reposo ---------- */
function drawIdle(c, t) {
  const S = V.S, x = V.w / 2, y = V.h * 0.4, period = 1.6;
  const q = mod(t, period) / period, hb = lubdub(q);
  c.filter = `blur(${S * Q * 0.02}px)`;
  blob(c, x, y, S * (0.07 + 0.03 * hb), 0.35 + 0.45 * hb);
  const beat = Math.floor(t / period);
  if (beat !== lastBeat) { lastBeat = beat; ripples.push({ x, y, t0: t, k: 0.7 }); }
}

/* ---------- 2 · creación: el gesto deja calor en tiempo real ---------- */
function drawCreate(c, t) {
  if (!gesture) return;
  const S = V.S, pts = gesture.points;
  // tramo nuevo del recorrido: manchas de calor más grandes si el dedo va rápido
  c.filter = `blur(${S * Q * 0.012}px)`;
  for (let i = Math.max(1, gesture.drawn); i < pts.length; i++) {
    const [x0, y0, t0] = pts[i - 1], [x1, y1, t1] = pts[i];
    const dist = Math.hypot(x1 - x0, y1 - y0), speed = dist / Math.max(1, t1 - t0) * 1000;
    const steps = Math.max(1, Math.ceil((dist * S) / 6));
    for (let k = 1; k <= steps; k++) {
      const u = k / steps;
      blob(c, (x0 + (x1 - x0) * u) * S, (y0 + (y1 - y0) * u) * S, S * (0.022 + Math.min(0.05, speed * 0.02)), 0.1);
    }
  }
  gesture.drawn = pts.length;
  // el dedo: un punto que late; si se queda quieto, la bolita crece cada vez más
  if (gesture.down && pts.length) {
    const [x, y] = pts[pts.length - 1];
    const still = Math.max(0, (performance.now() - gesture.stillSince) / 1000 - 0.35);
    const grow = 1 - Math.exp(-still / 2.6);                       // crece rápido al principio y después más lento
    const hb = lubdub(mod(t, 0.9) / 0.9);
    c.filter = `blur(${S * Q * (0.015 + 0.03 * grow)}px)`;
    blob(c, x * S, y * S, S * (0.045 + 0.32 * grow) * (1 + 0.12 * hb), (0.2 + 0.18 * hb) * (1 - 0.6 * grow) + 0.05);
    const beat = Math.floor(t / 0.9);
    if (grow > 0.08 && beat !== gesture.lastBeat) {                 // cada latido de la bolita suelta una onda
      gesture.lastBeat = beat;
      ripples.push({ x: x * S, y: y * S, t0: t, k: 0.5 + grow });
    }
  }
}

function drawRipples(c, t) {
  const S = V.S;
  c.filter = `blur(${S * Q * 0.006}px)`;
  ripples = ripples.filter((r) => t - r.t0 < 2.2);
  for (const r of ripples) {
    for (let j = 0; j < 2; j++) {
      const lt = t - r.t0 - j * 0.16;
      if (lt <= 0) continue;
      c.strokeStyle = heatRGB(0.3 * r.k * Math.exp(-lt * 1.8));
      c.lineWidth = S * (0.012 - j * 0.004);
      ring(c, r.x, r.y, S * (0.06 + lt * 0.42), r.t0 * 10 + j, lt); c.stroke();
    }
  }
}

/* ---------- 3 · vista previa: el pulso reconstruido desde sus datos ---------- */
// ubica el recorrido del gesto centrado y escalado en la pantalla
function layoutPulse(p, cyK = 0.47, scaleK = 1) {
  const raw = p.raw.points.map((q) => [q[0], q[1]]);
  const rs = Pulse.resample(raw.length ? raw : [[0.5, 0.5]], 48);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  rs.forEach(([x, y]) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); });
  const size = Math.max(x1 - x0, y1 - y0), compact = size < 0.04;
  const box = Math.min(V.w * 0.78, V.h * 0.42) * scaleK, sc = compact ? 0 : box / size;
  const cx = V.w / 2, cy = V.h * cyK;
  const pts = rs.map(([x, y]) => [cx + (x - (x0 + x1) / 2) * sc, cy + (y - (y0 + y1) / 2) * sc]);
  const r = U.rng(p.seed);
  return { p, f: p.f, pts, compact, cx, cy, seed: r() * 100, freq: 0.35 + p.f.energy * 1.1 };
}

function drawPulse(c, v, t) {
  const S = V.S, f = v.f, n = 22 + f.rhythm * 3, pts = v.pts, last = pts.length - 1;
  const grow = Math.min(1, (t - (v.t0 || 0)) / 1.2);              // aparece creciendo
  // recorrido fino (la huella del gesto)
  if (!v.compact) {
    c.filter = `blur(${S * Q * 0.004}px)`;
    c.strokeStyle = heatRGB(0.12 * grow); c.lineWidth = S * 0.006;
    c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.stroke();
  }
  // nube de calor que respira; los latidos (toques) recorren el pulso
  c.filter = `blur(${S * Q * 0.012}px)`;
  for (let k = 0; k < n; k++) {
    const u = k / (n - 1);
    let x, y;
    if (v.compact) {
      const a = k * 2.399 + t * 0.3, rr = Math.sqrt(k) * S * 0.022 * (1 + f.rhythm * 0.08) * (1 + 2.2 * f.duration);
      x = v.cx + Math.cos(a) * rr; y = v.cy + Math.sin(a) * rr;
    } else {
      [x, y] = pts[Math.round(u * last)];
    }
    x += (noise(v.seed + k * 0.7, t * 0.35) - 0.5) * S * 0.07 * (0.5 + f.length);
    y += (noise(v.seed + 40 + k * 0.7, t * 0.35) - 0.5) * S * 0.07 * (0.5 + f.length);
    let beat = 0;
    for (let b = 0; b < f.rhythm; b++) beat += gauss(u, mod(t * v.freq * 0.35 + b / f.rhythm, 1), 0.12);
    const r = S * (0.06 + 0.035 * f.energy + 0.025 * f.duration) * (1.15 - 0.4 * u)
            * (0.85 + 0.2 * Math.sin(t * v.freq * TAU + k * 1.3)) * (1 + 0.25 * beat) * (0.4 + 0.6 * grow);
    blob(c, x, y, v.compact ? r * (1 + 1.4 * f.duration) : r, (0.055 + 0.04 * f.energy) * (1 + 1.2 * beat) * grow);
  }
  // ondas: tantas como toques, al ritmo del pulso
  const origin = v.compact ? [v.cx, v.cy] : pts[0];
  c.filter = `blur(${S * Q * 0.006}px)`;
  for (let j = 0; j < f.rhythm; j++) {
    const lt = mod(t * v.freq * 0.5 + j / f.rhythm, 1) * 2.4;
    c.strokeStyle = heatRGB(0.16 * Math.exp(-lt * 1.5) * grow); c.lineWidth = S * 0.008;
    ring(c, origin[0], origin[1], S * (0.05 + lt * 0.3), j * 3, lt); c.stroke();
  }
}

/* ---------- gesto táctil ---------- */
function bindTouch(el) {
  const pos = (e) => { const r = el.getBoundingClientRect(); return [(e.clientX - r.left) / V.S, (e.clientY - r.top) / V.S]; };
  el.addEventListener('pointerdown', (e) => {
    if (screen !== 'create') return;
    e.preventDefault();
    try { el.setPointerCapture(e.pointerId); } catch (_) {}
    clearTimeout(finishTimer);
    const now = performance.now();
    if (!gesture) gesture = { t0: now, points: [], taps: [], drawn: 0 };
    gesture.down = true; gesture.downAt = now; gesture.stillSince = now;
    gesture.taps.push(now - gesture.t0);
    const [x, y] = pos(e);
    gesture.points.push([x, y, now - gesture.t0]);
    ripples.push({ x: x * V.S, y: y * V.S, t0: millis() / 1000, k: 1 });
    document.body.classList.add('touching');
    status('');
  });
  el.addEventListener('pointermove', (e) => {
    if (!gesture || !gesture.down) return;
    const [x, y] = pos(e), p = gesture.points, l = p[p.length - 1];
    if (!l || Math.hypot(x - l[0], y - l[1]) > 0.006) { p.push([x, y, performance.now() - gesture.t0]); gesture.stillSince = performance.now(); }
  });
  const up = (e) => {
    if (!gesture || !gesture.down) return;
    gesture.down = false;
    const [x, y] = pos(e);
    gesture.points.push([x, y, performance.now() - gesture.t0]);
    status('Tocá de nuevo para sumar latidos…');
    finishTimer = setTimeout(finishGesture, FINISH_MS);
  };
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
}

function finishGesture() {
  const g = gesture;
  if (!g || !g.points.length) return;
  const last = g.points[g.points.length - 1][2];
  const duration = Math.max(last, g.taps[g.taps.length - 1] + 200);
  pulse = Pulse.create({ points: g.points, taps: g.taps, duration });
  pulse.code = makeCode(pulse.seed);
  view = layoutPulse(pulse);
  view.t0 = millis() / 1000;
  document.querySelector('.traits').textContent = describePulse(pulse.f);
  const inp = document.getElementById('name');
  inp.placeholder = "Un nombre o apodo";
  document.querySelector('.sign-msg').textContent = '';
  go('preview');
}

// una frase que describe el pulso según su gesto (en lugar de datos sueltos)
function describePulse(f) {
  const lat = f.rhythm === 1 ? 'un latido' : `${['', 'un', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete'][f.rhythm]} latidos`;
  const pace = f.energy > 0.66 ? 'rápido y con fuerza' : f.energy > 0.33 ? 'con un ritmo propio' : 'despacio, sin apuro';
  if (f.accent === 'vinculo') return `Tu pulso recorre un camino largo, ${pace}, buscando con quién conectar.`;
  if (f.accent === 'impacto') return `Tu pulso llega ${pace} y deja huella en todo lo que toca.`;
  return `Tu pulso late ${pace}: ${lat} que empiezan algo nuevo.`;
}

// código corto para encontrar el propio pulso en la pantalla colectiva
function makeCode(seed) {
  const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = '', n = seed >>> 0;
  for (let i = 0; i < 4; i++) { s += A[n % A.length]; n = Math.floor(n / A.length) + i * 7919; }
  return s;
}

/* ---------- pantallas ---------- */
function go(name) {
  screen = name;
  document.body.dataset.screen = name;
  document.querySelectorAll('.screen').forEach((s) => (s.hidden = s.id !== name));
  if (name === 'create') {
    gesture = null; pulse = null; view = null; ripples = [];
    document.body.classList.remove('touching');
    status('');
    hctx.setTransform(1, 0, 0, 1, 0, 0); hctx.globalCompositeOperation = 'source-over'; hctx.filter = 'none';
    hctx.fillStyle = '#000'; hctx.fillRect(0, 0, heat.width, heat.height);
  }
}
function status(txt) { document.querySelector('.status').textContent = txt; }

function bindUI() {
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-go],[data-act]');
    if (!b) return;
    if (b.dataset.go) go(b.dataset.go);
    if (b.dataset.act === 'share' && pulse) {
      b.disabled = true; b.textContent = 'Preparando…';
      try { await sharePulse(); } catch (_) {}
      b.disabled = false; b.textContent = 'Compartir';
    }
    if (b.dataset.act === 'send' && pulse) {
      const inp = document.getElementById('name'), msg = document.querySelector('.sign-msg');
      const { name, rejected } = Names.clean(inp.value);
      if (rejected) { msg.textContent = 'Ese nombre no se puede usar. Probá con otro o dejalo vacío.'; inp.focus(); return; }
      msg.textContent = '';
      if (name) pulse.name = name; else delete pulse.name;
      inp.blur();
      b.disabled = true; b.textContent = 'Sumando…';
      const r = await PulseBus.send(pulse, (s) => { if (s >= 4) b.textContent = s < 15 ? 'Conectando…' : 'Despertando la pantalla… ' + s + ' s'; });
      b.disabled = false;
      if (r.ok) {
        const code = document.querySelector('.code');
        code.textContent = pulse.name || '#' + pulse.code;
        if (pulse.name) { const sm = document.createElement('small'); sm.textContent = '#' + pulse.code; code.appendChild(sm); }
        document.querySelector('.sent-title').textContent = pulse.name
          ? `${pulse.name}, tu pulso ya forma parte de algo más grande`
          : 'Tu pulso ya forma parte de algo más grande';
        ripples.push({ x: view.cx, y: view.cy, t0: millis() / 1000, k: 1.4 });
        b.textContent = 'Sumar al colectivo';
        go('sent');
        const t0 = view.t0; view = layoutPulse(pulse, 0.58, 0.7); view.t0 = t0;
      } else {
        b.textContent = (r.error || 'No se pudo enviar') + ' · Reintentar';
      }
    }
  });
}

/* ---------- 5 · compartir: pieza vertical para historias ---------- */
const HASHTAG = '#SumarParaConectar';
function wrapText(c, text, x, y, maxW, lh) {
  const words = text.split(' ');
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (c.measureText(test).width > maxW && line) { c.fillText(line, x, y); line = w; y += lh; } else line = test;
  }
  if (line) c.fillText(line, x, y);
  return y;
}
async function storyImage() {
  const SW = 1080, SH = 1920, M = 84;
  const cvs = document.createElement('canvas'); cvs.width = SW; cvs.height = SH;
  const c = cvs.getContext('2d');
  c.fillStyle = '#000'; c.fillRect(0, 0, SW, SH);
  // el pulso animado tal como se ve ahora (cubre el área central); redraw() asegura un cuadro recién dibujado
  const keep = view;
  view = layoutPulse(pulse, 0.5, 0.95); view.t0 = keep.t0;           // centrado para la historia
  hctx.setTransform(1, 0, 0, 1, 0, 0); hctx.globalCompositeOperation = 'source-over'; hctx.filter = 'none';
  hctx.fillStyle = '#000'; hctx.fillRect(0, 0, heat.width, heat.height);   // empieza limpio
  for (let i = 0; i < 24; i++) redraw();                              // deja que el calor se acumule
  const src = drawingContext.canvas, bw = SW, bh = 1120, by = 230;
  const s = Math.max(bw / src.width, bh / src.height), w = src.width * s, h = src.height * s;
  c.save(); c.beginPath(); c.rect(0, by, bw, bh); c.clip();
  c.drawImage(src, (bw - w) / 2, by + (bh - h) / 2 - bh * 0.03, w, h);
  c.restore();
  const fade = (y0, y1, a0, a1) => { const g = c.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, `rgba(0,0,0,${a0})`); g.addColorStop(1, `rgba(0,0,0,${a1})`); c.fillStyle = g; c.fillRect(0, y0, SW, y1 - y0); };
  fade(by, by + 140, 1, 0); fade(by + bh - 220, by + bh, 0, 1);
  view = keep;
  // logo
  try {
    const img = new Image(); img.src = '../assets/bioferia-logo.svg';
    await img.decode();
    c.drawImage(img, M, 110, 300, 300 * (177 / 869));
  } catch (_) {}
  // textos
  c.fillStyle = '#F4F3EE';
  c.font = '800 92px "Bricolage Grotesque"';
  let y = wrapText(c, pulse.name ? `${pulse.name} ya es parte del organismo` : 'Mi pulso ya es parte del organismo', M, 1420, SW - M * 2, 92);
  c.fillStyle = 'rgba(244,243,238,.72)';
  c.font = '500 40px "Instrument Sans"';
  wrapText(c, describePulse(pulse.f), M, y + 76, SW - M * 2, 52);
  c.fillStyle = '#ffa6ea';
  c.font = '800 54px "Bricolage Grotesque"';
  c.fillText(pulse.name ? `${pulse.name} · #${pulse.code}` : '#' + pulse.code, M, SH - 96);
  c.fillStyle = '#F4F3EE';
  c.font = '600 40px "Instrument Sans"';
  c.textAlign = 'right';
  c.fillText(HASHTAG, SW - M, SH - 100);
  return new Promise((r) => cvs.toBlob(r, 'image/png'));
}
async function sharePulse() {
  const blob = await storyImage();
  const file = new File([blob], `mi-pulso-bioferia-${pulse.code}.png`, { type: 'image/png' });
  const text = `Sumé mi pulso al organismo vivo de Bioferia. ${HASHTAG}`;
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], text }); return; }
    catch (e) { if (e && e.name === 'AbortError') return; }      // la persona cerró el menú
  }
  // sin menú de compartir (ej.: computadora): se descarga la imagen
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = file.name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

async function loadLogo() {
  try {
    const svg = await (await fetch('../assets/bioferia-logo.svg')).text();
    document.querySelectorAll('.logo').forEach((el) => (el.innerHTML = svg.replace(/fill="white"/g, 'fill="currentColor"')));
  } catch (_) {}
}
