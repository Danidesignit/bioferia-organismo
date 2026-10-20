/* =========================================================================
   /colectivo · sketch principal (p5.js, modo global)
   ========================================================================= */
const W = { w: 0, h: 0, S: 1 };
const STORE_KEY = 'bioferia-colectivo-v2';
const CONF_KEY = 'bioferia-config-v2';

let org, renderer;
let avgFrame = 16, qualityTimer = 0;
let autoTimer = 3, stored = [], hudCount = -1;

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
  stored.forEach((p) => { known.add(p.id); if (p.code && !p.sim) realCount++; });
  if (stored.length) {
    for (const p of stored.slice(-CONFIG.maxZooids)) org.addPulse(p, { instant: true });
    org.warmup(3);
  } else seedInitial();

  PulseBus.onPulse((p) => receive(p));
  PulseBus.onInit(receiveHistory);
  // mantiene despierto el servidor gratis de Render mientras la pantalla esté abierta (se duerme a los 15 min sin visitas)
  setInterval(() => { fetch('/api/count', { cache: 'no-store' }).catch(() => {}); }, 8 * 60 * 1000);
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
  renderer.finish(org);
  updateTags();

  if (org.total !== hudCount) {
    hudCount = org.total;
    // cuenta los aportes reales (los que vienen de un celular); sin ninguno, muestra el total
    document.getElementById('count').textContent = realCount || stored.length || org.zooids.length;
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
// cada pulso se incorpora una sola vez (puede llegar por el stream y por el historial)
const known = new Set();
let realCount = 0;
function receive(p, opts) {
  if (!p || !p.f || known.has(p.id)) return;
  known.add(p.id);
  if (p.code && !p.sim) realCount++;
  const z = org.addPulse(p, opts);
  persist(p);
  hudCount = -1;
  if (p.code && !(opts && opts.instant)) { addTag(p, z); addRecent(p); }
}

/* ---------- códigos: cada visitante encuentra su pulso ---------- */
const tags = [];
let recent = [];
// etiqueta: el nombre (si lo puso) con el código chico al lado; si no, el código
function label(p, el) {
  if (p.name) {
    const b = document.createElement('span'); b.textContent = p.name;
    const s = document.createElement('small'); s.textContent = '#' + p.code;
    el.append(b, s);
  } else el.textContent = '#' + p.code;
}
function addTag(p, z) {
  if (!z) return;
  const el = document.createElement('div');
  el.className = 'pulse-tag';
  label(p, el);
  document.getElementById('tags').appendChild(el);
  tags.push({ el, z, t0: performance.now() });
}
function addRecent(p) {
  recent = [p, ...recent.filter((q) => q.code !== p.code)].slice(0, 4);
  const box = document.getElementById('recent'), b = box.querySelector('b');
  box.hidden = false;
  b.textContent = '';
  recent.forEach((q, i) => {
    if (i) b.append('  ·  ');
    const s = document.createElement('span');
    s.textContent = q.name || '#' + q.code;
    b.append(s);
  });
}
// la etiqueta sigue a su forma ~9 s y se desvanece
function updateTags() {
  const now = performance.now();
  for (let i = tags.length - 1; i >= 0; i--) {
    const g = tags[i], age = (now - g.t0) / 1000;
    if (age > 10 || g.z.dead) { g.el.remove(); tags.splice(i, 1); continue; }
    const x = Math.min(W.w - 60, Math.max(60, g.z.x)), y = Math.min(W.h - 20, Math.max(50, g.z.y - 24 * W.S));
    g.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
    g.el.style.opacity = age > 8.5 ? 0 : 1;
  }
}
// al conectarse, el servidor manda el historial: se suma lo que esta pantalla todavía no tiene
function receiveHistory(list) {
  const fresh = (list || []).filter((p) => p && p.f && !known.has(p.id));
  fresh.forEach((p) => receive(p, { instant: true }));
}
// los simulados también llevan su código, así todos los pulsos se ven iguales en pantalla
function codeFor(seed) {
  const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = '', n = seed >>> 0;
  for (let i = 0; i < 4; i++) { s += A[n % A.length]; n = Math.floor(n / A.length) + i * 7919; }
  return s;
}
function addSimulated() {
  const p = Pulse.simulate();
  p.code = codeFor(p.seed);
  p.sim = true;
  receive(p);
}
function seedInitial() {
  for (let i = 0; i < CONFIG.initialPulses; i++) setTimeout(addSimulated, 400 + i * 900);
}
function resetOrganism() {
  stored = []; known.clear(); realCount = 0;
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
