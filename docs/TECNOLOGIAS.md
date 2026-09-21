# Decisiones técnicas

## Resumen

| Capa | Elección | Por qué |
|---|---|---|
| Build | **Vite 8** | Arranque en milisegundos, HMR real, bundle ESM sin configuración |
| UI | **React 19 + TypeScript** | El editor es puro estado derivado; el tipado evita errores de geometría |
| Estado | **Zustand 5** | Store plano, sin providers ni boilerplate; el historial es una lista de snapshots |
| Lectura/pintado | **pdf.js (`pdfjs-dist` 6)** | El motor de Mozilla: el mismo que usa Firefox. Nada se le acerca en fidelidad |
| Escritura | **pdf-lib 1.17** | JS puro, sin WASM: copia páginas, rota, recorta, dibuja y embebe fuentes e imágenes |
| Fuentes | **`@pdf-lib/fontkit`** | Preparado para embeber TTF propias (fase 5) |
| Estilos | **CSS plano con variables** | Sin cadena de build extra; tema claro/oscuro en 20 líneas |
| Contenedor | **Docker multi-stage** | `dev` con Vite, `prod` con nginx: la misma imagen sirve para ambos |

## La decisión de fondo: todo en el cliente

Un PDF es un documento privado —contratos, nóminas, informes médicos—. Un editor
que lo sube a un servidor obliga a resolver cifrado en tránsito, retención,
borrado, cumplimiento legal y coste de cómputo.

Procesarlo en el navegador elimina el problema entero: el archivo nunca sale del
equipo. Además abre la puerta a funcionar sin conexión y a desplegarse como
estático (nginx, S3, GitHub Pages) con coste operativo cero.

El precio es que todo se limita a lo que `pdf-lib` sabe escribir. Es suficiente
para el 95 % de lo que pide un editor de PDF; lo que falta (OCR, compresión
agresiva) está documentado como fase opcional con backend.

## pdf.js para leer, pdf-lib para escribir

No son alternativas: son complementarias y cada una hace lo que la otra no.

- **pdf.js** rasteriza con altísima fidelidad, pero *no* modifica documentos.
- **pdf-lib** construye y modifica documentos, pero *no* sabe rasterizar.

La combinación es el patrón estándar de los editores web. El único cuidado
importante: `pdf.js` **se queda con el `ArrayBuffer`** que recibe (lo transfiere
al worker y lo deja *detached*). Por eso en `lib/pdfjs.ts` se le pasa siempre un
clon y los bytes originales se guardan intactos para `pdf-lib`.

## Alternativas evaluadas

| Opción | Veredicto |
|---|---|
| **Apryse / Nutrient (PSPDFKit)** | Los mejores SDK del mercado y con edición de texto real, pero son comerciales y con licencia por asiento o por dominio. Desproporcionado salvo producto de pago |
| **MuPDF.js / PDFium vía WASM** | Muchísima potencia (incluye edición de texto y re-flow), pero 5–15 MB de WASM, API de bajo nivel y compilación propia. Es el camino natural *si* se quiere editar el texto original |
| **Fabric.js / Konva** para la capa de dibujo | Traen su propio canvas y su propio modelo de objetos, que habría que sincronizar con el del PDF. Una capa `<svg>` con coordenadas en puntos PDF hace lo mismo con menos piezas y el hit-testing lo resuelve el navegador |
| **`react-pdf`** | Envoltorio cómodo de pdf.js para *visores*, pero aquí hace falta control fino del viewport (rotación + recorte + `transform`), así que se usa pdf.js directamente |
| **Redux Toolkit** | Correcto, pero el historial de deshacer aquí son snapshots de dos arrays; Zustand lo resuelve sin reducers ni acciones tipadas |
| **Tailwind** | Perfectamente válido; se descartó para no añadir un paso de build a una UI de un solo tema y ~350 líneas de CSS |
| **`perfect-freehand`** para la tinta | Da trazos con presión preciosos, pero genera polígonos de contorno que habría que convertir a trayectorias PDF. El suavizado Catmull-Rom propio exporta como líneas nativas y pesa cero |

## Por qué `<svg>` y no un segundo `<canvas>`

La capa de edición usa un `<svg>` con `viewBox="0 0 W H"`, donde `W`/`H` son las
dimensiones de la página **en puntos PDF**.

El efecto es que *todas* las coordenadas de la aplicación —las que se guardan en
el estado, las que dibuja el navegador y las que se envían a pdf-lib— son la
misma cifra. El zoom es un cambio de `width`/`height` del SVG y nada más: no hay
multiplicaciones por escala repartidas por el código, que es de donde salen los
errores de un píxel en este tipo de editores.

Además, el navegador da gratis el hit-testing, el foco, los eventos de puntero y
la accesibilidad de cada elemento.

## Fidelidad del texto

Las fuentes base-14 del PDF no existen como tales en el navegador, así que cada
una se empareja con una **métricamente compatible**:

| PDF | Navegador |
|---|---|
| Helvetica | Arial / Liberation Sans |
| Times | Times New Roman / Liberation Serif |
| Courier | Courier New / Liberation Mono |

Y, sobre todo, el cálculo de líneas y líneas base vive en **un único sitio**
(`lib/text.ts`): lo llaman tanto el previsualizador SVG como el exportador, cada
uno con su función de medida. Eso garantiza que el salto de línea y la posición
vertical sean idénticos en pantalla y en el PDF resultante.
