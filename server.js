// Servidor estático mínimo, sin dependencias:  node server.js
// Muestra también la IP local para abrir /pulso desde un celular en la misma red.
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = process.env.PORT || 5173;
const ROOT = __dirname;
const lanIPs = () => Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
                '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.md': 'text/plain; charset=utf-8' };

http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  // /info: dirección de red local, para que el QR de la pantalla funcione desde los celulares
  if (p === '/info') {
    const ip = lanIPs()[0];
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
    return res.end(JSON.stringify({ pulsoUrl: ip ? `http://${ip}:${PORT}/pulso/` : null }));
  }
  // /export?name=archivo.png: la página /exportar guarda imágenes y videos en la carpeta exports/
  if (p === '/export' && req.method === 'POST') {
    const name = new URL(req.url, 'http://x').searchParams.get('name') || '';
    const local = /^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/.test(req.socket.remoteAddress);
    if (!local || !/^[\w.-]+\.(png|mp4|webm)$/.test(name)) { res.writeHead(400); return res.end('nombre no válido'); }
    const dir = path.join(ROOT, 'exports');
    fs.mkdirSync(dir, { recursive: true });
    const out = fs.createWriteStream(path.join(dir, name));
    req.pipe(out);
    out.on('finish', () => { res.writeHead(200); res.end('ok'); });
    out.on('error', () => { res.writeHead(500); res.end('error'); });
    return;
  }
  if (p === '/pulso' || p === '/colectivo') { res.writeHead(301, { Location: p + '/' }); return res.end(); }
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
  console.log(`\nBioferia · organismo vivo\n  Colectivo: http://localhost:${PORT}/colectivo/\n  Pulso:     http://localhost:${PORT}/pulso/`);
  ips.forEach((ip) => console.log(`  En la red: http://${ip}:${PORT}/pulso/`));
  console.log('');
});
