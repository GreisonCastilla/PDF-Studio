import { create } from 'zustand'
import { PDFDocument } from 'pdf-lib'
import type {
  Annotation, DocState, FontKey, ImageAsset, PageItem, PdfSource, Rect, Tool,
} from './types'
import { normalizeRect, uid } from './lib/geometry'
import { dropSource, openSource } from './lib/pdfjs'

interface Snapshot { pages: PageItem[]; annotations: Annotation[] }

export interface Style {
  stroke: string
  fill: string | null
  strokeWidth: number
  fontSize: number
  font: FontKey
  bold: boolean
  italic: boolean
  color: string
  opacity: number
  highlight: string
}

interface Editor extends DocState {
  docName: string
  tool: Tool
  style: Style
  zoom: number
  fitWidth: boolean
  keepAspect: boolean
  selectedAnnIds: string[]
  selectedPageIds: string[]
  activePageId: string | null
  cropTarget: string | null
  draggingAnnId: string | null
  busy: string | null
  past: Snapshot[]
  future: Snapshot[]

  // ---- lifecycle
  importFiles(files: FileList | File[]): Promise<void>
  addAsset(asset: ImageAsset): void
  setBusy(v: string | null): void
  reset(): void

  // ---- history
  pushHistory(): void
  undo(): void
  redo(): void

  // ---- pages
  movePage(from: number, to: number): void
  rotatePages(ids: string[], delta: number): void
  deletePages(ids: string[]): void
  duplicatePages(ids: string[]): void
  insertBlankPage(afterIndex: number): Promise<void>
  setCrop(pageId: string, crop: Rect | null): void
  applyCropToAll(source: PageItem): void

  // ---- annotations
  addAnnotation(a: Annotation): void
  updateAnnotation(id: string, patch: Partial<Annotation>): void
  updateSelected(patch: Record<string, unknown>): void
  deleteAnnotations(ids: string[]): void
  duplicateAnnotations(ids: string[]): void
  reorderAnnotation(id: string, dir: 'front' | 'back' | 'forward' | 'backward'): void

  // ---- ui
  setTool(t: Tool): void
  setStyle(p: Partial<Style>): void
  select(ids: string[]): void
  selectPages(ids: string[]): void
  setActivePage(id: string | null): void
  setZoom(z: number, fit?: boolean): void
  setKeepAspect(v: boolean): void
  setCropTarget(id: string | null): void
  setDragging(id: string | null): void
}

const initial = {
  sources: {} as Record<string, PdfSource>,
  assets: {} as Record<string, ImageAsset>,
  pages: [] as PageItem[],
  annotations: [] as Annotation[],
  docName: 'documento.pdf',
  selectedAnnIds: [] as string[],
  selectedPageIds: [] as string[],
  activePageId: null as string | null,
  cropTarget: null as string | null,
  draggingAnnId: null as string | null,
  past: [] as Snapshot[],
  future: [] as Snapshot[],
}

