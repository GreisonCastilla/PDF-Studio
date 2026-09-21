import type { PageItem, Point, Rect } from '../types'

export const uid = (p = 'id') =>
  `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export const norm360 = (deg: number) => ((deg % 360) + 360) % 360

/** Total clockwise rotation the viewer sees: the PDF's own /Rotate plus the user's. */
export const totalRotation = (p: PageItem) => norm360(p.baseRotation + p.rotation)

/** The crop window, defaulting to the whole visible box. */
export const cropRect = (p: PageItem): Rect =>
  p.crop ?? { x: 0, y: 0, w: p.baseW, h: p.baseH }

/** Size of the page as the user sees it, in PDF points. */
export function displaySize(p: PageItem): { w: number; h: number } {
  const c = cropRect(p)
  return totalRotation(p) % 180 === 90 ? { w: c.h, h: c.w } : { w: c.w, h: c.h }
}

/**
 * Display point -> PDF user space (origin bottom-left, y up).
 *
 * Display space is what the user manipulates: the cropped, rotated page with the
 * origin at its top-left corner. Getting from there to user space means undoing
 * the rotation, shifting by the crop offset, then flipping the y axis.
 */
export function displayToUser(p: PageItem, d: Point): Point {
  const c = cropRect(p)
  const r = totalRotation(p)
  let lx: number, ly: number
  switch (r) {
    case 90:  lx = d.y;             ly = c.h - d.x;      break
    case 180: lx = c.w - d.x;       ly = c.h - d.y;      break
    case 270: lx = c.w - d.y;       ly = d.x;            break
    default:  lx = d.x;             ly = d.y;            break
  }
  const bx = c.x + lx
  const by = c.y + ly
  return { x: p.baseX + bx, y: p.baseY + (p.baseH - by) }
}

/** Base-space rect -> display-space rect (a plain image rotation). */
export function baseRectToDisplay(p: PageItem, r: Rect): Rect {
  switch (totalRotation(p)) {
    case 90:  return { x: p.baseH - r.y - r.h, y: r.x,                   w: r.h, h: r.w }
    case 180: return { x: p.baseW - r.x - r.w, y: p.baseH - r.y - r.h,   w: r.w, h: r.h }
    case 270: return { x: r.y,                 y: p.baseW - r.x - r.w,   w: r.h, h: r.w }
    default:  return { ...r }
  }
}

/**
 * Display-space rect -> base-space rect. Used when the user drags a crop window:
 * crops are stored unrotated so they survive later rotations unchanged.
 */
export function displayRectToBase(p: PageItem, r: Rect): Rect {
  const a = displayToUser(p, { x: r.x, y: r.y })
  const b = displayToUser(p, { x: r.x + r.w, y: r.y + r.h })
  const x0 = Math.min(a.x, b.x) - p.baseX
  const x1 = Math.max(a.x, b.x) - p.baseX
  // user space is y-up; base space is y-down from the top of the page
  const yTop = p.baseH - (Math.max(a.y, b.y) - p.baseY)
  const yBot = p.baseH - (Math.min(a.y, b.y) - p.baseY)
  return { x: x0, y: yTop, w: x1 - x0, h: yBot - yTop }
}

/** Normalises a rect that may have been dragged right-to-left or bottom-to-top. */
export function normalizeRect(r: Rect): Rect {
  return {
    x: r.w < 0 ? r.x + r.w : r.x,
    y: r.h < 0 ? r.y + r.h : r.y,
    w: Math.abs(r.w),
    h: Math.abs(r.h),
  }
}

export function pointsBounds(strokes: Point[][], pad = 0): Rect {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const s of strokes) for (const pt of s) {
    if (pt.x < minX) minX = pt.x
    if (pt.y < minY) minY = pt.y
    if (pt.x > maxX) maxX = pt.x
    if (pt.y > maxY) maxY = pt.y
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, w: 0, h: 0 }
  return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 }
}

/** Catmull-Rom smoothing, so freehand ink and signatures do not look polygonal. */
export function strokeToPath(pts: Point[]): string {
  if (pts.length === 0) return ''
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y} l 0.01 0`
  if (pts.length === 2) return `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y}`
  let d = `M ${pts[0].x} ${pts[0].y}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] ?? p2
    const c1x = p1.x + (p2.x - p0.x) / 6
    const c1y = p1.y + (p2.y - p0.y) / 6
    const c2x = p2.x - (p3.x - p1.x) / 6
    const c2y = p2.y - (p3.y - p1.y) / 6
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`
  }
  return d
}

/** Drops points closer together than `tol`, keeping exported PDFs small. */
export function simplify(pts: Point[], tol = 1): Point[] {
  if (pts.length < 3) return pts
  const out = [pts[0]]
  for (const p of pts) {
    const last = out[out.length - 1]
    if (Math.hypot(p.x - last.x, p.y - last.y) >= tol) out.push(p)
  }
  const last = pts[pts.length - 1]
  if (out[out.length - 1] !== last) out.push(last)
  return out
}

export function hexToRgb01(hex: string): { r: number; g: number; b: number } {
  let h = hex.replace('#', '').trim()
  if (h.length === 3) h = h.split('').map(c => c + c).join('')
  const n = parseInt(h || '000000', 16)
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 }
}
