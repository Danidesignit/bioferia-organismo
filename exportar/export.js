/* =========================================================================
   /exportar · genera imágenes PNG y videos MP4 en alta resolución.
   Renderiza cuadro por cuadro (no depende de la velocidad de la pantalla)
   y envía cada archivo a server.js, que lo guarda en la carpeta exports/.
   Solo funciona con `node server.js` corriendo en la propia computadora.

   Desde la consola del navegador:
     EXP.still('nombre.png', 2160, 3840, { theme: 'noche', sim: 70, every: 2.2 })
     EXP.video('nombre.mp4', 1080, 1920, { seconds: 20, fps: 30 })
   ========================================================================= */
const W = { w: 0, h: 0, S: 1 };
let org, renderer;

function setup() {
  pixelDensity(1);
  noiseDetail(3, 0.5);
  createCanvas(64, 64, WEBGL).parent('stage');
  W.w = 64; W.h = 64; W.S = 64 / 900;
  renderer = new HeatRenderer();
  noLoop();
}
function draw() {}

function applyTheme(name) {
  CONFIG.theme = HEATMAPS[name] ? name : 'noche';
  renderer.setTheme(CONFIG.theme);
}

const EXP = {
  status: 'listo',
  log: [],

  prepare(w, h, opts = {}) {
    Object.assign(CONFIG, CONFIG_DEFAULTS, opts.config || {});
    W.w = w; W.h = h; W.S = (Math.min(w, h) / 900) * (opts.scale || 1);   // scale > 1 = organismo más grande en el cuadro
    resizeCanvas(w, h);
    renderer.build();
    applyTheme(opts.theme || 'noche');
    org = new Organism();
  },

  // avanza la simulación; dibuja el calor solo cuando hace falta (estela)
  simulate(sec, every, drawLast = 1.5) {
    const steps = Math.round(sec * 60), drawFrom = steps - Math.round(drawLast * 60);
    let acc = every;
    for (let i = 0; i < steps; i++) {
      org.update(1 / 60);
      acc += 1 / 60;
      if (every && acc >= every) { acc = 0; org.addPulse(Pulse.simulate()); }
      if (i >= drawFrom) { renderer.begin(); org.draw(renderer.ctx); }
    }
  },

  frame() { renderer.finish(org); },

  async save(name, blob) {
    const r = await fetch('/export?name=' + encodeURIComponent(name), { method: 'POST', body: blob });
    if (!r.ok) throw new Error('No se pudo guardar ' + name);
    this.log.push(name);
  },

  async still(name, w, h, opts = {}) {
    this.status = 'imagen ' + name;
    this.prepare(w, h, opts);
    this.simulate(opts.sim || 70, opts.every != null ? opts.every : 2.2);
    this.frame();
    const blob = await new Promise((res) => drawingContext.canvas.toBlob(res, 'image/png'));
    await this.save(name, blob);
    this.status = 'listo';
    return name;
  },

  // video H.264 con WebCodecs + mp4-muxer (codificación cuadro a cuadro)
  async video(name, w, h, opts = {}) {
    const fps = opts.fps || 30, seconds = opts.seconds || 20, total = fps * seconds;
    const sub = Math.round(60 / fps);   // pasos de simulación por cuadro
    this.status = 'video ' + name + ' 0%';
    const { Muxer, ArrayBufferTarget } = await import('https://cdn.jsdelivr.net/npm/mp4-muxer@5.1.3/+esm');
    this.prepare(w, h, opts);
    this.simulate(opts.warm || 25, opts.every || 2.2);

    const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: 'avc', width: w, height: h }, fastStart: 'in-memory' });
    let encErr = null;
    const encoder = new VideoEncoder({ output: (c, m) => muxer.addVideoChunk(c, m), error: (e) => (encErr = e) });
    const config = { codec: w * h > 2073600 ? 'avc1.640033' : 'avc1.640028', width: w, height: h,
                     bitrate: opts.bitrate || 24e6, framerate: fps };
    const sup = await VideoEncoder.isConfigSupported(config);
    if (!sup.supported) throw new Error('El navegador no puede codificar H.264 a ' + w + 'x' + h);
    encoder.configure(config);

    // copia 2D de cada cuadro: un VideoFrame tomado directo del canvas WebGL
    // repetiría el último cuadro presentado en pantalla
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const copy = canvas.getContext('2d');
    const gl = drawingContext.canvas, every = opts.every || 2.2;
    let acc = 0;
    for (let f = 0; f < total; f++) {
      for (let s = 0; s < sub; s++) {
        org.update(1 / 60);
        acc += 1 / 60;
        if (acc >= every) { acc = 0; org.addPulse(Pulse.simulate()); }
        renderer.begin();
        org.draw(renderer.ctx);
      }
      this.frame();
      copy.drawImage(gl, 0, 0);
      const vf = new VideoFrame(canvas, { timestamp: Math.round((f * 1e6) / fps), duration: Math.round(1e6 / fps) });
      encoder.encode(vf, { keyFrame: f % (fps * 2) === 0 });
      vf.close();
      if (encErr) throw encErr;
      if (encoder.encodeQueueSize > 8) await new Promise((r) => setTimeout(r, 0));
      if (f % 15 === 0) { this.status = `video ${name} ${Math.round((f / total) * 100)}%`; await new Promise((r) => setTimeout(r, 0)); }
    }
    await encoder.flush();
    muxer.finalize();
    await this.save(name, new Blob([muxer.target.buffer], { type: 'video/mp4' }));
    this.status = 'listo';
    return name;
  },

  // corre una lista de trabajos sin bloquear (se consulta EXP.status)
  run(jobs) {
    this.status = 'trabajando';
    (async () => {
      try {
        for (const j of jobs) await this[j.type](j.name, j.w, j.h, j.opts || {});
        this.status = 'terminado';
      } catch (e) { this.status = 'error: ' + e.message; }
    })();
    return jobs.length + ' trabajos en cola';
  },
};
