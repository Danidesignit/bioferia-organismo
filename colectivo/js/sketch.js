/* =========================================================================
   /colectivo · sketch principal (p5.js, modo global)
   ========================================================================= */
const W = { w: 0, h: 0, S: 1 };
const STORE_KEY = 'bioferia-colectivo-v2';
const CONF_KEY = 'bioferia-config-v2';

let org, renderer;
let avgFrame = 16, qualityTimer = 0;
let autoTimer = 3, stored = [], gesture = null, gestureTimer = null, hudCount = -1;

/* ---------- persistencia ---------- */
function loadConfig() { try { const s = JSON.parse(localStorage.getItem(CONF_KEY) || 'null'); if (s) Object.assign(CONFIG, s); } catch (_) {} }
function saveConfig() { try { localStorage.setItem(CONF_KEY, JSON.stringify(CONFIG)); } catch (_) {} }
function loadStore() { try { stored = JSON.parse(localStorage.getItem(STORE_KEY) || '[]') || []; } catch (_) { stored = []; } }
function persist(p) {
  if (!CONFIG.persist) return;
  stored.push(p);
  if (stored.length > 400) stored = stored.slice(-400);
  try { localStorage.setItem(STORE_KEY, JSON.stringify(stored)); } catch (_) {}
}

/* ---------- p5 ---------- */
function setup() {
  loadConfig();
  pixelDensity(CONFIG.pixelDensity);
  measure();
  const c = createCanvas(W.w, W.h, WEBGL);
  c.parent('stage');
  noiseDetail(3, 0.5);
  renderer = new HeatRenderer();
  applyTheme(CONFIG.theme);
  org = new Organism();

  loadStore();
  if (stored.length) {
    for (const p of stored.slice(-CONFIG.maxZooids)) org.addPulse(p, { instant: true });
    org.warmup(3);
  } else seedInitial();

  PulseBus.onPulse((p) => receive(p));
  GUI.build(onAction, () => saveConfig());
  QR.render();
}

function measure() {
  W.w = Math.max(1, windowWidth); W.h = Math.max(1, windowHeight);
  W.S = Math.max(0.25, Math.min(W.w, W.h) / 900);
}

function windowResized() {
  const ow = W.w, oh = W.h;
  measure();                       // antes de resizeCanvas: p5 redibuja dentro de esa llamada
  if (ow > 1 && oh > 1) org.rescale(ow, oh);
  renderer.build();
  resizeCanvas(W.w, W.h);
}

function draw() {
  const real = Math.min(1 / 30, Math.max(1 / 240, deltaTime / 1000));
  const dt = real * CONFIG.speed;
  org.update(dt);
  adaptQuality(real);

  if (CONFIG.autoSimulate) {
    autoTimer -= real;
    if (autoTimer <= 0) { addSimulated(); autoTimer = CONFIG.autoInterval * (0.6 + Math.random() * 0.8); }
  }

  renderer.begin();
  org.draw(renderer.ctx);
  drawGesture(renderer.ctx);
  renderer.finish(org);

  if (org.total !== hudCount) {
    hudCount = org.total;
    document.getElementById('count').textContent = stored.length || org.zooids.length;
  }
}

/* ---------- calidad adaptativa ----------
   Si la pantalla no llega a ~45 fps, se reduce la cantidad de formas con
   detalle completo; si sobra margen, se recupera. */
function adaptQuality(real) {
  if (deltaTime > 100) return;          // pestaña oculta o pausa: no cuenta
  avgFrame += (deltaTime - avgFrame) * 0.05;
  qualityTimer += real;
  if (qualityTimer < 1.5) return;
  qualityTimer = 0;
  const cur = Math.min(org.detailLimit, CONFIG.detailCount);
  if (avgFrame > 22) org.detailLimit = Math.max(10, cur - 8);
  else if (avgFrame < 17 && org.detailLimit < CONFIG.detailCount) org.detailLimit = cur + 4;
  const fpsEl = document.getElementById('fps');
  if (fpsEl) fpsEl.textContent = Math.round(1000 / avgFrame) + ' fps';
}

