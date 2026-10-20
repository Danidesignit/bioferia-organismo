/* =========================================================================
   RENDER TÉRMICO
   1. El organismo dibuja CALOR en un buffer 2D (canal R = calor,
      canal G = calor × mapa elegido). Las fibras se suman ('lighter').
   2. El buffer se desvanece un poco cada frame → estela / quemado.
   3. Una copia desenfocada = glow.
   4. Shader: distorsión de ondas, aberración, grano, mapa de gradiente de
      marca (3 mapas que se mezclan) e isolíneas de contorno.
   ========================================================================= */

const HEAT_VERT = `
precision highp float;
attribute vec3 aPosition;
attribute vec2 aTexCoord;
uniform mat4 uModelViewMatrix;
uniform mat4 uProjectionMatrix;
varying vec2 vUv;
void main() {
  vUv = aTexCoord;
  gl_Position = uProjectionMatrix * uModelViewMatrix * vec4(aPosition, 1.0);
}`;

const HEAT_FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uHeat;
uniform sampler2D uGlow;
uniform sampler2D uPal;
uniform vec4 uWaves[8];
uniform float uAspect, uTime, uExposure, uGlowK, uContour, uBands, uGrain, uAberr, uFloor, uWaveW;
uniform vec3 uCA, uCB;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
vec2 heatAt(vec2 uv) {
  vec4 a = texture2D(uHeat, uv);
  vec4 g = texture2D(uGlow, uv);
  float h = a.r + g.r * uGlowK;
  float s = (a.g + g.g * uGlowK) / max(h, 0.002);
  return vec2(h, s);
}
float tone(float h) { return 1.0 - exp(-max(h - uFloor, 0.0) * uExposure); }
vec3 pal(float h, float s) {
  float a = clamp(s, 0.0, 1.0) * 2.0;
  vec3 c0 = texture2D(uPal, vec2(h, 0.1667)).rgb;
  vec3 c1 = texture2D(uPal, vec2(h, 0.5)).rgb;
  vec3 c2 = texture2D(uPal, vec2(h, 0.8333)).rgb;
  return a < 1.0 ? mix(c0, c1, a) : mix(c1, c2, a - 1.0);
}

