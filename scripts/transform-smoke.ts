/**
 * Checks the resize maths: side handles, aspect-locked corners, ink scaling and
 * the natural-size reset.
 *
 *   npm run test:transform
 */
import {
  aspectOf, canReset, naturalBox, normalizeBox, resize, setBox, translate,
} from '../src/lib/transform'
import type { Annotation, DrawAnn, ImageAsset, ShapeAnn } from '../src/types'

let failures = 0

function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

const near = (a: number, b: number, tol = 0.01) => Math.abs(a - b) < tol

const box = (over: Partial<ShapeAnn> = {}): ShapeAnn => ({
  id: 'a', pageId: 'p', type: 'rect',
  x: 100, y: 100, w: 200, h: 100,
  opacity: 1, locked: false,
  stroke: '#000', strokeWidth: 1, fill: null,
  ...over,
})

const ink = (): DrawAnn => ({
  id: 'd', pageId: 'p', type: 'draw',
  x: 0, y: 0, w: 100, h: 50,
  opacity: 1, locked: false,
  stroke: '#000', strokeWidth: 2,
  strokes: [[{ x: 0, y: 0 }, { x: 50, y: 25 }, { x: 100, y: 50 }]],
})

function sideHandles() {
  const e = resize(box(), 'e', 40, 999, true)
  check('handle E changes only the width', near(e.w, 240) && near(e.h, 100) && near(e.x, 100),
    `${e.w} x ${e.h}`)

  const s = resize(box(), 's', 999, 30, true)
  check('handle S changes only the height', near(s.h, 130) && near(s.w, 200), `${s.w} x ${s.h}`)

  const w = resize(box(), 'w', 50, 0, true)
  check('handle W moves the left edge and keeps the right one',
    near(w.x, 150) && near(w.w, 150) && near(w.x + w.w, 300), `x=${w.x} w=${w.w}`)

  const n = resize(box(), 'n', 0, 20, true)
  check('handle N moves the top edge and keeps the bottom one',
    near(n.y, 120) && near(n.h, 80) && near(n.y + n.h, 200), `y=${n.y} h=${n.h}`)

  check('side handles ignore the aspect lock',
    near(resize(box(), 'e', 40, 0, true).h, 100))
}

function lockedCorners() {
  const base = box() // 200 x 100, ratio 2

  const se = resize(base, 'se', 100, 0, true)
  check('locked SE corner keeps the 2:1 ratio',
    near(aspectOf(se)!, 2) && near(se.w, 300) && near(se.h, 150), `${se.w} x ${se.h}`)
  check('locked SE corner keeps the top-left anchored', near(se.x, 100) && near(se.y, 100))

  const nw = resize(base, 'nw', -100, 0, true)
  check('locked NW corner keeps the bottom-right anchored',
    near(nw.x + nw.w, 300) && near(nw.y + nw.h, 200),
    `right=${nw.x + nw.w} bottom=${nw.y + nw.h}`)
  check('locked NW corner keeps the ratio', near(aspectOf(nw)!, 2))

  const free = resize(base, 'se', 100, 0, false)
  check('unlocked corner distorts freely', near(free.w, 300) && near(free.h, 100),
    `${free.w} x ${free.h}`)

  // The axis that moved further wins, so the box follows the cursor.
  const tall = resize(base, 'se', 0, 200, true)
  check('locked corner follows the dominant axis',
    near(tall.h, 300) && near(tall.w, 600), `${tall.w} x ${tall.h}`)

  const tiny = resize(box(), 'se', -500, -500, false)
  check('a box cannot be collapsed to nothing',
    Math.abs(tiny.w) >= 6 && Math.abs(tiny.h) >= 6, `${tiny.w} x ${tiny.h}`)
}

