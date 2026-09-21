# Plan de proyecto

## Objetivo

Un editor de PDF de uso general, que funcione en el navegador sin servidor, con
la ergonomía de una herramienta de escritorio: anotar, firmar, insertar
imágenes, dibujar formas y manipular páginas (orden, giro, recorte, división y
unión).

## Alcance

**Dentro:** capas de anotación sobre el PDF, manipulación de páginas, exportación
fiel, funcionamiento sin conexión, despliegue como estático.

**Fuera (por ahora):** edición del texto original del documento, OCR, formularios
AcroForm, firma criptográfica PAdES, colaboración en tiempo real.

---

## Fases

### Fase 1 — Cimientos ✅
Scaffolding Vite + React + TypeScript, Docker multi-stage (dev con HMR, prod con
nginx), carga de PDF por arrastre, pintado con pdf.js, zoom y ajuste al ancho.

### Fase 2 — Páginas ✅
Panel de miniaturas, reordenado por arrastre, giro ±90°/180°, duplicar, eliminar,
insertar página en blanco, unir varios PDF, extraer la selección a un archivo
nuevo, recorte por `CropBox`.

### Fase 3 — Anotación ✅
Capa SVG en coordenadas de punto PDF. Texto con ajuste de línea, rectángulo,
elipse, línea, flecha, lápiz vectorial, resaltador e imágenes. Selección, arrastre,
redimensionado, orden de apilado, bloqueo, opacidad.

### Fase 4 — Firma ✅
Pad vectorial con suavizado, control de color y grosor, firmas guardadas en
`localStorage` reutilizables, alternativa por imagen.

### Fase 5 — Exportación ✅
Generación con pdf-lib: copia de páginas (con duplicados correctos), giro,
recorte, fuentes base-14, imágenes PNG/JPEG, modo de fusión para el resaltado.
Pruebas headless de la geometría y del pipeline (`npm run test:export`).

---

## Siguientes pasos

Ordenados por relación valor/coste.

### Fase 6 — Calidad de vida
- Selección múltiple por marco y alineado/distribución de objetos.
- Guías de ajuste (*snapping*) a márgenes y a otros objetos.
- Copiar/pegar anotaciones entre páginas.
- Plantillas de sello ("APROBADO", fecha de hoy, número de página).
- Numeración automática de páginas y marca de agua en lote.
- Persistir la sesión en IndexedDB para sobrevivir a un refresco.

### Fase 7 — Fuentes propias
Embeber TTF/OTF con `@pdf-lib/fontkit`, ya instalado. Resuelve dos cosas a la vez:
tipografías de marca y los caracteres fuera de WinAnsi (griego, cirílico, CJK).
La misma fuente se carga con `@font-face` en el navegador, con lo que la
previsualización pasa de *métricamente compatible* a idéntica.

### Fase 8 — Formularios
Leer los `AcroForm` existentes con pdf-lib (`getForm()`), pintarlos como campos
editables sobre la página y rellenarlos o aplanarlos al exportar.

### Fase 9 — Editar el texto original
El salto grande. Requiere reconstruir el flujo de contenido del PDF, no basta con
pdf-lib. Camino realista: **MuPDF.js** o **PDFium** compilados a WASM para
localizar, borrar y reescribir los bloques de texto, manteniendo pdf.js para el
pintado. Conviene abordarla solo cuando el resto esté asentado.

### Fase 10 — Backend opcional
Para lo que no es razonable hacer en el cliente:
- **OCR** de documentos escaneados (OCRmyPDF / Tesseract).
- **Compresión** y linearización (Ghostscript, qpdf).
- **Firma digital** con certificado (PAdES).

Encajaría como un servicio aparte en el mismo `docker-compose.yml`, invocado solo
bajo petición explícita del usuario, dejando intacta la promesa de que por defecto
nada sale del equipo.

---

## Riesgos y cómo se han mitigado

| Riesgo | Mitigación |
|---|---|
| Errores de coordenadas al combinar giro y recorte | Espacios de coordenadas explícitos y documentados, aislados en `lib/geometry.ts`, con pruebas de isometría en los cuatro giros |
| Desajuste entre lo que se ve y lo que se exporta | Una sola función de maquetación de texto (`lib/text.ts`) para ambos, y fuentes web métricamente compatibles |
| Páginas duplicadas compartiendo objeto | Copia por lotes de aparición en `export.ts`, con prueba dedicada |
| `ArrayBuffer` vaciado por pdf.js | pdf.js recibe siempre un clon; los bytes originales quedan reservados para pdf-lib |
| PDF grandes agotando memoria | Pintado bajo demanda con cancelación; el estado no duplica el documento |
