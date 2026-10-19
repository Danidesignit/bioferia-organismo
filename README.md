# Bioferia 2027 · Organismo vivo

Instalación generativa y participativa: *Lo individual transforma lo colectivo.*
Etapa 1 (v2 · mapa térmico): organismo colectivo en p5.js + shader WebGL, con pulsos simulados.
La primera exploración (sifonóforo, fondo claro) quedó en `exploraciones/v1-sifonoforo/`.

## Cómo ejecutarlo

Requiere Node (sin instalar nada más):

```bash
node server.js
```

- Colectivo (pantalla de la instalación): http://localhost:5173/colectivo/
- Pulso (web móvil, por ahora un botón de prueba): http://localhost:5173/pulso/
- La consola muestra también la IP local para abrir /pulso desde un celular en la misma red.

p5.js se carga desde cdnjs. Para usarlo sin internet en la feria, descargá `p5.min.js` (v1.9.4) a `lib/` y cambiá el `<script>` en `colectivo/index.html`.

## Controles (pantalla colectiva)

| Tecla / gesto | Acción |
|---|---|
| Espacio / N | Sumar un pulso simulado |
| Arrastrar o tocar | Dibujar un pulso a mano (varios toques seguidos = ritmo) |
| B | Ráfaga de 10 pulsos |
| A | Simulación automática sí/no |
| G | Panel de parámetros |
| T | Mapa noche / día |
| H | Ocultar textos (modo instalación) |
| F | Pantalla completa |
| S | Guardar PNG |
| Shift + R | Reiniciar el organismo |

Los parámetros del panel se guardan en el navegador. "Copiar parámetros" copia el JSON para pegarlo como nuevos valores por defecto en `shared/config.js`.

## Cómo funciona el render

El organismo no pinta colores: pinta **calor**. Cada fibra suma calor en un buffer (rojo = cuánto calor, verde = qué mapa). El buffer se desvanece un poco por frame (estela / quemado) y un shader lo convierte con los **mapas de gradiente de la marca** (`HEATMAPS` en `shared/config.js`, editables como un mapa de degradado de Photoshop), con glow, isolíneas lima/rosa, grano y aberración cromática. Hay tres mapas que se mezclan según el subsistema de cada aporte: pulso (violeta → rosa → blanco), vínculo (azul → cian → blanco) e impacto (azul → verde → lima → amarillo → blanco).

## Cómo se traduce el concepto

| Subsistema | En el organismo |
|---|---|
| **Pulso** | Cada aporte es un **trazo**: un haz de fibras con la forma literal del gesto del visitante. Largo = longitud y duración del gesto; ancho = energía; los toques se ven como latidos de luz que recorren el trazo. |
| **Vínculo** | Corrientes de fibras que crecen y se ramifican (las ramas comparten nodo y se tiran entre sí). Los trazos se acoplan a ellas, se peinan con la corriente común con el tiempo y tejen hilos finos hacia sus vecinos. |
| **Impacto** | Al acoplarse, un destello de calor y una onda que deforma la imagen (distorsión + aberración en el shader), empuja la estructura y despierta a los trazos que alcanza. |
| **Colectivo** | Un núcleo que se calienta con cada aporte; su mapa es la mezcla de todos los subsistemas. Al crecer, las corrientes engordan, se compactan y la colonia se mueve de forma más coherente. |

El mapa de cada pulso sale del gesto: muchos toques → Pulso, trazo largo y curvo → Vínculo, gesto rápido → Impacto.

## Estructura

```
index.html            portada con enlaces
server.js             servidor estático local
shared/
  config.js           HEATMAPS (mapas de marca) y CONFIG (todos los parámetros)
  utils.js            color, easing, azar con semilla, trazados
  pulse.js            formato de datos del pulso + derivación de rasgos + simulador
  bus.js              transporte de pulsos (hoy BroadcastChannel local)
colectivo/
  index.html, style.css
  js/render.js        buffer de calor + shader de mapa térmico
  js/trace.js         trazo individual (haz de fibras con la forma del gesto)
  js/organism.js      corrientes, física, hilos, ondas, núcleo
  js/gui.js           panel de parámetros
  js/sketch.js        p5: loop, entrada, persistencia, calidad adaptativa
pulso/index.html      stub de la web móvil (etapa 2)
exploraciones/        versiones anteriores para comparar
```

## Datos de un pulso

```json
{ "v": 1, "id": "...", "t": 1790000000000, "seed": 12345,
  "raw": { "points": [[0.31, 0.62, 0], [0.33, 0.6, 16]], "taps": [0, 420], "duration": 2100 },
  "f":   { "energy": 0.4, "duration": 0.35, "length": 0.7, "rhythm": 2,
           "direction": 0.8, "curvature": 0.2, "profile": [/* 32 valores -1..1 */], "accent": "vinculo" } }
```

`raw` alcanza para reconstruir el gesto; `f` se recalcula con `Pulse.derive(raw)`. No se guarda ningún dato personal.

## Próximas etapas

1. **/pulso táctil:** lienzo de interacción, vista previa en vivo de la forma (el mismo trazo y el mismo shader, a escala de celular), "Sumar al colectivo" y confirmación.
2. **Conexión real:** reemplazar `shared/bus.js` por Supabase Realtime o Firebase con la misma interfaz (`send`, `onPulse`); el colectivo no cambia.
3. **Refinamiento visual:** paleta exacta del manual, tipografía de marca, QR en pantalla, calibración en el proyector real.
