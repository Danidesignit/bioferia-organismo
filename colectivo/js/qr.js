/* QR hacia /pulso.
   Prioridad: CONFIG.pulsoUrl (URL pública) → IP local que informa server.js → misma dirección de esta página. */
const QR = {
  async render() {
    const el = document.getElementById('qrcode');
    if (!el || typeof qrcode === 'undefined') return;
    let url = CONFIG.pulsoUrl;
    // la IP local solo sirve corriendo en la propia computadora; publicado, se usa la dirección de la web
    const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
    if (!url && local) {
      try { url = (await (await fetch('/info', { cache: 'no-store' })).json()).pulsoUrl; } catch (_) {}
    }
    if (!url) url = new URL('../pulso/', location.href).href;
    const q = qrcode(0, 'M');
    q.addData(url);
    q.make();
    el.innerHTML = q.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
    el.title = url;
    el.dataset.url = url;
  },
};
