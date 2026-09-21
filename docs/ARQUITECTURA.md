# Arquitectura

## Flujo general

```
  PDF de entrada
        │
        ├─► pdf.js ──► <canvas>  (pintado fiel, solo lectura)
        │
        └─► bytes originales intactos
                  │
   estado (Zustand): páginas + anotaciones
                  │
                  ├─► capa <svg> encima del canvas  (edición)
                  │
                  └─► pdf-lib ──► PDF de salida
```

El documento original **nunca se modifica en memoria**. El estado es una lista de
páginas (qué página de qué archivo, con qué giro y qué recorte) y una lista de
anotaciones. Exportar es reproducir esa receta con pdf-lib.

Esto tiene una consecuencia práctica: deshacer es gratis, reordenar no copia
nada, y duplicar una página cuesta un objeto de 8 campos.

## Modelo de datos (`src/types.ts`)

```ts
PageItem  { srcId, srcIndex, rotation, crop, baseX/Y/W/H, baseRotation }
Annotation = TextAnn | ShapeAnn | LineAnn | DrawAnn | ImageAnn
```

- `base*` describe la caja visible de la página original en espacio de usuario PDF.
- `rotation` es el giro **añadido por el usuario**, aparte del `/Rotate` que ya
  traía el archivo (`baseRotation`).
- `crop` se guarda **sin rotar**, para que girar la página después no desplace la
  ventana de recorte.
- El orden del array `pages` *es* el orden del documento; el orden del array
  `annotations` *es* el orden de apilado (z-index).

## El sistema de coordenadas

Es la parte con más aristas del proyecto, así que está aislada en
`src/lib/geometry.ts` y cubierta por pruebas.

Conviven tres espacios:

| Espacio | Origen | Eje Y | Dónde se usa |
|---|---|---|---|
| **Display** | esquina superior izquierda de la página *tal como se ve* (ya girada y recortada) | hacia abajo | Estado, SVG, ratón |
| **Base** | esquina superior izquierda de la página *sin girar* | hacia abajo | Recortes |
| **Usuario PDF** | esquina inferior izquierda del `MediaBox` | hacia arriba | pdf-lib |

Todas las anotaciones se guardan en **espacio display**, que es lo que el usuario
manipula directamente. `displayToUser()` deshace el giro, aplica el desplazamiento
del recorte y voltea el eje Y:

```
display (x,y)  ──deshacer giro──►  local del recorte  ──+offset──►  base  ──voltear Y──►  usuario PDF
```

### El giro, en concreto

Para un giro horario de `r` grados sobre una caja de `cw × ch`:

| `r` | display → local |
|---|---|
| 0 | `lx = dx`, `ly = dy` |
| 90 | `lx = dy`, `ly = ch − dx` |
| 180 | `lx = cw − dx`, `ly = ch − dy` |
| 270 | `lx = cw − dy`, `ly = dx` |

### Dibujar sobre una página girada

`page.setRotation(r)` hace que el visor gire la página al mostrarla, pero
pdf-lib dibuja en el espacio de usuario **sin girar**. Para que el contenido
salga derecho hay que contrarrestarlo girándolo `r` grados en sentido antihorario
(`rotate: degrees(r)`, que en pdf-lib es antihorario) y anclarlo en el punto
correcto:

| Primitiva | Ancla en espacio display |
|---|---|
| Rectángulo, imagen | esquina **inferior izquierda** de la caja |
| Elipse | **centro** de la caja |
| Texto | inicio de la **línea base** de cada línea |
| Línea, flecha, tinta | cada extremo por separado (sin `rotate`) |

`scripts/export-smoke.ts` comprueba que el mapeo es una isometría en los cuatro
giros: si un cambio rompe la geometría, la distancia entre dos puntos deja de
conservarse y la prueba falla.

## Pintado (`src/lib/pdfjs.ts`)

Cada página se pinta con `page.getViewport({ scale, rotation })` y, cuando hay
recorte, con un `transform` que desplaza la página completa para que la ventana
de recorte caiga en el origen del canvas. El canvas se dimensiona en píxeles
reales (`devicePixelRatio`, tope ×2) y en puntos CSS por separado, para que el
texto se vea nítido en pantallas HiDPI.

`renderPage()` devuelve un manejador con `cancel()`: pdf.js se niega a pintar el
mismo canvas dos veces a la vez, así que cada re-render cancela el anterior.

## Exportación (`src/lib/export.ts`)

1. Se cargan con pdf-lib los archivos de origen necesarios.
2. Se copian las páginas **por lotes de aparición**. Esto importa: el copiador de
   pdf-lib deduplica dentro de una misma llamada, así que una página duplicada
   copiada en la misma llamada devolvería *el mismo objeto* y girar una afectaría
   a la otra. Cada repetición va en una llamada distinta.
3. Se aplica `setRotation` y, si procede, `setCropBox`.
4. Se dibuja cada anotación con el anclaje y el giro de la tabla de arriba.
5. Fuentes e imágenes se embeben una sola vez y se cachean por documento.

## Estado e historial (`src/store.ts`)

El historial guarda instantáneas de `{ pages, annotations }` —dos arrays de
objetos inmutables, así que una instantánea son dos punteros—. Se limita a 50
pasos.

Las operaciones discretas (girar, borrar, duplicar, añadir anotación) llaman a
`pushHistory()` ellas mismas. Los arrastres lo llaman **una vez** en el
`pointerdown`, de modo que mover un objeto 300 píxeles es un solo paso de
deshacer y no 300.

## Interacción (`src/components/PageView.tsx`)

Un único `dragRef` describe el gesto en curso (`create`, `ink`, `move`, `resize`,
`crop`). Los eventos de puntero se capturan en el SVG con `setPointerCapture`,
así que el gesto sigue funcionando aunque el cursor salga de la página.

Las anotaciones en curso se pintan como *borrador* y solo entran en el estado (y
en el historial) al soltar, y únicamente si superan un umbral mínimo de tamaño:
así un clic accidental no deja un rectángulo de cero píxeles en el documento.

## Notas de interacción

Dos comportamientos del navegador que costaron un error cada uno y conviene no
volver a tropezar con ellos.

### El enfoque del `<textarea>` de texto

React procesa `pointerdown` como evento *discreto* y vacía la cola de renderizado
de forma síncrona dentro del propio despacho. Al crear un cuadro de texto, eso
significa que el `<textarea>` se monta y se enfoca **antes** de que el navegador
aplique su acción por defecto del `mousedown`, que mueve el foco al elemento
pulsado. Resultado: el `<textarea>` se desenfocaba al instante, disparaba su
`onBlur` y el editor se cerraba sin dejar escribir una sola letra.

La solución tiene dos partes, y hacen falta las dos:

- `e.preventDefault()` en el `pointerdown` que crea el cuadro, que cancela el
  desplazamiento de foco por defecto;
- enfocar dentro de un `requestAnimationFrame`, un fotograma después, para no
  competir con el trabajo de foco del navegador.

Un cuadro que se cierra sin contenido se descarta, para no sembrar el documento
de cajas de texto invisibles.

### La página activa

`activePageId` determina dónde aterrizan las inserciones (imagen, firma, página
en blanco). Si solo cambiara al pulsar una miniatura, desplazarse hasta la página
5 e insertar una imagen la colocaría en la página 1, fuera de la vista: parecería
que el botón no hace nada.

Un `IntersectionObserver` sobre el contenedor del lienzo mantiene como activa la
página **más visible**, y tras insertar algo la vista se desplaza hasta ella para
confirmar visualmente lo ocurrido.
