// Servidor de Bioferia · organismo vivo — sin dependencias:  node server.js
// - Sirve los archivos del proyecto (/colectivo, /pulso, ...).
// - Tiempo real: los celulares envían su pulso (POST /api/pulse) y el servidor lo
//   transmite al instante a todas las pantallas conectadas (GET /api/stream, eventos SSE).
// - Guarda los pulsos en data/pulses.json para recuperarlos si el servidor se reinicia
//   (en el plan gratis de Render ese disco se borra en cada deploy/reinicio).
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = process.env.PORT || 5173;
const ROOT = __dirname;
const DATA = path.join(ROOT, 'data', 'pulses.json');
const MAX_STORED = 600;        // pulsos que se conservan
const INIT_SEND = 200;         // pulsos que recibe una pantalla al conectarse
const MIN_GAP_MS = 2500;       // un pulso cada 2,5 s por dispositivo (evita spam)

const lanIPs = () => Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
                '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.md': 'text/plain; charset=utf-8' };

/* ---------- pulsos ---------- */
let pulses = [];
try { pulses = JSON.parse(fs.readFileSync(DATA, 'utf8')); } catch (_) { pulses = []; }
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.mkdirSync(path.dirname(DATA), { recursive: true });
    fs.writeFile(DATA, JSON.stringify(pulses), () => {});
  }, 500);
}

const clamp = (v, a, b) => (typeof v === 'number' && isFinite(v) ? Math.min(b, Math.max(a, v)) : a);
// acepta solo los campos esperados, con números acotados (no se guarda ningún dato personal)
function clean(p) {
  if (!p || typeof p !== 'object' || !p.raw || !p.f) return null;
  const pts = Array.isArray(p.raw.points) ? p.raw.points.slice(0, 400) : [];
  const f = p.f;
  return {
    v: 1,
    id: String(p.id || '').replace(/[^\w-]/g, '').slice(0, 40) || Math.random().toString(36).slice(2),
    code: String(p.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6),
    t: Date.now(),
    seed: Math.floor(clamp(p.seed, 0, 2 ** 31)),
    raw: {
      points: pts.map((q) => [clamp(q[0], -2, 4), clamp(q[1], -2, 4), Math.round(clamp(q[2], 0, 120000))]),
      taps: (Array.isArray(p.raw.taps) ? p.raw.taps.slice(0, 20) : [0]).map((v) => Math.round(clamp(v, 0, 120000))),
      duration: Math.round(clamp(p.raw.duration, 0, 120000)),
    },
    f: {
      energy: clamp(f.energy, 0, 1), duration: clamp(f.duration, 0, 1), length: clamp(f.length, 0, 1),
      rhythm: Math.round(clamp(f.rhythm, 1, 7)), direction: clamp(f.direction, -10, 10), curvature: clamp(f.curvature, -1, 1),
      profile: (Array.isArray(f.profile) ? f.profile.slice(0, 40) : []).map((v) => clamp(v, -1, 1)),
      accent: ['pulso', 'vinculo', 'impacto'].includes(f.accent) ? f.accent : 'pulso',
    },
  };
}

/* ---------- pantallas conectadas (SSE) ---------- */
const screens = new Set();
function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of screens) res.write(msg);
}
setInterval(() => { for (const res of screens) res.write(': latido\n\n'); }, 25000);   // mantiene viva la conexión

const lastByIp = new Map();
function readBody(req, limit, cb) {
  let size = 0, chunks = [];
  req.on('data', (c) => { size += c.length; if (size > limit) { req.destroy(); return; } chunks.push(c); });
  req.on('end', () => cb(Buffer.concat(chunks).toString('utf8')));
}
const json = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };

http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);

  // un celular suma su pulso
  if (p === '/api/pulse' && req.method === 'POST') {
    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    const now = Date.now();
    if (now - (lastByIp.get(ip) || 0) < MIN_GAP_MS) return json(res, 429, { ok: false, error: 'Esperá unos segundos' });
    return readBody(req, 64 * 1024, (body) => {
      let pulse;
      try { pulse = clean(JSON.parse(body)); } catch (_) { pulse = null; }
      if (!pulse) return json(res, 400, { ok: false, error: 'Pulso no válido' });
      lastByIp.set(ip, now);
      pulses.push(pulse);
      if (pulses.length > MAX_STORED) pulses = pulses.slice(-MAX_STORED);
      save();
      broadcast('pulse', pulse);
      json(res, 200, { ok: true, count: pulses.length, screens: screens.size });
    });
  }

  // una pantalla colectiva se conecta y queda escuchando
  if (p === '/api/stream') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write(`retry: 3000\nevent: init\ndata: ${JSON.stringify(pulses.slice(-INIT_SEND))}\n\n`);
    screens.add(res);
    req.on('close', () => screens.delete(res));
    return;
  }

  if (p === '/api/count') return json(res, 200, { count: pulses.length, screens: screens.size });

  // /info: dirección de red local, para que el QR de la pantalla funcione desde los celulares
  if (p === '/info') {
    const ip = lanIPs()[0];
    return json(res, 200, { pulsoUrl: ip ? `http://${ip}:${PORT}/pulso/` : null });
  }
  // /export?name=archivo.png: la página /exportar guarda imágenes y videos en exports/ (solo en la propia compu)
  if (p === '/export' && req.method === 'POST') {
    const name = new URL(req.url, 'http://x').searchParams.get('name') || '';
    const local = /^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/.test(req.socket.remoteAddress) && !req.headers['x-forwarded-for'];
    if (!local || !/^[\w.-]+\.(png|mp4|webm)$/.test(name)) { res.writeHead(400); return res.end('nombre no válido'); }
    const dir = path.join(ROOT, 'exports');
    fs.mkdirSync(dir, { recursive: true });
    const out = fs.createWriteStream(path.join(dir, name));
    req.pipe(out);
    out.on('finish', () => { res.writeHead(200); res.end('ok'); });
    out.on('error', () => { res.writeHead(500); res.end('error'); });
    return;
  }

  // archivos estáticos (sin exponer datos ni configuración)
  if (p === '/pulso' || p === '/colectivo') { res.writeHead(301, { Location: p + '/' }); return res.end(); }
  if (/^\/(data|\.git|\.claude|node_modules)(\/|$)/.test(p) || p === '/server.js') { res.writeHead(404); return res.end('No encontrado'); }
  if (p.endsWith('/')) p += 'index.html';
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('No encontrado'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}).listen(PORT, () => {
  const ips = lanIPs();
  console.log(`\nBioferia · organismo vivo  (${pulses.length} pulsos guardados)\n  Colectivo: http://localhost:${PORT}/colectivo/\n  Pulso:     http://localhost:${PORT}/pulso/`);
  ips.forEach((ip) => console.log(`  En la red: http://${ip}:${PORT}/pulso/`));
  console.log('');
});
