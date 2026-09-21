# PDF Studio

Editor de PDF que funciona **entero en el navegador**. Ningún archivo sale del equipo:
no hay backend, no hay subidas, no hay cuentas.

Permite escribir texto, firmar, insertar imágenes, dibujar rectángulos, círculos,
líneas y flechas, resaltar, recortar páginas, girarlas, reordenarlas, duplicarlas,
borrarlas, unir varios PDF y extraer una selección de páginas a un archivo nuevo.

---

## Clonar

```bash
git clone https://github.com/GreisonCastilla/PDF-Studio.git
cd PDF-Studio
```

## Arranque rápido con Docker

```bash
docker compose up --build dev      # http://localhost:5173  (hot reload)
```

Versión optimizada servida por nginx:

```bash
docker compose --profile prod up --build -d prod   # http://localhost:8080
```

O con los atajos del `Makefile`: `make dev`, `make prod`, `make stop`, `make clean`.

> **WSL2:** si `docker` responde *“could not be found in this WSL 2 distro”*, abre
> Docker Desktop → *Settings → Resources → WSL Integration* y activa tu distro.
> Mientras tanto puedes usar el modo local (abajo).

### Sin Docker

```bash
npm install
npm run dev        # http://localhost:5173
```

---

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo con recarga en caliente |
| `npm run build` | Chequeo de tipos + bundle de producción en `dist/` |
| `npm run preview` | Sirve el bundle ya construido |
| `npm run typecheck` | Solo TypeScript |
| `npm test` | Todas las pruebas headless |
| `npm run test:export` | Pruebas del exportador y de la geometría |
| `npm run test:transform` | Pruebas del redimensionado y la relación de aspecto |
| `npm run test:store` | Pruebas del estado: modo recorte, deshacer, borrado |

---

## Funcionalidades

### Anotar
| Herramienta | Atajo | Notas |
|---|---|---|
| Seleccionar | `V` | Mover y redimensionar con los tiradores |
| Texto | `T` | Doble clic para editar; ajuste de línea automático |
| Rectángulo | `R` | `Shift` mantiene el cuadrado |
| Círculo / elipse | `O` | `Shift` mantiene el círculo |
| Línea | `L` | `Shift` la fuerza horizontal o vertical |
| Flecha | `A` | Punta calculada según el ángulo |
| Lápiz | `P` | Trazo vectorial suavizado (Catmull-Rom) |
| Resaltador | `H` | Se exporta con modo de fusión *Multiply* |
| Imagen | — | PNG, JPEG y cualquier otro formato (se reconvierte a PNG) |
| Firma | — | Pad vectorial, o imagen; guarda hasta 6 firmas reutilizables |
| Recortar | `C` | Ajusta el *CropBox* de la página |

Al recortar, los botones de confirmar aparecen pegados a la esquina inferior
derecha de la zona que has marcado, y se meten dentro de ella si la página se
acaba justo ahí. El botón de la barra superior funciona como interruptor: se
pulsa para entrar y para salir, igual que `Esc` o elegir cualquier otra
herramienta.

El texto se escribe directamente sobre la página (doble clic para reabrir un
cuadro existente) **o** desde el panel **Texto seleccionado**, arriba del todo en
la columna derecha, que muestra el contenido del cuadro activo y permite editarlo
con más sitio. Los dos editores están sincronizados en vivo.

Cualquier objeto —texto, imagen, firma, forma— se puede **arrastrar de una página
a otra**: se reasigna a la página sobre la que lo sueltes.

**Pegar desde el portapapeles** (`Ctrl+V`) funciona con imágenes y con texto: lo
que pegues aterriza en la página que estés mirando. Dentro de un campo de texto
el pegado es el normal del navegador.

### Tamaño y posición

Ocho tiradores: los **laterales** cambian solo el ancho o solo el alto; las
**esquinas** mantienen la proporción mientras el candado esté activo. `Shift`
invierte el candado mientras arrastras.

El panel **Tamaño y posición**, en la columna derecha, permite teclear las cifras
exactas en puntos, activar o desactivar el candado de proporción y
**restablecer** el objeto al tamaño que tenía al insertarlo. En un cuadro de
texto restablecer devuelve el ancho inicial y reajusta la altura al contenido,
para no cortar el texto.

Los tiradores conservan el mismo tamaño en pantalla a cualquier zoom, y los de
los lados desaparecen cuando el objeto es demasiado pequeño para que quepan sin
pisar a los de las esquinas.

### Páginas
Reordenar arrastrando las miniaturas · girar ±90°/180° · duplicar · eliminar ·
insertar página en blanco · añadir otro PDF (unir) · **Extraer** las páginas
seleccionadas a un PDF aparte (cortar/dividir).

La página activa sigue al desplazamiento: lo que insertes (imagen, firma, página
en blanco) va a la página que estás mirando, y la vista salta hasta ella.

### Otros atajos
`Ctrl+Z` deshacer · `Ctrl+Shift+Z` / `Ctrl+Y` rehacer · `Ctrl+V` pegar ·
`Supr` borrar la selección · `Esc` deseleccionar · `Ctrl` + rueda para hacer zoom ·
`Shift` invierte el candado de proporción al redimensionar.

---

## Estructura

```
src/
  types.ts              Modelo de datos (páginas, anotaciones, recursos)
  store.ts              Estado global Zustand + historial deshacer/rehacer
  lib/
    geometry.ts         Conversión de coordenadas, rotación, recorte, suavizado
    text.ts             Métricas y maquetación de texto compartidas
    transform.ts        Mover, redimensionar y tamaño natural de los objetos
    insert.ts           Inserción de imágenes y texto en la página activa
    pdfjs.ts            Carga y pintado de páginas con pdf.js
    export.ts           Generación del PDF final con pdf-lib
    images.ts           Importación y normalización de imágenes
  components/
    Toolbar.tsx         Barra superior: herramientas, páginas, zoom, exportar
    Thumbnails.tsx      Panel de páginas con reordenado por arrastre
    PageView.tsx        Lienzo + capa SVG de edición + recorte
    AnnotationNode.tsx  Pintado de cada tipo de anotación
    Inspector.tsx       Propiedades de la selección
    TextPanel.tsx       Contenido del cuadro de texto seleccionado
    SizePanel.tsx       Tamaño, posición y relación de aspecto
    SignaturePad.tsx    Captura de firma
docs/                   Plan, arquitectura y decisiones técnicas
scripts/                Pruebas headless
docker/                 Configuración de nginx para producción
```

---

## Documentación

- [`docs/PLAN.md`](docs/PLAN.md) — alcance, fases y estado
- [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md) — modelo de datos y sistema de coordenadas
- [`docs/TECNOLOGIAS.md`](docs/TECNOLOGIAS.md) — por qué cada pieza, y qué se descartó

## Limitaciones conocidas

- **No edita el texto original** del PDF: añade capas encima. Editar texto ya
  existente requiere reconstruir el flujo de contenido (ver fase 6 del plan).
- El texto usa las fuentes base-14 (Helvetica, Times, Courier) con codificación
  **WinAnsi**: cubre español y europeo occidental. Los caracteres fuera de ese
  rango se sustituyen o se descartan al exportar.
- El recorte ajusta el `CropBox`; el contenido fuera del recorte queda oculto,
  no destruido (comportamiento estándar de los editores de PDF).
- Sin OCR ni compresión: son tareas de servidor (ver plan, fase 7).
