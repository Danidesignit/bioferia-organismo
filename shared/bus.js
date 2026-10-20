/* =========================================================================
   PulseBus · transporte de pulsos entre /pulso y /colectivo
   - Envío: POST /api/pulse al servidor (server.js), que lo transmite en vivo.
   - Recepción: la pantalla escucha GET /api/stream (eventos del servidor).
     Al conectarse recibe el historial reciente (event: init).
   - Respaldo sin servidor (por ejemplo, sitio estático): BroadcastChannel entre
     pestañas del mismo navegador, como en el prototipo.
   ========================================================================= */
const PulseBus = (() => {
  const NAME = 'bioferia-2027';
  const listeners = [], initListeners = [];
  const ch = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(NAME) : null;
  const emit = (p) => listeners.forEach((f) => f(p, { remote: true }));
  if (ch) ch.onmessage = (e) => { if (e.data && e.data.type === 'pulse') emit(e.data.pulse); };

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
    // devuelve { ok, error } — ok:false si el servidor rechazó el pulso (ej.: demasiado seguido)
    async send(pulse) {
      try {
        const r = await fetch('/api/pulse', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pulse) });
        if (r.status === 404 || r.status === 405) throw new Error('sin servidor');
        const data = await r.json().catch(() => ({}));
        if (!r.ok) return { ok: false, error: data.error || 'No se pudo enviar' };
        return { ok: true, ...data };
      } catch (_) {
        // sin servidor: respaldo local entre pestañas
        if (ch) { ch.postMessage({ type: 'pulse', pulse }); return { ok: true, local: true }; }
        return { ok: false, error: 'Sin conexión' };
      }
    },
    onPulse(fn) { listeners.push(fn); listen(); },
    onInit(fn) { initListeners.push(fn); listen(); },
  };
})();
