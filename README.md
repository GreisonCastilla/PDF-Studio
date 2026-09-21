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
| `npm run test:export` | Pruebas headless del exportador y de la geometría |

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

El texto se escribe directamente sobre la página (doble clic para reabrir un
cuadro existente) **o** desde el panel **Texto seleccionado**, abajo a la
izquierda, que muestra el contenido del cuadro activo y permite editarlo con
más sitio. Los dos editores están sincronizados en vivo.

### Páginas
Reordenar arrastrando las miniaturas · girar ±90°/180° · duplicar · eliminar ·
insertar página en blanco · añadir otro PDF (unir) · **Extraer** las páginas
seleccionadas a un PDF aparte (cortar/dividir).

La página activa sigue al desplazamiento: lo que insertes (imagen, firma, página
en blanco) va a la página que estás mirando, y la vista salta hasta ella.

### Otros atajos
`Ctrl+Z` deshacer · `Ctrl+Shift+Z` / `Ctrl+Y` rehacer · `Supr` borrar la selección ·
`Esc` deseleccionar · `Ctrl` + rueda para hacer zoom.

---

## Estructura

```
src/
  types.ts              Modelo de datos (páginas, anotaciones, recursos)
  store.ts              Estado global Zustand + historial deshacer/rehacer
  lib/
    geometry.ts         Conversión de coordenadas, rotación, recorte, suavizado
    text.ts             Métricas y maquetación de texto compartidas
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
