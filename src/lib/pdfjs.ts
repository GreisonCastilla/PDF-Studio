import * as pdfjs from 'pdfjs-dist'
import type { PDFDocumentLoadingTask, PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url'
import type { PageItem, PdfSource } from '../types'
import { baseRectToDisplay, cropRect, totalRotation, uid } from './geometry'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

const docs = new Map<string, PDFDocumentProxy>()
const tasks = new Map<string, PDFDocumentLoadingTask>()
const pageCache = new Map<string, Promise<PDFPageProxy>>()

export async function openSource(file: File | { name: string; bytes: Uint8Array }) {
  const bytes =
    file instanceof File ? new Uint8Array(await file.arrayBuffer()) : file.bytes
  const id = uid('src')
  // pdf.js takes ownership of the buffer it is handed, so it gets a clone and we
  // keep the pristine bytes for pdf-lib.
  const task = pdfjs.getDocument({ data: bytes.slice() })
  const doc = await task.promise
  docs.set(id, doc)
  tasks.set(id, task)

  const source: PdfSource = { id, name: file.name, bytes, pageCount: doc.numPages }
  const pages: PageItem[] = []
  for (let i = 0; i < doc.numPages; i++) {
    const page = await doc.getPage(i + 1)
    const [x0, y0, x1, y1] = page.view
    pages.push({
      id: uid('pg'),
      srcId: id,
      srcIndex: i,
      rotation: 0,
      crop: null,
      baseX: x0,
      baseY: y0,
      baseW: x1 - x0,
      baseH: y1 - y0,
      baseRotation: ((page.rotate % 360) + 360) % 360,
    })
  }
  return { source, pages }
}

function getPage(srcId: string, index: number) {
  const key = `${srcId}:${index}`
  let p = pageCache.get(key)
  if (!p) {
    const doc = docs.get(srcId)
    if (!doc) return null
    p = doc.getPage(index + 1)
    pageCache.set(key, p)
  }
  return p
}

export interface RenderHandle { cancel(): void }

/**
 * Draws one page onto a canvas at the given scale, honouring user rotation and crop.
 * Returns a handle so a re-render can cancel the in-flight one — pdf.js refuses to
 * paint the same canvas twice concurrently.
 */
export function renderPage(
  canvas: HTMLCanvasElement,
  item: PageItem,
  scale: number,
  onDone?: () => void,
): RenderHandle {
  let cancelled = false
  let task: { cancel(): void } | null = null

  const run = async () => {
    const proxy = await getPage(item.srcId, item.srcIndex)
    if (!proxy || cancelled) return
    const rot = totalRotation(item)
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const px = scale * dpr

    const viewport = proxy.getViewport({ scale: px, rotation: rot })
    const win = baseRectToDisplay(item, cropRect(item))

    canvas.width = Math.max(1, Math.round(win.w * px))
    canvas.height = Math.max(1, Math.round(win.h * px))
    canvas.style.width = `${win.w * scale}px`
    canvas.style.height = `${win.h * scale}px`

    const ctx = canvas.getContext('2d')
    if (!ctx || cancelled) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    const t = proxy.render({
      canvas,
      canvasContext: undefined,
      viewport,
      // Shift the full page so the crop window lands at the canvas origin.
      transform: [1, 0, 0, 1, -win.x * px, -win.y * px],
      background: '#ffffff',
    })
    task = t
    try {
      await t.promise
      if (!cancelled) onDone?.()
    } catch (e: unknown) {
      if (!(e && typeof e === 'object' && 'name' in e && e.name === 'RenderingCancelledException')) {
        console.error('render failed', e)
      }
    }
  }

  void run()
  return {
    cancel() {
      cancelled = true
      task?.cancel()
    },
  }
}

export function dropSource(srcId: string) {
  for (const key of [...pageCache.keys()]) {
    if (key.startsWith(`${srcId}:`)) pageCache.delete(key)
  }
  void tasks.get(srcId)?.destroy()
  tasks.delete(srcId)
  docs.delete(srcId)
}