export const useEditor = create<Editor>()((set, get) => ({
  ...initial,
  tool: 'select',
  zoom: 1,
  fitWidth: true,
  keepAspect: true,
  busy: null,
  style: {
    stroke: '#e11d48',
    fill: null,
    strokeWidth: 2,
    fontSize: 14,
    font: 'helvetica',
    bold: false,
    italic: false,
    color: '#111827',
    opacity: 1,
    highlight: '#fde047',
  },

  setBusy: v => set({ busy: v }),

  async importFiles(files) {
    const list = Array.from(files).filter(f => /pdf$/i.test(f.type) || /\.pdf$/i.test(f.name))
    if (!list.length) return
    set({ busy: 'Abriendo PDF…' })
    try {
      get().pushHistory()
      for (const file of list) {
        const { source, pages } = await openSource(file)
        set(s => ({
          sources: { ...s.sources, [source.id]: source },
          pages: [...s.pages, ...pages],
          docName: s.pages.length ? s.docName : file.name,
          activePageId: s.activePageId ?? pages[0]?.id ?? null,
        }))
      }
    } finally {
      set({ busy: null })
    }
  },

  addAsset: asset => set(s => ({ assets: { ...s.assets, [asset.id]: asset } })),

  reset() {
    const { sources, assets } = get()
    Object.keys(sources).forEach(dropSource)
    Object.values(assets).forEach(a => URL.revokeObjectURL(a.url))
    set({ ...initial })
  },

  pushHistory() {
    const { pages, annotations, past } = get()
    set({
      past: [...past.slice(-49), { pages, annotations }],
      future: [],
    })
  },

  undo() {
    const { past, future, pages, annotations } = get()
    const prev = past[past.length - 1]
    if (!prev) return
    set({
      ...prev,
      past: past.slice(0, -1),
      future: [{ pages, annotations }, ...future].slice(0, 50),
      selectedAnnIds: [],
    })
  },

  redo() {
    const { past, future, pages, annotations } = get()
    const next = future[0]
    if (!next) return
    set({
      ...next,
      past: [...past, { pages, annotations }],
      future: future.slice(1),
      selectedAnnIds: [],
    })
  },

  movePage(from, to) {
    if (from === to) return
    get().pushHistory()
    set(s => {
      const pages = [...s.pages]
      const [moved] = pages.splice(from, 1)
      pages.splice(to, 0, moved)
      return { pages }
    })
  },

  rotatePages(ids, delta) {
    if (!ids.length) return
    get().pushHistory()
    set(s => ({
      pages: s.pages.map(p =>
        ids.includes(p.id) ? { ...p, rotation: (((p.rotation + delta) % 360) + 360) % 360 } : p,
      ),
    }))
  },

  deletePages(ids) {
    if (!ids.length) return
    get().pushHistory()
    set(s => {
      const pages = s.pages.filter(p => !ids.includes(p.id))
      return {
        pages,
        annotations: s.annotations.filter(a => !ids.includes(a.pageId)),
        selectedPageIds: [],
        activePageId: pages.some(p => p.id === s.activePageId) ? s.activePageId : pages[0]?.id ?? null,
        // Never leave the crop target pointing at a page that no longer exists.
        cropTarget: s.cropTarget && ids.includes(s.cropTarget) ? null : s.cropTarget,
        tool: s.cropTarget && ids.includes(s.cropTarget) ? 'select' : s.tool,
      }
    })
  },

  duplicatePages(ids) {
    if (!ids.length) return
    get().pushHistory()
    set(s => {
      const pages: PageItem[] = []
      const annotations = [...s.annotations]
      for (const p of s.pages) {
        pages.push(p)
        if (ids.includes(p.id)) {
          const copy = { ...p, id: uid('pg') }
          pages.push(copy)
          for (const a of s.annotations) {
            if (a.pageId === p.id) annotations.push({ ...a, id: uid('an'), pageId: copy.id })
          }
        }
      }
      return { pages, annotations }
    })
  },

  async insertBlankPage(afterIndex) {
    set({ busy: 'Creando página…' })
    try {
      const doc = await PDFDocument.create()
      const ref = get().pages[afterIndex]
      doc.addPage(ref ? [ref.baseW, ref.baseH] : [595.28, 841.89])
      const bytes = new Uint8Array(await doc.save())
      const { source, pages } = await openSource({ name: 'blank.pdf', bytes })
      get().pushHistory()
      set(s => {
        const next = [...s.pages]
        next.splice(afterIndex + 1, 0, ...pages)
        return { sources: { ...s.sources, [source.id]: source }, pages: next }
      })
    } finally {
      set({ busy: null })
    }
  },

  setCrop(pageId, crop) {
    get().pushHistory()
    set(s => ({
      pages: s.pages.map(p => (p.id === pageId ? { ...p, crop: crop && normalizeRect(crop) } : p)),
      cropTarget: null,
      tool: 'select',
    }))
  },

  applyCropToAll(source) {
    if (!source.crop) return
    get().pushHistory()
    const c = source.crop
    set(s => ({
      pages: s.pages.map(p => {
        // Only pages with a compatible box get the same window; others are scaled
        // proportionally so the crop stays meaningful on mixed-size documents.
        const sx = p.baseW / source.baseW
        const sy = p.baseH / source.baseH
        return { ...p, crop: { x: c.x * sx, y: c.y * sy, w: c.w * sx, h: c.h * sy } }
      }),
    }))
  },

  addAnnotation(a) {
    get().pushHistory()
    // Stamped here rather than at each call site, so every way of creating an
    // object — toolbar, paste, signature, dragging on the page — records it.
    const stamped = a.initial ? a : ({ ...a, initial: { w: a.w, h: a.h } } as Annotation)
    set(s => ({ annotations: [...s.annotations, stamped], selectedAnnIds: [stamped.id] }))
  },

  updateAnnotation(id, patch) {
    set(s => ({
      annotations: s.annotations.map(a => (a.id === id ? ({ ...a, ...patch } as Annotation) : a)),
    }))
  },

  updateSelected(patch) {
    const ids = get().selectedAnnIds
    if (!ids.length) return
    set(s => ({
      annotations: s.annotations.map(a => (ids.includes(a.id) ? ({ ...a, ...patch } as Annotation) : a)),
    }))
  },

  deleteAnnotations(ids) {
    if (!ids.length) return
    get().pushHistory()
    set(s => ({
      annotations: s.annotations.filter(a => !ids.includes(a.id)),
      selectedAnnIds: [],
    }))
  },

  duplicateAnnotations(ids) {
    if (!ids.length) return
    get().pushHistory()
    set(s => {
      const copies = s.annotations
        .filter(a => ids.includes(a.id))
        .map(a => ({ ...a, id: uid('an'), x: a.x + 12, y: a.y + 12 }) as Annotation)
      return { annotations: [...s.annotations, ...copies], selectedAnnIds: copies.map(c => c.id) }
    })
  },

  reorderAnnotation(id, dir) {
    get().pushHistory()
    set(s => {
      const arr = [...s.annotations]
      const i = arr.findIndex(a => a.id === id)
      if (i < 0) return {}
      const [item] = arr.splice(i, 1)
      const to =
        dir === 'front' ? arr.length
        : dir === 'back' ? 0
        : dir === 'forward' ? Math.min(arr.length, i + 1)
        : Math.max(0, i - 1)
      arr.splice(to, 0, item)
      return { annotations: arr }
    })
  },

  setTool: t => set({
    tool: t,
    // Leaving the crop tool has to drop its target as well, or the page stays in
    // crop mode behind whatever tool was picked next.
    cropTarget: t === 'crop' ? get().cropTarget : null,
    selectedAnnIds: t === 'select' ? get().selectedAnnIds : [],
  }),
  setStyle: p => set(s => ({ style: { ...s.style, ...p } })),
  select: ids => set({ selectedAnnIds: ids }),
  selectPages: ids => set({ selectedPageIds: ids }),
  setActivePage: id => set({ activePageId: id }),
  setZoom: (z, fit = false) => set({ zoom: Math.min(6, Math.max(0.15, z)), fitWidth: fit }),
  setKeepAspect: v => set({ keepAspect: v }),
  setCropTarget: id => set({ cropTarget: id, tool: id ? 'crop' : 'select' }),
  setDragging: id => set({ draggingAnnId: id }),
}))

export const canUndo = (s: Editor) => s.past.length > 0
export const canRedo = (s: Editor) => s.future.length > 0