/* ---------- pulsos ---------- */
function receive(p, opts) {
  org.addPulse(p, opts);
  persist(p);
}
function addSimulated() { receive(Pulse.simulate()); }
function seedInitial() {
  for (let i = 0; i < CONFIG.initialPulses; i++) setTimeout(addSimulated, 400 + i * 900);
}
function resetOrganism() {
  stored = [];
  try { localStorage.removeItem(STORE_KEY); } catch (_) {}
  org = new Organism();
  seedInitial();
}

/* ---------- apariencia ---------- */
function applyTheme(name) {
  if (!HEATMAPS[name]) name = 'noche';
  CONFIG.theme = name;
  document.body.dataset.theme = HEATMAPS[name].ui;
  renderer.setTheme(name);
}

/* ---------- gesto de prueba con mouse/touch sobre la pantalla colectiva ----------
   Arrastrar = trazo · varios toques seguidos = ritmo. Simula lo que hará /pulso. */
function isCanvasEvent(e) { return !e || !e.target || e.target.tagName === 'CANVAS'; }
function mousePressed(e) {
  if (!isCanvasEvent(e)) return;
  clearTimeout(gestureTimer);
  if (!gesture) gesture = { t0: millis(), points: [], taps: [] };
  gesture.down = true;
  const tt = millis() - gesture.t0, taps = gesture.taps;
  if (!taps.length || tt - taps[taps.length - 1] > 80) taps.push(tt);
  addGesturePoint();
}
function mouseDragged(e) { if (gesture && gesture.down) addGesturePoint(); }
function mouseReleased() {
  if (!gesture || !gesture.down) return;
  gesture.down = false;
  gestureTimer = setTimeout(finishGesture, 650);
}
function addGesturePoint() {
  const p = gesture.points, x = mouseX / W.w, y = mouseY / W.h, last = p[p.length - 1];
  if (!last || Math.hypot(x - last[0], y - last[1]) > 0.004) p.push([x, y, millis() - gesture.t0]);
}
function finishGesture() {
  const g = gesture; gesture = null;
  if (!g || !g.points.length) return;
  const end = g.points[g.points.length - 1];
  const duration = Math.max(end[2], g.taps[g.taps.length - 1] + 200);
  const p = Pulse.create({ points: g.points, taps: g.taps, duration });
  receive(p, { spawn: { x: end[0] * W.w, y: end[1] * W.h } });
}
// mientras se dibuja, el gesto deja calor en pantalla
function drawGesture(ctx) {
  if (!gesture || !gesture.points.length) return;
  const p = gesture.points;
  ctx.strokeStyle = heatStyle(0.12, 0.5);
  ctx.lineWidth = 3 * W.S;
  ctx.beginPath();
  p.forEach((q, i) => (i ? ctx.lineTo(q[0] * W.w, q[1] * W.h) : ctx.moveTo(q[0] * W.w, q[1] * W.h)));
  ctx.stroke();
}

/* ---------- controles ---------- */
function onAction(a) {
  if (a === 'add') addSimulated();
  else if (a === 'add10') for (let i = 0; i < 10; i++) setTimeout(addSimulated, i * 350);
  else if (a === 'auto') { CONFIG.autoSimulate = !CONFIG.autoSimulate; GUI.refreshAuto(); saveConfig(); }
  else if (a === 'theme') { applyTheme(CONFIG.theme === 'noche' ? 'dia' : 'noche'); saveConfig(); }
  else if (a === 'copy') navigator.clipboard && navigator.clipboard.writeText(JSON.stringify(CONFIG, null, 2));
  else if (a === 'defaults') { Object.assign(CONFIG, CONFIG_DEFAULTS); applyTheme(CONFIG.theme); GUI.sync(); saveConfig(); }
  else if (a === 'reset') resetOrganism();
  else if (a === 'png') saveCanvas('bioferia-organismo-' + Date.now(), 'png');
}

function keyPressed(e) {
  if (document.activeElement && document.activeElement.tagName === 'INPUT' && keyCode >= 37 && keyCode <= 40) return;
  const k = key.toLowerCase();
  if (key === ' ' || k === 'n') { addSimulated(); return false; }
  if (k === 'b') onAction('add10');
  if (k === 'a') onAction('auto');
  if (k === 't') onAction('theme');
  if (k === 'g') GUI.toggle();
  if (k === 'h') document.body.classList.toggle('bare');
  if (k === 's') onAction('png');
  if (k === 'f') fullscreen(!fullscreen());
  if (key === 'R') resetOrganism();
}
