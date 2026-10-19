/* =========================================================================
   PulseBus · transporte de pulsos entre /pulso y /colectivo
   Versión local: BroadcastChannel (pestañas del mismo navegador/equipo).
   Para la versión conectada se reemplaza SOLO este archivo por uno que use
   Supabase Realtime o Firebase con la misma interfaz: send() y onPulse().
   ========================================================================= */
const PulseBus = (() => {
  const NAME = 'bioferia-2027';
  const listeners = [];
  const ch = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(NAME) : null;

  const emit = (p) => listeners.forEach((f) => f(p, { remote: true }));

  if (ch) {
    ch.onmessage = (e) => { if (e.data && e.data.type === 'pulse') emit(e.data.pulse); };
  } else {
    window.addEventListener('storage', (e) => {
      if (e.key === NAME + ':last' && e.newValue) { try { emit(JSON.parse(e.newValue)); } catch (_) {} }
    });
  }

  return {
    mode: 'local',
    send(pulse) {
      if (ch) ch.postMessage({ type: 'pulse', pulse });
      else try { localStorage.setItem(NAME + ':last', JSON.stringify(pulse)); } catch (_) {}
      return Promise.resolve(true);
    },
    onPulse(fn) { listeners.push(fn); },
  };
})();
