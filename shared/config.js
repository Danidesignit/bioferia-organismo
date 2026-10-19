/* =========================================================================
   BIOFERIA 2027 · Organismo vivo  (v2 · mapa térmico)
   El organismo no dibuja colores: dibuja CALOR. Un shader convierte ese
   calor con los mapas de gradiente de la marca (HEATMAPS), agrega
   contornos, glow, grano y aberración. Todo se ajusta acá o con la tecla G.
   ========================================================================= */

// Cada subsistema elige un mapa térmico (0 = pulso, 0.5 = vínculo, 1 = impacto).
// Los aportes mezclan mapas: el color del colectivo es la suma de todos.
const SUBSISTEMAS = {
  pulso:   { shift: 0.0 },
  vinculo: { shift: 0.5 },
  impacto: { shift: 1.0 },
};

// Mapas de gradiente: [posición 0..1 (calor), color]. Editables como en Photoshop.
const HEATMAPS = {
  noche: {
    ui: 'oscuro',
    pulso:   [[0, '#000000'], [0.08, '#04031f'], [0.22, '#1f1fe0'], [0.4, '#6b2cff'], [0.58, '#e23bd6'], [0.78, '#ffa6ea'], [1, '#ffffff']],
    vinculo: [[0, '#000000'], [0.08, '#020822'], [0.22, '#1b2cf0'], [0.42, '#1f8fff'], [0.6, '#3fe6ff'], [0.8, '#cffcff'], [1, '#ffffff']],
    impacto: [[0, '#000000'], [0.08, '#030a22'], [0.22, '#2323ff'], [0.4, '#0f9a48'], [0.58, '#6fe02a'], [0.78, '#fff23a'], [1, '#ffffff']],
    contourA: '#d8ff3a',   // isolíneas lima
    contourB: '#ff4fd8',   // isolíneas rosa
  },
  dia: {
    ui: 'claro',
    pulso:   [[0, '#f6f6f2'], [0.1, '#e3e5ff'], [0.28, '#7d86ff'], [0.46, '#2b2bff'], [0.64, '#7a2cf0'], [0.82, '#ff4fd8'], [1, '#1a0b40']],
    vinculo: [[0, '#f6f6f2'], [0.1, '#e1f1ff'], [0.28, '#6fb6ff'], [0.46, '#2b2bff'], [0.64, '#1aa0e8'], [0.82, '#14d1c8'], [1, '#04103a']],
    impacto: [[0, '#f6f6f2'], [0.1, '#e9f6df'], [0.28, '#7d86ff'], [0.46, '#2b2bff'], [0.64, '#0f9a48'], [0.82, '#c8f02a'], [1, '#101a05']],
    contourA: '#b8e600',
    contourB: '#ff3fc8',
  },
};

const CONFIG_DEFAULTS = {
  theme: 'noche',
  pulsoUrl: '',           // URL pública de /pulso para el QR (vacío = la IP local que informa server.js)
  pixelDensity: 1,
  heatScale: 0.5,         // resolución del buffer de calor (0.5 = mitad de pantalla)

  // Organismo (estructura)
  speed: 1,
  drift: 0.6,
  breathing: 1,
  repulsion: 1,
  stemSegment: 92,
  maxSegments: 12,
  maxStems: 14,
  branchChance: 0.18,
  maxZooids: 120,         // trazos visibles a la vez (los más viejos se disuelven)

  // Corrientes (tallos · VÍNCULO)
  stemFibers: 12,
  stemWidth: 9,
  stemHeat: 1,
  stemFlow: 1,            // ondulación de las fibras dentro de la corriente

  // Trazos (cada pulso)
  ribbonLength: 1,
  ribbonWidth: 1,
  ribbonFibers: 9,        // manchas de calor por pulso
  lines: 0.25,            // filamentos (0 = solo partículas difusas)
  ribbonHeat: 1,
  ribbonWave: 1,
  merge: 1,               // cuánto se integran con la corriente común con el tiempo
  beats: 1,               // latidos de luz que recorren cada trazo
  detailCount: 60,

  // Conexiones
  links: 2,
  linkReach: 300,
  linkHeat: 1,

  // IMPACTO
  waveSpeed: 340,
  waveAmp: 1,
  waveDecay: 2.6,
  waveWidth: 90,
  burst: 1,

  // COLECTIVO
  nucleus: 1,

  // Mapa térmico (shader)
  exposure: 1.25,
  glow: 0.6,
  glowBlur: 6,
  contours: 0.75,
  bands: 6,
  grain: 0.12,
  trail: 0.72,            // estela / quemado (0 = sin estela)
  aberration: 1,

  // Simulación
  autoSimulate: true,
  autoInterval: 6,
  initialPulses: 7,
  persist: true,
};

