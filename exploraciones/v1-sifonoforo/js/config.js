/* =========================================================================
   BIOFERIA 2027 · Organismo vivo
   Configuración visual y de comportamiento.
   Todo lo que se puede ajustar está acá (y en el panel: tecla G).
   ========================================================================= */

// Paleta de identidad (ajustar a los valores exactos del manual de marca)
const PALETTE = {
  blanco:      '#F4F3EE',
  tinta:       '#1A1033',
  verde:       '#00A859',   // verde intenso
  lima:        '#B6F23A',   // verde lima
  verdeLuz:    '#2FD98A',   // verde luminoso
  violeta:     '#7B3FF2',
  azulVioleta: '#4B3FD8',
  rosa:        '#FF5FB4',   // acento PULSO
  magenta:     '#E0198A',
  cian:        '#27C9EE',   // acento VÍNCULO
  amarillo:    '#FFD43B',   // acento IMPACTO
};

// Cada subsistema define el color de acento de un aporte
const SUBSISTEMAS = {
  pulso:   { acento: 'rosa' },
  vinculo: { acento: 'cian' },
  impacto: { acento: 'amarillo' },
};

// Colores base posibles para el cuerpo de cada forma
const BASES = ['verde', 'violeta', 'azulVioleta', 'magenta', 'verdeLuz'];

const THEMES = {
  claro:  { name: 'claro',  bg: '#F4F3EE', fieldOp: 'source-over', heartOp: 'source-over', grainOp: 'multiply', ink: '#1A1033' },
  oscuro: { name: 'oscuro', bg: '#0B0920', fieldOp: 'screen',   heartOp: 'screen',   grainOp: 'screen',   ink: '#F4F3EE' },
};

const CONFIG_DEFAULTS = {
  theme: 'claro',
  pixelDensity: 1,        // 1 = mejor rendimiento en pantallas grandes

  // Organismo (estructura)
  speed: 1,               // velocidad global del tiempo
  drift: 0.6,             // fuerza de la corriente que mueve la colonia
  breathing: 1,           // amplitud de la respiración colectiva
  repulsion: 1,           // cuánto se separan las estructuras entre sí
  stemSegment: 64,        // largo de cada segmento del tallo (px a 900px de alto)
  maxSegments: 14,        // segmentos máximos por tallo
  maxStems: 14,           // ramas máximas
  branchChance: 0.18,     // probabilidad de abrir una rama nueva
  maxZooids: 150,         // aportes visibles a la vez (los más viejos se disuelven)

  // Tallo (VÍNCULO)
  strands: 4,             // hebras que se trenzan
  strandRadius: 7,
  twist: 0.11,            // torsión del trenzado
  twistSpeed: 0.6,
  peristalsis: 1,         // contracciones que recorren el tallo
  membrane: 0.55,         // opacidad de la membrana translúcida

  // Zooides (PULSO)
  bellSize: 1,
  tentacles: 5,
  tentacleLength: 1,
  tentacleWave: 1,
  current: 0.8,           // cuánto obedecen los tentáculos a la corriente común
  rings: 1,               // ondas rítmicas que emite cada forma
  detailCount: 60,        // cuántas formas recientes se dibujan con detalle completo

  // Conexiones
  links: 2,               // vínculos por forma
  linkReach: 280,
  linkTwist: 1,

  // IMPACTO
  waveSpeed: 320,
  waveAmp: 1,
  waveDecay: 2.6,
  waveWidth: 90,

  // Atmósfera
  fieldOpacity: 0.85,
  fieldSpread: 1,
  fieldScale: 0.14,       // resolución del campo de degradados (más bajo = más difuso y rápido)
  grain: 0.06,

  // Simulación
  autoSimulate: true,
  autoInterval: 6,        // segundos entre pulsos simulados
  initialPulses: 7,
  persist: true,          // recordar el organismo al recargar (localStorage)
};

const CONFIG = Object.assign({}, CONFIG_DEFAULTS);

// Definición del panel de parámetros: [clave, etiqueta, min, max, paso]
const CONFIG_UI = [
  { group: 'Organismo', open: true, items: [
    ['speed', 'Velocidad', 0, 3, 0.01],
    ['drift', 'Corriente / deriva', 0, 2, 0.01],
    ['breathing', 'Respiración', 0, 3, 0.01],
    ['repulsion', 'Separación', 0, 3, 0.01],
    ['stemSegment', 'Largo de segmento', 12, 70, 1],
    ['maxSegments', 'Segmentos por tallo', 4, 24, 1],
    ['maxStems', 'Ramas máximas', 1, 24, 1],
    ['branchChance', 'Prob. de ramificar', 0, 1, 0.01],
    ['maxZooids', 'Aportes visibles', 10, 400, 1],
  ]},
  { group: 'Tallo · Vínculo', items: [
    ['strands', 'Hebras', 1, 8, 1],
    ['strandRadius', 'Radio', 2, 24, 0.5],
    ['twist', 'Torsión', 0, 0.4, 0.005],
    ['twistSpeed', 'Vel. torsión', 0, 3, 0.01],
    ['peristalsis', 'Peristalsis', 0, 2, 0.01],
    ['membrane', 'Membrana', 0, 1, 0.01],
  ]},
  { group: 'Formas · Pulso', items: [
    ['bellSize', 'Tamaño', 0.3, 3, 0.01],
    ['tentacles', 'Tentáculos', 1, 10, 1],
    ['tentacleLength', 'Largo tentáculos', 0.2, 3, 0.01],
    ['tentacleWave', 'Ondulación', 0, 3, 0.01],
    ['current', 'Corriente común', 0, 2, 0.01],
    ['rings', 'Ondas de pulso', 0, 2, 0.01],
    ['detailCount', 'Formas con detalle', 5, 300, 1],
  ]},
  { group: 'Conexiones', items: [
    ['links', 'Vínculos por forma', 0, 5, 1],
    ['linkReach', 'Alcance', 50, 700, 1],
    ['linkTwist', 'Entrelazado', 0, 3, 0.01],
  ]},
  { group: 'Impacto', items: [
    ['waveSpeed', 'Velocidad de onda', 50, 900, 1],
    ['waveAmp', 'Fuerza', 0, 4, 0.01],
    ['waveDecay', 'Duración', 0.5, 8, 0.1],
    ['waveWidth', 'Ancho', 20, 300, 1],
  ]},
  { group: 'Atmósfera', items: [
    ['fieldOpacity', 'Degradados', 0, 1, 0.01],
    ['fieldSpread', 'Difusión', 0.3, 3, 0.01],
    ['grain', 'Grano', 0, 0.25, 0.005],
  ]},
  { group: 'Simulación', items: [
    ['autoInterval', 'Intervalo auto (s)', 1, 30, 0.5],
  ]},
];