void main() {
  vec2 uv = vUv;
  float ring = 0.0;
  vec2 push = vec2(0.0);
  for (int i = 0; i < 8; i++) {
    vec4 w = uWaves[i];
    if (w.w <= 0.0) continue;
    vec2 d = uv - w.xy;
    d.x *= uAspect;
    float r = length(d) + 1e-5;
    float q = (r - w.z) / uWaveW;
    float b = exp(-q * q) * w.w;
    push += (d / r) * b;
    ring += b;
  }
  push.x /= uAspect;
  uv -= push * 0.02;

  vec2 hs = heatAt(uv);
  float ab = uAberr * (0.0012 + ring * 0.006);
  float hr = heatAt(uv + vec2(ab, 0.0)).x;
  float hb = heatAt(uv - vec2(ab, 0.0)).x;

  float n = hash(gl_FragCoord.xy + fract(uTime) * 137.0) - 0.5;
  float h = tone(hs.x) + ring * 0.16;
  float g = uGrain * (0.25 + h);
  vec3 col;
  col.r = pal(clamp(tone(hr) + ring * 0.16 + n * g, 0.0, 1.0), hs.y).r;
  col.g = pal(clamp(h + n * g, 0.0, 1.0), hs.y).g;
  col.b = pal(clamp(tone(hb) + ring * 0.16 + n * g, 0.0, 1.0), hs.y).b;

  // isolíneas (halos posterizados de la marca)
  float hc = h + n * g * 0.4;
  float b = hc * uBands;
  float f = fract(b);
  float d = min(f, 1.0 - f);
  float line = (1.0 - smoothstep(0.012, 0.05, d)) * smoothstep(0.05, 0.16, hc);
  vec3 cc = mod(floor(b + 0.5), 2.0) < 1.0 ? uCA : uCB;
  col = mix(col, cc, line * uContour);

  gl_FragColor = vec4(col, 1.0);
}`;

class HeatRenderer {
  constructor() {
    this.sh = createShader(HEAT_VERT, HEAT_FRAG);
    this.waveData = new Float32Array(32);
    this.build();
    this.setTheme(CONFIG.theme);
  }

  build() {
    const q = CONFIG.heatScale;
    this.q = q;
    const w = Math.max(2, Math.ceil(W.w * q)), h = Math.max(2, Math.ceil(W.h * q));
    if (this.heat) { this.heat.remove(); this.glow.remove(); }
    this.heat = createGraphics(w, h); this.heat.pixelDensity(1);
    this.glow = createGraphics(Math.ceil(w / 4), Math.ceil(h / 4)); this.glow.pixelDensity(1);
    this.ctx = this.heat.drawingContext;
    this.gctx = this.glow.drawingContext;
    this.canFilter = typeof this.gctx.filter === 'string';
    this.ctx.fillStyle = '#000'; this.ctx.fillRect(0, 0, w, h);
  }

  setTheme(name) {
    const hm = HEATMAPS[name] || HEATMAPS.noche;
    if (!this.pal) { this.pal = createGraphics(256, 3); this.pal.pixelDensity(1); }
    const c = this.pal.drawingContext;
    ['pulso', 'vinculo', 'impacto'].forEach((k, row) => {
      const gr = c.createLinearGradient(0, 0, 256, 0);
      for (const [p, col] of hm[k]) gr.addColorStop(p, col);
      c.fillStyle = gr;
      c.fillRect(0, row, 256, 1);
    });
    this.ca = U.hex(hm.contourA).map((v) => v / 255);
    this.cb = U.hex(hm.contourB).map((v) => v / 255);
  }

  // inicio de frame: desvanece el calor anterior y prepara la escala
  begin() {
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
    c.fillStyle = `rgba(0,0,0,${U.lerp(0.6, 0.03, CONFIG.trail)})`;
    c.fillRect(0, 0, this.heat.width, this.heat.height);
    c.setTransform(this.q, 0, 0, this.q, 0, 0);
    c.globalCompositeOperation = 'lighter';
    c.lineCap = 'round';
    c.lineJoin = 'round';
  }

  finish(org) {
    // glow
    const g = this.gctx;
    g.globalCompositeOperation = 'copy';
    if (this.canFilter) g.filter = `blur(${CONFIG.glowBlur * Math.max(1, W.S)}px)`;   // escala con la resolución
    g.drawImage(this.heat.elt, 0, 0, this.glow.width, this.glow.height);
    if (this.canFilter) g.filter = 'none';

    // ondas → uniforms
    const wd = this.waveData;
    wd.fill(0);
    org.waves.slice(-8).forEach((w, i) => {
      const age = org.t - w.t0;
      wd[i * 4] = w.x / W.w;
      wd[i * 4 + 1] = w.y / W.h;
      wd[i * 4 + 2] = (age * CONFIG.waveSpeed * W.S) / W.h;
      wd[i * 4 + 3] = Math.min(1.5, Math.exp(-age / CONFIG.waveDecay) * w.k * CONFIG.waveAmp);
    });

    const s = this.sh;
    shader(s);
    s.setUniform('uHeat', this.heat);
    s.setUniform('uGlow', this.glow);
    s.setUniform('uPal', this.pal);
    s.setUniform('uWaves', Array.from(wd));
    s.setUniform('uAspect', W.w / W.h);
    s.setUniform('uTime', (millis() / 1000) % 1000);
    s.setUniform('uExposure', CONFIG.exposure);
    s.setUniform('uGlowK', CONFIG.glow);
    s.setUniform('uContour', CONFIG.contours);
    s.setUniform('uBands', CONFIG.bands);
    s.setUniform('uGrain', CONFIG.grain);
    s.setUniform('uAberr', CONFIG.aberration);
    s.setUniform('uFloor', 0.04);
    s.setUniform('uWaveW', (CONFIG.waveWidth * W.S * 0.5) / W.h);
    s.setUniform('uCA', this.ca);
    s.setUniform('uCB', this.cb);
    noStroke();
    rect(-width / 2, -height / 2, width, height);
  }
}

// mancha de calor difusa (sprite precalculado por mapa: rápido de dibujar cientos)
const HEAT_SPRITES = [];
function heatSprite(shift) {
  const k = Math.round(U.clamp(shift, 0, 1) * 10);
  if (!HEAT_SPRITES[k]) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const c = cv.getContext('2d'), g = c.createRadialGradient(32, 32, 0, 32, 32, 32), gc = Math.round((k / 10) * 255);
    g.addColorStop(0, `rgba(255,${gc},0,1)`);
    g.addColorStop(0.35, `rgba(255,${gc},0,0.55)`);
    g.addColorStop(0.7, `rgba(255,${gc},0,0.15)`);
    g.addColorStop(1, `rgba(255,${gc},0,0)`);
    c.fillStyle = g;
    c.fillRect(0, 0, 64, 64);
    HEAT_SPRITES[k] = cv;
  }
  return HEAT_SPRITES[k];
}
function heatBlob(ctx, x, y, r, heat, shift) {
  if (heat <= 0.003 || r <= 0.5) return;
  ctx.globalAlpha = Math.min(1, heat);
  ctx.drawImage(heatSprite(shift), x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = 1;
}

// estilo de trazo en el buffer de calor
function heatStyle(i, shift) {
  i = U.clamp(i, 0, 1);
  return `rgb(${Math.round(i * 255)},${Math.round(i * U.clamp(shift, 0, 1) * 255)},0)`;
}