const CONFIG = Object.assign({}, CONFIG_DEFAULTS);

const CONFIG_UI = [
  { group: 'Mapa térmico', open: true, items: [
    ['exposure', 'Exposición', 0.3, 4, 0.01],
    ['glow', 'Glow', 0, 2.5, 0.01],
    ['glowBlur', 'Difusión glow', 0, 20, 0.5],
    ['contours', 'Contornos', 0, 1, 0.01],
    ['bands', 'Bandas', 1, 16, 1],
    ['grain', 'Grano', 0, 0.5, 0.005],
    ['trail', 'Estela / quemado', 0, 0.97, 0.01],
    ['aberration', 'Aberración', 0, 4, 0.01],
  ]},
  { group: 'Partículas · Pulso', items: [
    ['ribbonLength', 'Dispersión', 0.2, 3, 0.01],
    ['ribbonWidth', 'Tamaño', 0.2, 4, 0.01],
    ['ribbonFibers', 'Partículas', 1, 30, 1],
    ['lines', 'Filamentos', 0, 1.5, 0.01],
    ['ribbonHeat', 'Calor', 0, 3, 0.01],
    ['ribbonWave', 'Ondulación', 0, 3, 0.01],
    ['merge', 'Integración', 0, 2, 0.01],
    ['beats', 'Latidos', 0, 2, 0.01],
    ['detailCount', 'Trazos con detalle', 5, 300, 1],
  ]},
  { group: 'Corrientes · Vínculo', items: [
    ['stemFibers', 'Fibras', 1, 30, 1],
    ['stemWidth', 'Ancho', 1, 40, 0.5],
    ['stemHeat', 'Calor', 0, 3, 0.01],
    ['stemFlow', 'Flujo', 0, 3, 0.01],
    ['links', 'Hilos por trazo', 0, 5, 1],
    ['linkReach', 'Alcance hilos', 50, 800, 1],
    ['linkHeat', 'Calor hilos', 0, 3, 0.01],
  ]},
  { group: 'Impacto', items: [
    ['waveSpeed', 'Velocidad onda', 50, 900, 1],
    ['waveAmp', 'Fuerza', 0, 4, 0.01],
    ['waveDecay', 'Duración', 0.5, 8, 0.1],
    ['waveWidth', 'Ancho', 20, 300, 1],
    ['burst', 'Destello', 0, 3, 0.01],
  ]},
  { group: 'Organismo · Colectivo', items: [
    ['nucleus', 'Núcleo', 0, 3, 0.01],
    ['speed', 'Velocidad', 0, 3, 0.01],
    ['drift', 'Corriente / deriva', 0, 2, 0.01],
    ['breathing', 'Respiración', 0, 3, 0.01],
    ['repulsion', 'Separación', 0, 3, 0.01],
    ['stemSegment', 'Largo de segmento', 12, 120, 1],
    ['maxSegments', 'Segmentos por corriente', 4, 24, 1],
    ['maxStems', 'Ramas máximas', 1, 24, 1],
    ['branchChance', 'Prob. de ramificar', 0, 1, 0.01],
    ['maxZooids', 'Trazos visibles', 10, 400, 1],
  ]},
  { group: 'Simulación', items: [
    ['autoInterval', 'Intervalo auto (s)', 1, 30, 0.5],
  ]},
];
