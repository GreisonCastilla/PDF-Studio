import {
  PDFDocument, StandardFonts, degrees, rgb, LineCapStyle, BlendMode,
  type PDFFont, type PDFImage, type PDFPage,
} from 'pdf-lib'
import type {
  Annotation, DocState, DrawAnn, FontKey, ImageAnn, LineAnn, PageItem, ShapeAnn, TextAnn,
} from '../types'
import { cropRect, displayToUser, hexToRgb01, totalRotation } from './geometry'
import { cssMeasure, layoutText, lineOffset, toWinAnsi } from './text'

const STANDARD: Record<FontKey, [StandardFonts, StandardFonts, StandardFonts, StandardFonts]> = {
  helvetica: [
    StandardFonts.Helvetica, StandardFonts.HelveticaBold,
    StandardFonts.HelveticaOblique, StandardFonts.HelveticaBoldOblique,
  ],
  times: [
    StandardFonts.TimesRoman, StandardFonts.TimesRomanBold,
    StandardFonts.TimesRomanItalic, StandardFonts.TimesRomanBoldItalic,
  ],
  courier: [
    StandardFonts.Courier, StandardFonts.CourierBold,
    StandardFonts.CourierOblique, StandardFonts.CourierBoldOblique,
  ],
}

const color = (hex: string) => {
  const c = hexToRgb01(hex)
  return rgb(c.r, c.g, c.b)
}

/**
 * Builds the output document: pages are copied in the current order, then the
 * user's rotation, crop and annotations are baked in.
 *
 * Every annotation lives in display space (top-left origin, y down, already
 * rotated and cropped). `displayToUser` undoes all of that, and each drawing
 * call is additionally rotated by the page rotation so the content ends up
 * upright once the viewer applies /Rotate.
 */
export async function buildPdf(
  state: Pick<DocState, 'sources' | 'pages' | 'annotations' | 'assets'>,
  pageIds?: string[],
): Promise<Uint8Array> {
  const wanted = pageIds
    ? state.pages.filter(p => pageIds.includes(p.id))
    : state.pages
  if (!wanted.length) throw new Error('No hay páginas que exportar')

  const out = await PDFDocument.create()
  const srcDocs = new Map<string, PDFDocument>()
  for (const id of new Set(wanted.map(p => p.srcId))) {
    const src = state.sources[id]
    if (!src) continue
    srcDocs.set(id, await PDFDocument.load(src.bytes.slice().buffer, { ignoreEncryption: true }))
  }

  // Copy in occurrence batches: pdf-lib's copier dedupes within a single call,
  // so a duplicated page must be copied by a second call to get its own object.
  const placed = new Array<PDFPage | null>(wanted.length).fill(null)
  for (const [srcId, srcDoc] of srcDocs) {
    const seen = new Map<number, number>()
    const batches: { idx: number; slot: number }[][] = []
    wanted.forEach((p, slot) => {
      if (p.srcId !== srcId) return
      const rank = seen.get(p.srcIndex) ?? 0
      seen.set(p.srcIndex, rank + 1)
      ;(batches[rank] ??= []).push({ idx: p.srcIndex, slot })
    })
    for (const batch of batches) {
      if (!batch) continue
      const copied = await out.copyPages(srcDoc, batch.map(b => b.idx))
      batch.forEach((b, i) => { placed[b.slot] = copied[i] })
    }
  }

  const fonts = new Map<string, PDFFont>()
  const getFont = async (key: FontKey, bold: boolean, italic: boolean) => {
    const variant = (bold ? 1 : 0) + (italic ? 2 : 0)
    const name = STANDARD[key][variant]
    let f = fonts.get(name)
    if (!f) { f = await out.embedFont(name); fonts.set(name, f) }
    return f
  }

  const images = new Map<string, PDFImage>()
  const getImage = async (assetId: string) => {
    let img = images.get(assetId)
    if (!img) {
      const asset = state.assets[assetId]
      if (!asset) return null
      const buf = asset.bytes.slice().buffer
      img = asset.mime === 'image/jpeg' ? await out.embedJpg(buf) : await out.embedPng(buf)
      images.set(assetId, img)
    }
    return img
  }

  for (let i = 0; i < wanted.length; i++) {
    const item = wanted[i]
    const page = placed[i]
    if (!page) continue
    out.addPage(page)

    const rot = totalRotation(item)
    page.setRotation(degrees(rot))

    if (item.crop) {
      const c = cropRect(item)
      page.setCropBox(
        item.baseX + c.x,
        item.baseY + (item.baseH - c.y - c.h),
        c.w,
        c.h,
      )
    }

    const anns = state.annotations.filter(a => a.pageId === item.id && !a.hidden)
    for (const ann of anns) await drawAnnotation(page, item, ann, rot, getFont, getImage)
  }

  return out.save({ useObjectStreams: true })
}

