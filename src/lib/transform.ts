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

/**
 * Flips a box back to positive width and height, moving its origin to match.
 *
 * Dragging a corner past the opposite side makes the width or height negative.
 * Lines keep the sign — for them it is a direction, not a size — but for every
 * boxed object a negative size means the frame, the handles and the content stop
 * agreeing on where the object actually is, so it is resolved immediately.
 */
export function normalizeBox(a: Annotation): Annotation {
  if (a.type === 'line' || a.type === 'arrow') return a
  if (a.w >= 0 && a.h >= 0) return a
  return {
    ...a,
    x: a.w < 0 ? a.x + a.w : a.x,
    y: a.h < 0 ? a.y + a.h : a.y,
    w: Math.abs(a.w),
    h: Math.abs(a.h),
  } as Annotation
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
 * Two rules, no modifier keys:
 *
 *  - **Corners always keep the proportion.** The axis that moved further decides
 *    the new size, so the box follows the cursor, and the corner opposite the one
 *    being dragged never moves.
 *  - **Side handles are the only way to deform**, and the aspect lock governs
 *    them: locked, they scale both dimensions and stay centred on the axis they
 *    do not drive; unlocked, they change their own dimension alone.
 *
 * So with the lock on nothing can be squashed at all, which is what a lock ought
 * to mean.
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
  const proportional = (isCorner || keepAspect) && base.w !== 0 && base.h !== 0

  if (proportional) {
    const ratio = Math.abs(base.w) / Math.abs(base.h)
    if (isCorner) {
      if (Math.abs(w) / ratio >= Math.abs(h)) {
        h = Math.sign(h || base.h) * (Math.abs(w) / ratio)
      } else {
        w = Math.sign(w || base.w) * (Math.abs(h) * ratio)
      }
      // The opposite corner is the anchor.
      if (left) x = base.x + base.w - w
      if (top) y = base.y + base.h - h
    } else if (left || right) {
      // A horizontal handle drives the width; the height follows, centred.
      h = Math.sign(base.h) * (Math.abs(w) / ratio)
      y = base.y + (base.h - h) / 2
    } else {
      w = Math.sign(base.w) * (Math.abs(h) * ratio)
      x = base.x + (base.w - w) / 2
    }
  }

  if (Math.abs(w) < MIN_SIZE) w = Math.sign(w || 1) * MIN_SIZE
  if (Math.abs(h) < MIN_SIZE) h = Math.sign(h || 1) * MIN_SIZE

  // setBox first: it mirrors the ink strokes correctly while the sign is still
  // negative. Only then is the frame flipped back to a positive size.
  return normalizeBox(setBox(base, { x, y, w, h }))
}

/**
 * The size the reset button returns to: the one the object had when it was
 * inserted. Text is a special case — its height follows the content, so the
 * original *width* is restored and the height re-fitted, otherwise resetting a
 * paragraph would clip it.
 *
 * Objects created before this was recorded fall back to an intrinsic size: an
 * image's own proportions, a text box fitted to its content, ink tightened
 * around its strokes. Plain shapes have none, and return null.
 */
export function naturalBox(
  ann: Annotation, assets: Record<string, ImageAsset>,
): Partial<Rect> | null {
  if (ann.type === 'text') {
    const w = ann.initial?.w ?? Math.abs(ann.w)
    return { w, h: fittedHeight({ ...(ann as TextAnn), w }) }
  }
  if (ann.initial) return { w: ann.initial.w, h: ann.initial.h }

  switch (ann.type) {
    case 'image': {
      const asset = assets[(ann as ImageAnn).assetId]
      if (!asset || !asset.width) return null
      const w = Math.abs(ann.w)
      return { w, h: w * (asset.height / asset.width) }
    }
    case 'draw':
    case 'highlight': {
      const a = ann as DrawAnn
      const b = pointsBounds(a.strokes, a.strokeWidth / 2)
      return b.w > 0 && b.h > 0 ? { w: b.w, h: b.h } : null
    }
    default:
      return null
  }
}

/** True when resetting would actually change something. */
export function canReset(ann: Annotation, assets: Record<string, ImageAsset>): boolean {
  const target = naturalBox(ann, assets)
  if (!target) return false
  const sameW = target.w === undefined || Math.abs(target.w - Math.abs(ann.w)) < 0.5
  const sameH = target.h === undefined || Math.abs(target.h - Math.abs(ann.h)) < 0.5
  return !(sameW && sameH)
}

/** Aspect ratio of an annotation, or null when it has no usable one. */
export function aspectOf(ann: Annotation): number | null {
  if (!ann.w || !ann.h) return null
  return Math.abs(ann.w) / Math.abs(ann.h)
}
