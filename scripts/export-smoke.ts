/**
 * Headless check of the export pipeline: page copying (including duplicates),
 * rotation, crop boxes and the display->user coordinate mapping.
 *
 *   npm run test:export
 */
import { PDFDocument, degrees } from 'pdf-lib'
import { buildPdf } from '../src/lib/export'
import { displayToUser } from '../src/lib/geometry'
import type { Annotation, PageItem } from '../src/types'

const A4 = { w: 595.28, h: 841.89 }

function page(id: string, srcId: string, srcIndex: number, over: Partial<PageItem> = {}): PageItem {
  return {
    id, srcId, srcIndex, rotation: 0, crop: null,
    baseX: 0, baseY: 0, baseW: A4.w, baseH: A4.h, baseRotation: 0,
    ...over,
  }
}

let failures = 0
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}
const near = (a: number, b: number, tol = 0.01) => Math.abs(a - b) < tol

async function main() {
  // --- coordinate mapping -------------------------------------------------
  const flat = page('p', 's', 0)
  const topLeft = displayToUser(flat, { x: 0, y: 0 })
  check('rotation 0: display top-left maps to the user-space top-left',
    near(topLeft.x, 0) && near(topLeft.y, A4.h), `${topLeft.x}, ${topLeft.y}`)

  const r90 = page('p', 's', 0, { rotation: 90 })
  const c90 = displayToUser(r90, { x: 0, y: 0 })
  check('rotation 90: display top-left maps to the user-space bottom-left',
    near(c90.x, 0) && near(c90.y, 0), `${c90.x}, ${c90.y}`)

  const r180 = page('p', 's', 0, { rotation: 180 })
  const c180 = displayToUser(r180, { x: 0, y: 0 })
  check('rotation 180: display top-left maps to the user-space bottom-right',
    near(c180.x, A4.w) && near(c180.y, 0), `${c180.x}, ${c180.y}`)

  const cropped = page('p', 's', 0, { crop: { x: 50, y: 100, w: 200, h: 300 } })
  const cTL = displayToUser(cropped, { x: 0, y: 0 })
  check('crop: display origin sits at the crop window top-left',
    near(cTL.x, 50) && near(cTL.y, A4.h - 100), `${cTL.x}, ${cTL.y}`)

  // A round trip through the mapping must be an isometry: distances survive.
  for (const rot of [0, 90, 180, 270]) {
    const p = page('p', 's', 0, { rotation: rot })
    const a = displayToUser(p, { x: 30, y: 40 })
    const b = displayToUser(p, { x: 130, y: 240 })
    check(`rotation ${rot}: mapping preserves distance`,
      near(Math.hypot(b.x - a.x, b.y - a.y), Math.hypot(100, 200)))
  }

  // --- full export --------------------------------------------------------
  const seed = await PDFDocument.create()
  seed.addPage([A4.w, A4.h])
  seed.addPage([A4.w, A4.h])
  const bytes = new Uint8Array(await seed.save())

  const pages: PageItem[] = [
    page('a', 'src', 0),
    page('b', 'src', 1, { rotation: 90 }),
    page('c', 'src', 0, { crop: { x: 40, y: 60, w: 300, h: 500 } }), // duplicate of page 0
  ]

  const annotations: Annotation[] = [
    { id: 't1', pageId: 'a', type: 'text', x: 60, y: 80, w: 300, h: 40, opacity: 1, locked: false,
      text: 'Hola áéíóú ñ — firmado', fontSize: 14, font: 'helvetica', bold: false, italic: false,
      color: '#112233', align: 'left', lineHeight: 1.25 },
    { id: 'r1', pageId: 'a', type: 'rect', x: 50, y: 200, w: 180, h: 90, opacity: 1, locked: false,
      stroke: '#e11d48', strokeWidth: 2, fill: null },
    { id: 'e1', pageId: 'b', type: 'ellipse', x: 100, y: 120, w: 160, h: 80, opacity: 0.8, locked: false,
      stroke: '#0ea5e9', strokeWidth: 3, fill: '#bae6fd' },
    { id: 'l1', pageId: 'b', type: 'arrow', x: 40, y: 40, w: 220, h: 160, opacity: 1, locked: false,
      stroke: '#111827', strokeWidth: 2 },
    { id: 'd1', pageId: 'c', type: 'draw', x: 20, y: 20, w: 120, h: 60, opacity: 1, locked: false,
      stroke: '#0b1b3a', strokeWidth: 2,
      strokes: [[{ x: 20, y: 60 }, { x: 60, y: 20 }, { x: 100, y: 70 }, { x: 140, y: 30 }]] },
  ]

  const outBytes = await buildPdf({
    sources: { src: { id: 'src', name: 'seed.pdf', bytes, pageCount: 2 } },
    assets: {},
    pages,
    annotations,
  })

  const out = await PDFDocument.load(outBytes)
  check('exports one page per item', out.getPageCount() === 3, `${out.getPageCount()}`)

  const [p0, p1, p2] = out.getPages()
  check('user rotation lands on the page', p1.getRotation().angle === degrees(90).angle,
    `${p1.getRotation().angle}`)
  check('unrotated pages stay at 0', p0.getRotation().angle === 0)

  const crop = p2.getCropBox()
  check('crop box uses the unrotated window',
    near(crop.x, 40) && near(crop.y, A4.h - 60 - 500) && near(crop.width, 300) && near(crop.height, 500),
    `${crop.x}, ${crop.y}, ${crop.width}, ${crop.height}`)
  check('the duplicated page keeps its own crop box',
    p0.getCropBox().width === A4.w && p2.getCropBox().width === 300)

  check('output is a real PDF', outBytes.length > 1000 &&
    new TextDecoder().decode(outBytes.slice(0, 5)) === '%PDF-')

  console.log(failures ? `\n${failures} comprobación(es) fallida(s)` : '\nTodo correcto')
  process.exit(failures ? 1 : 0)
}

main().catch(e => { console.error(e); process.exit(1) })
