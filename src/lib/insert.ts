import { useEditor } from '../store'
import type { ImageAsset, TextAnn } from '../types'
import { displaySize, uid } from './geometry'
import { scrollToPage } from './scroll'
import { fittedHeight } from './text'

/** Whichever page the user is looking at — see the scroll observer in App. */
function targetPage() {
  const { pages, activePageId } = useEditor.getState()
  return pages.find(p => p.id === activePageId) ?? pages[0] ?? null
}

export interface PlaceOptions {
  /** Fraction of the page width to occupy. */
  widthRatio?: number
  /** Hard cap in points, whichever is smaller. */
  maxWidth?: number
  /** `signature` sits above the bottom margin instead of the middle. */
  anchor?: 'center' | 'signature'
}

export function insertImage(asset: ImageAsset, opts: PlaceOptions = {}) {
  const page = targetPage()
  if (!page) return null
  const { style, addAnnotation, setTool } = useEditor.getState()
  const size = displaySize(page)

  const w = Math.min(
    size.w * (opts.widthRatio ?? 0.6),
    opts.maxWidth ?? asset.width * 0.75,
  )
  const h = (asset.height / asset.width) * w
  const y = opts.anchor === 'signature'
    ? Math.max(8, size.h - h - 72)
    : (size.h - h) / 2

  const id = uid('an')
  addAnnotation({
    id, pageId: page.id, type: 'image', assetId: asset.id,
    x: (size.w - w) / 2, y, w, h,
    opacity: style.opacity, locked: false,
  })
  setTool('select')
  scrollToPage(page.id)
  return id
}

export function insertText(text: string) {
  const page = targetPage()
  if (!page) return null
  const { style, addAnnotation, setTool } = useEditor.getState()
  const size = displaySize(page)
  const w = Math.min(size.w * 0.7, 420)

  const draft: TextAnn = {
    id: uid('an'), pageId: page.id, type: 'text',
    x: (size.w - w) / 2, y: 0, w, h: 0,
    opacity: style.opacity, locked: false,
    text, fontSize: style.fontSize, font: style.font,
    bold: style.bold, italic: style.italic, color: style.color,
    align: 'left', lineHeight: 1.25,
  }
  draft.h = fittedHeight(draft)
  draft.y = Math.max(8, (size.h - draft.h) / 2)

  addAnnotation(draft)
  setTool('select')
  scrollToPage(page.id)
  return draft.id
}
