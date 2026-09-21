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

### Arrastrar objetos entre páginas

Cada anotación pertenece a una página y se pinta dentro del `<svg>` de esa página.
Al arrastrarla más allá del borde no se recortaba —el overlay tiene `overflow:
visible`— pero quedaba *debajo* de la página siguiente, porque esa página aparece
después en el documento y tiene fondo blanco opaco.

La solución es doble:

1. **Reasignación real de página.** Durante el arrastre se localiza, en
   coordenadas de viewport, sobre qué `.page-shell` está el cursor, y el objeto
   cambia de `pageId` con sus coordenadas recalculadas en el espacio display de la
   página de destino. Se compara con los rectángulos de las páginas en lugar de
   usar `elementFromPoint`, porque ese devolvería el propio objeto arrastrado —que
   pertenece al SVG de origen— y el traspaso nunca llegaría a ocurrir.
2. **Apilado.** Mientras dura el gesto, la página que contiene el objeto recibe un
   `z-index` alto, de modo que al cruzar el hueco entre dos páginas el objeto pasa
   por encima y no por debajo.

El desplazamiento se calcula siempre contra la anotación tal como estaba al
empezar el gesto, nunca contra la última posición, para que el arrastre no acumule
error de coma flotante.

## Transformaciones

`src/lib/transform.ts` concentra todo lo que mueve o cambia de tamaño un objeto,
y lo usan por igual el arrastre en el lienzo y las casillas numéricas del panel
derecho. Tener un solo sitio evita que las dos vías se desincronicen, y permite
probar la lógica sin navegador: `npm run test:transform`.

- `translate` y `setBox` arrastran consigo los puntos de la tinta, escalándolos
  con el marco. Sin eso, redimensionar una firma movería la caja pero no el trazo.
- `resize` distingue tiradores de lado —que cambian una sola dimensión— de
  tiradores de esquina, que respetan la proporción cuando el candado está puesto.
  Con el candado, manda el eje que más se ha desplazado, de forma que el objeto
  sigue al cursor en lugar de resistirse; y la esquina opuesta a la que se
  arrastra nunca se mueve.
- `normalizeBox` impide que un marco quede del revés. Arrastrar una esquina más
  allá del lado opuesto deja el ancho o el alto en negativo, y entonces el marco,
  los tiradores y el contenido dejan de coincidir sobre dónde está el objeto. Se
  aplica **después** de `setBox`, porque mientras el signo sigue siendo negativo
  es justo lo que hace que la tinta se refleje en lugar de encogerse. Las líneas
  se quedan fuera: ahí el signo es la dirección, no un tamaño.
- `naturalBox` define a dónde vuelve el botón de restablecer: el tamaño que el
  objeto tenía al insertarse, que el store sella en `addAnnotation` para que
  quede registrado venga de donde venga. El texto es la excepción —su altura
  sigue al contenido—, así que recupera el ancho inicial y reajusta la altura.

## Inserción

`src/lib/insert.ts` es la única puerta de entrada para poner algo en una página:
la usan el botón de imagen, la firma subida y el pegado desde el portapapeles.
Resuelve la página destino (la que se está mirando), calcula el tamaño inicial,
cambia a la herramienta de selección y desplaza la vista hasta el resultado.

## Tiradores de selección

Los tiradores y el contorno de selección se dibujan en el espacio de la página,
que está en puntos PDF, de modo que el zoom los agrandaría junto con todo lo
demás: a 400 % un tirador de 9 pt ocupa 36 px y tapa los objetos pequeños.

Se corrige por dos vías: el tamaño del tirador se divide por el zoom, para que
mida siempre lo mismo en pantalla; y los trazos usan `vector-effect:
non-scaling-stroke`, que los mantiene de un píxel sea cual sea la escala.

Cuando un lado mide menos de 30 px en pantalla, su tirador central no se dibuja:
no cabría sin solaparse con los de las esquinas, y un tirador que pisa a otro es
peor que uno que falta.

## El modo recorte

Recortar es el único modo con estado propio: además de la herramienta activa hay
una página señalada, `cropTarget`. Dos estados que describen la misma cosa se
desincronizan en cuanto uno se actualiza sin el otro, y eso es exactamente lo que
pasaba: `setTool` cambiaba de herramienta sin tocar `cropTarget`, así que la
página seguía en modo recorte por detrás de la herramienta recién elegida.

Ahora salir del recorte está centralizado: `setTool` limpia el objetivo cuando la
herramienta nueva no es la de recortar, aplicar o quitar un recorte devuelve a la
herramienta de selección, y borrar la página señalada libera el objetivo en lugar
de dejarlo apuntando a algo que ya no existe. La vista exige además las dos
condiciones a la vez (`cropTarget === item.id && tool === 'crop'`), de modo que
ningún estado intermedio puede pintar el modo recorte.

`scripts/store-smoke.ts` recorre estas transiciones sin navegador.

Los botones de confirmación se anclan a la esquina inferior derecha de la
selección. Antes colgaban del borde inferior de la página, que en un documento
alto queda fuera de la pantalla mientras trabajas en la parte de arriba. Cuando
la página termina justo debajo de la selección, los botones se meten dentro de
ella; y mientras no hay nada seleccionado, el aviso se fija al viewport, porque
todavía no existe nada en la página a lo que anclarlo.

## Qué responde al puntero

La zona sensible al clic de una anotación **no** es su caja delimitadora.

Una firma diagonal, una flecha o un rectángulo sin relleno ocupan una fracción
mínima del rectángulo que los contiene. Si ese rectángulo capturase el puntero,
cada objeto se convertiría en una lámina invisible sobre sus vecinos y se
tragaría las pulsaciones dirigidas a lo que hay debajo. Eso es justo lo que hace
que los objetos parezcan no responder cuando hay varios cerca.

Así que cada tipo se agarra por lo que realmente dibuja: las formas rellenas y
las imágenes por su superficie, las formas con solo contorno por ese contorno,
y las líneas y la tinta por un trazo transparente y ancho sobre su propia
trayectoria.

## Por qué el arrastre vive en `window`

Los gestos se conducen desde escuchadores en `window`, no desde el elemento que
capturó el puntero.

La captura se puede perder a mitad de gesto —lo habitual es que el navegador
arranque su propio arrastre nativo de una imagen, o una selección de texto—, y
cuando eso ocurre el elemento deja de recibir `pointermove` y el objeto se queda
congelado a medio camino. Los escuchadores de `window` siguen disparando en
cualquier caso. La captura se pide igualmente, porque ayuda en táctil, pero nada
depende de que sobreviva.

A la vez se ataca la causa: el `pointerdown` que inicia un arrastre llama a
`preventDefault()`, y la capa de edición desactiva la selección de texto y el
arrastre nativo de imágenes.

## Orden de apilado

El documento guarda una sola lista plana de anotaciones y su orden es el orden de
pintado. El panel de objetos la muestra al revés, que es como se lee cualquier
lista de capas: lo de arriba es lo que está delante.

Reordenar dentro de una página devuelve los elementos a los mismos huecos
globales que ya ocupaban, de modo que ninguna otra página se desplaza. La acción
rechaza una lista incompleta en lugar de perder objetos por el camino.