type GetFont = (k: FontKey, b: boolean, i: boolean) => Promise<PDFFont>
type GetImage = (id: string) => Promise<PDFImage | null>

async function drawAnnotation(
  page: PDFPage,
  item: PageItem,
  ann: Annotation,
  rot: number,
  getFont: GetFont,
  getImage: GetImage,
) {
  const u = (x: number, y: number) => displayToUser(item, { x, y })
  const rotate = degrees(rot)

  switch (ann.type) {
    case 'rect': {
      const a = ann as ShapeAnn
      const p = u(a.x, a.y + a.h) // bottom-left of the box, in display space
      page.drawRectangle({
        x: p.x, y: p.y, width: a.w, height: a.h, rotate,
        borderColor: color(a.stroke),
        borderWidth: a.strokeWidth,
        borderOpacity: a.opacity,
        color: a.fill ? color(a.fill) : undefined,
        opacity: a.fill ? a.opacity : 0,
      })
      break
    }
    case 'ellipse': {
      const a = ann as ShapeAnn
      const p = u(a.x + a.w / 2, a.y + a.h / 2)
      page.drawEllipse({
        x: p.x, y: p.y, xScale: a.w / 2, yScale: a.h / 2, rotate,
        borderColor: color(a.stroke),
        borderWidth: a.strokeWidth,
        borderOpacity: a.opacity,
        color: a.fill ? color(a.fill) : undefined,
        opacity: a.fill ? a.opacity : 0,
      })
      break
    }
    case 'line':
    case 'arrow': {
      const a = ann as LineAnn
      const start = u(a.x, a.y)
      const end = u(a.x + a.w, a.y + a.h)
      const opts = {
        thickness: a.strokeWidth,
        color: color(a.stroke),
        opacity: a.opacity,
        lineCap: LineCapStyle.Round,
      }
      page.drawLine({ start, end, ...opts })
      if (a.type === 'arrow') {
        const angle = Math.atan2(a.h, a.w)
        const len = Math.max(8, a.strokeWidth * 4)
        const tip = { x: a.x + a.w, y: a.y + a.h }
        for (const spread of [Math.PI * 0.82, -Math.PI * 0.82]) {
          const wing = u(
            tip.x + len * Math.cos(angle + spread),
            tip.y + len * Math.sin(angle + spread),
          )
          page.drawLine({ start: end, end: wing, ...opts })
        }
      }
      break
    }
    case 'draw':
    case 'highlight': {
      const a = ann as DrawAnn
      const highlight = a.type === 'highlight'
      for (const stroke of a.strokes) {
        for (let i = 1; i < stroke.length; i++) {
          page.drawLine({
            start: u(stroke[i - 1].x, stroke[i - 1].y),
            end: u(stroke[i].x, stroke[i].y),
            thickness: a.strokeWidth,
            color: color(a.stroke),
            opacity: highlight ? Math.min(1, a.opacity) : a.opacity,
            lineCap: LineCapStyle.Round,
            blendMode: highlight ? BlendMode.Multiply : undefined,
          })
        }
      }
      break
    }
    case 'image': {
      const a = ann as ImageAnn
      const img = await getImage(a.assetId)
      if (!img) break
      const p = u(a.x, a.y + a.h)
      page.drawImage(img, { x: p.x, y: p.y, width: a.w, height: a.h, rotate, opacity: a.opacity })
      break
    }
    case 'text': {
      const a = ann as TextAnn
      const font = await getFont(a.font, a.bold, a.italic)
      const measure = (t: string) => font.widthOfTextAtSize(toWinAnsi(t), a.fontSize)
      const { lines, baselines } = layoutText(a, measure)
      for (let i = 0; i < lines.length; i++) {
        const text = toWinAnsi(lines[i])
        if (!text) continue
        const dx = a.x + lineOffset(a, measure(lines[i]))
        const p = u(dx, a.y + baselines[i])
        page.drawText(text, {
          x: p.x, y: p.y, size: a.fontSize, font, rotate,
          color: color(a.color), opacity: a.opacity,
        })
      }
      break
    }
  }
}

export function download(bytes: Uint8Array, name: string) {
  const blob = new Blob([bytes.slice().buffer], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name.replace(/\.pdf$/i, '') + '.pdf'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

/** Re-measures text with browser metrics — used by the auto-fit box height. */
export const previewMeasure = cssMeasure
