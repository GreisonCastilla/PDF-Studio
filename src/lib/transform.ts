import type { Annotation, DrawAnn, ImageAnn, ImageAsset, Rect, TextAnn } from '../types'
import { pointsBounds } from './geometry'
import { fittedHeight } from './text'

export const MIN_SIZE = 6

export type Handle = 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w' | 'p1' | 'p2'

/** Moves an annotation, carrying its ink strokes along. */
export function translate(a: Annotation, dx: number, dy: number): Annotation {
  const moved = { ...a, x: a.x + dx, y: a.y + dy }
  if (moved.type === 'draw' || moved.type === 'highlight') {
    moved.strokes = (a as DrawAnn).strokes.map(s => s.map(p => ({ x: p.x + dx, y: p.y + dy })))
  }
  return moved as Annotation
}

/** Rewrites the bounding box, rescaling ink strokes to match. */
export function setBox(base: Annotation, box: Partial<Rect>): Annotation {
  const x = box.x ?? base.x
  const y = box.y ?? base.y
  const w = box.w ?? base.w
  const h = box.h ?? base.h

  const next = { ...base, x, y, w, h } as Annotation
  if (base.type === 'draw' || base.type === 'highlight') {
    const sx = base.w === 0 ? 1 : w / base.w
    const sy = base.h === 0 ? 1 : h / base.h
    ;(next as DrawAnn).strokes = (base as DrawAnn).strokes.map(stroke =>
      stroke.map(pt => ({ x: x + (pt.x - base.x) * sx, y: y + (pt.y - base.y) * sy })),
    )
  }
  return next
}

/**
 * Applies a handle drag.
 *
 * Side handles change one dimension on their own; corner handles change both.
 * With the aspect lock on, corners keep the original proportion and the axis that
 * moved further decides the new size. The corner opposite the one being dragged
 * always stays put.
 */
export function resize(
  base: Annotation, handle: Handle, dx: number, dy: number, keepAspect: boolean,
): Annotation {
  if ((base.type === 'line' || base.type === 'arrow') && (handle === 'p1' || handle === 'p2')) {
    return handle === 'p1'
      ? { ...base, x: base.x + dx, y: base.y + dy, w: base.w - dx, h: base.h - dy }
      : { ...base, w: base.w + dx, h: base.h + dy }
  }

  const left = handle === 'nw' || handle === 'sw' || handle === 'w'
  const right = handle === 'ne' || handle === 'se' || handle === 'e'
  const top = handle === 'nw' || handle === 'ne' || handle === 'n'
  const bottom = handle === 'sw' || handle === 'se' || handle === 's'

  let { x, y, w, h } = base
  if (left) { x = base.x + dx; w = base.w - dx }
  if (right) { w = base.w + dx }
  if (top) { y = base.y + dy; h = base.h - dy }
  if (bottom) { h = base.h + dy }

  const isCorner = (left || right) && (top || bottom)
  if (isCorner && keepAspect && base.w !== 0 && base.h !== 0) {
    const ratio = Math.abs(base.w) / Math.abs(base.h)
    if (Math.abs(w) / ratio >= Math.abs(h)) {
      h = Math.sign(h || base.h) * (Math.abs(w) / ratio)
    } else {
      w = Math.sign(w || base.w) * (Math.abs(h) * ratio)
    }
    if (left) x = base.x + base.w - w
    if (top) y = base.y + base.h - h
  }

  if (Math.abs(w) < MIN_SIZE) w = Math.sign(w || 1) * MIN_SIZE
  if (Math.abs(h) < MIN_SIZE) h = Math.sign(h || 1) * MIN_SIZE

  return setBox(base, { x, y, w, h })
}

/**
 * The size an object "wants" to be, used by the reset button:
 * an image's own proportions, a text box fitted to its content, ink tightened
 * around its strokes. Shapes have no intrinsic size, so they return null.
 */
export function naturalBox(
  ann: Annotation, assets: Record<string, ImageAsset>,
): Partial<Rect> | null {
  switch (ann.type) {
    case 'image': {
      const asset = assets[(ann as ImageAnn).assetId]
      if (!asset || !asset.width) return null
      const w = Math.abs(ann.w)
      return { w, h: w * (asset.height / asset.width) }
    }
    case 'text':
      return { h: fittedHeight(ann as TextAnn) }
    case 'draw':
    case 'highlight': {
      const a = ann as DrawAnn
      const b = pointsBounds(a.strokes, a.strokeWidth / 2)
      return b.w > 0 && b.h > 0 ? b : null
    }
    default:
      return null
  }
}

/** Aspect ratio of an annotation, or null when it has no usable one. */
export function aspectOf(ann: Annotation): number | null {
  if (!ann.w || !ann.h) return null
  return Math.abs(ann.w) / Math.abs(ann.h)
}