function inkFollowsItsBox() {
  const scaled = resize(ink(), 'se', 100, 50, false) as DrawAnn
  const pts = scaled.strokes[0]
  check('ink scales with the box',
    near(pts[2].x, 200) && near(pts[2].y, 100), `${pts[2].x}, ${pts[2].y}`)
  check('ink keeps its midpoint proportional',
    near(pts[1].x, 100) && near(pts[1].y, 50), `${pts[1].x}, ${pts[1].y}`)

  const moved = translate(ink(), 10, -5) as DrawAnn
  check('moving carries the strokes along',
    near(moved.strokes[0][0].x, 10) && near(moved.strokes[0][0].y, -5))

  const boxed = setBox(ink(), { w: 50 }) as DrawAnn
  check('setBox rescales strokes too', near(boxed.strokes[0][2].x, 50))
}

function flippedBoxes() {
  // Dragging the SE corner far past the opposite side.
  const flipped = resize(box(), 'se', -400, -300, false)
  check('a box dragged inside out keeps a positive size',
    flipped.w > 0 && flipped.h > 0, `${flipped.w} x ${flipped.h}`)
  check('the flipped frame lands where the cursor left it',
    near(flipped.x, -100) && near(flipped.y, -100) &&
    near(flipped.x + flipped.w, 100) && near(flipped.y + flipped.h, 100),
    `x=${flipped.x} y=${flipped.y} w=${flipped.w} h=${flipped.h}`)

  const mirrored = resize(ink(), 'se', -200, 0, false) as DrawAnn
  const xs = mirrored.strokes[0].map(p => p.x)
  check('ink mirrors instead of collapsing when dragged through',
    Math.min(...xs) >= mirrored.x - 0.01 &&
    Math.max(...xs) <= mirrored.x + mirrored.w + 0.01,
    `strokes ${Math.min(...xs)}..${Math.max(...xs)} vs frame ${mirrored.x}..${mirrored.x + mirrored.w}`)

  const line = resize(
    { ...box(), type: 'line', w: 100, h: 100 } as unknown as Annotation,
    'p2', -300, -300, false,
  )
  check('a line keeps its sign, because there it means direction',
    line.w < 0 && line.h < 0, `${line.w}, ${line.h}`)

  check('normalizeBox leaves an upright box untouched',
    normalizeBox(box()).x === 100 && normalizeBox(box()).w === 200)
}

function naturalSize() {
  const assets: Record<string, ImageAsset> = {
    img: { id: 'img', bytes: new Uint8Array(), mime: 'image/png', url: '', width: 800, height: 400 },
  }
  const distorted: Annotation = {
    id: 'i', pageId: 'p', type: 'image', assetId: 'img',
    x: 0, y: 0, w: 300, h: 300, opacity: 1, locked: false,
  }

  const remembered: Annotation = { ...distorted, initial: { w: 200, h: 100 } }
  const back = naturalBox(remembered, assets)
  check('reset returns to the size the object was inserted at',
    !!back && near(back.w!, 200) && near(back.h!, 100), `${back?.w} x ${back?.h}`)
  check('reset is offered while the size differs', canReset(remembered, assets))
  check('reset is not offered once already at the initial size',
    !canReset({ ...remembered, w: 200, h: 100 }, assets))

  // Without a recorded initial size, fall back to the intrinsic one.
  const natural = naturalBox(distorted, assets)
  check('an image with no recorded size falls back to its own proportions',
    !!natural && near(natural.w!, 300) && near(natural.h!, 150),
    `${natural?.w} x ${natural?.h}`)

  const tightened = naturalBox(ink(), {})
  check('ink with no recorded size falls back to its stroke bounds',
    !!tightened && near(tightened.w!, 102) && near(tightened.h!, 52),
    `${tightened?.w} x ${tightened?.h}`)

  check('shapes report no natural size', naturalBox(box(), {}) === null)
  check('aspectOf rejects a degenerate box', aspectOf(box({ h: 0 })) === null)
}

sideHandles()
lockedCorners()
inkFollowsItsBox()
flippedBoxes()
naturalSize()

console.log(failures ? `\n${failures} comprobación(es) fallida(s)` : '\nTodo correcto')
process.exit(failures ? 1 : 0)
