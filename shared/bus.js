/* =========================================================================
   PulseBus · transporte de pulsos entre /pulso y /colectivo
   - Envío: POST /api/pulse al servidor (server.js), que lo transmite en vivo.
   - Recepción: la pantalla escucha GET /api/stream (eventos del servidor).
     Al conectarse recibe el historial reciente (event: init).
   - Respaldo sin servidor (por ejemplo, sitio estático): BroadcastChannel entre
     pestañas del mismo navegador, como en el prototipo.
   ========================================================================= */
// Dirección del servidor en vivo. Si la página se abre desde otra copia publicada en Render
// (por ejemplo un sitio estático sin servidor), se redirige acá para que los pulsos lleguen.
const LIVE_HOST = 'bioferia-organismo.onrender.com';
if (/.onrender.com$/.test(location.hostname) && location.hostname !== LIVE_HOST) {
  location.replace('https://' + LIVE_HOST + location.pathname + location.search + location.hash);
}

const PulseBus = (() => {
  const NAME = 'bioferia-2027';
  const listeners = [], initListeners = [];
  const ch = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(NAME) : null;
  const emit = (p) => listeners.forEach((f) => f(p, { remote: true }));
  if (ch) ch.onmessage = (e) => { if (e.data && e.data.type === 'pulse') emit(e.data.pulse); };

  // gestos muy largos: se mandan 400 puntos repartidos en todo el trazo (alcanza para dibujarlo igual)
  function compact(p) {
    const pts = (p.raw && p.raw.points) || [];
    if (pts.length <= 400) return p;
    const step = (pts.length - 1) / 399;
    return { ...p, raw: { ...p.raw, points: Array.from({ length: 400 }, (_, i) => pts[Math.round(i * step)]) } };
  }

  let es = null;
  const state = { connected: false };

  function listen() {
    if (es || typeof EventSource === 'undefined' || location.protocol === 'file:') return;
    es = new EventSource('/api/stream');
    es.addEventListener('open', () => { state.connected = true; });
    es.addEventListener('error', () => { state.connected = false; });   // el navegador reintenta solo
    es.addEventListener('pulse', (e) => { try { emit(JSON.parse(e.data)); } catch (_) {} });
    es.addEventListener('init', (e) => {
      try { const list = JSON.parse(e.data); initListeners.forEach((f) => f(list)); } catch (_) {}
    });
  }

  return {
    state,
    // devuelve { ok, error }. Solo confirma cuando el servidor lo recibió de verdad.
    // Reintenta solo ante cortes de red (celular con señal floja, servidor gratis despertándose).
    // onWait(seg) avisa si tarda, para mostrarlo en pantalla.
    async send(pulse, onWait) {
      const body = JSON.stringify(compact(pulse));
      const started = Date.now();
      const tick = onWait ? setInterval(() => onWait(Math.round((Date.now() - started) / 1000)), 1000) : null;
      try {
        for (let attempt = 0; attempt < 4; attempt++) {
          let r;
          try {
            const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
            const to = ctl ? setTimeout(() => ctl.abort(), 60000) : null;
            r = await fetch('/api/pulse', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: ctl && ctl.signal });
            clearTimeout(to);
          } catch (_) {
            await new Promise((ok) => setTimeout(ok, 1500 * (attempt + 1)));
            continue;                                                   // corte de red: reintentar
          }
          if ((r.status === 404 || r.status === 405) && ch) {
            // página estática sin server.js (prototipo): respaldo local entre pestañas
            ch.postMessage({ type: 'pulse', pulse }); return { ok: true, local: true };
          }
          if (r.status >= 502 && r.status <= 504) { await new Promise((ok) => setTimeout(ok, 3000)); continue; }
          const data = await r.json().catch(() => null);
          if (!r.ok) return { ok: false, error: (data && data.error) || 'No se pudo enviar' };
          // solo es un envío real si respondió server.js (un sitio estático devuelve HTML con 200)
          if (!data || data.ok !== true) return { ok: false, error: 'Esta dirección no recibe pulsos' };
          return { ok: true, ...data };
        }
        return { ok: false, error: 'Sin conexión' };
      } finally { clearInterval(tick); }
    },
    onPulse(fn) { listeners.push(fn); listen(); },
    onInit(fn) { initListeners.push(fn); listen(); },
  };
})();
