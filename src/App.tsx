import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useEditor } from './store'
import type { Tool } from './types'
import { displaySize } from './lib/geometry'
import { Toolbar } from './components/Toolbar'
import { Thumbnails } from './components/Thumbnails'
import { Inspector } from './components/Inspector'
import { PageView } from './components/PageView'
import { SignaturePad } from './components/SignaturePad'

const SHORTCUTS: Record<string, Tool> = {
  v: 'select', t: 'text', r: 'rect', o: 'ellipse',
  l: 'line', a: 'arrow', p: 'draw', h: 'highlight',
}

export default function App() {
  const store = useEditor()
  const { pages, busy, importFiles, selectedAnnIds, deleteAnnotations, undo, redo, setTool, zoom, fitWidth, setZoom } = store
  const stageRef = useRef<HTMLDivElement>(null)
  const [over, setOver] = useState(false)
  const [signing, setSigning] = useState(false)

  useLayoutEffect(() => {
    const el = stageRef.current
    if (!el || !fitWidth || !pages.length) return
    const fit = () => {
      const widest = Math.max(...pages.map(p => displaySize(p).w))
      const available = el.clientWidth - 48
      if (widest > 0 && available > 0) useEditor.setState({ zoom: Math.min(2.5, available / widest) })
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [pages, fitWidth])

  // The page the user is looking at becomes the active one. Without this,
  // inserting an image or a signature after scrolling would drop it on whichever
  // page was last clicked in the thumbnail strip.
  useEffect(() => {
    const el = stageRef.current
    if (!el || !pages.length) return
    const ratios = new Map<string, number>()
    const io = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.page
          if (id) ratios.set(id, entry.intersectionRatio)
        }
        let best: string | null = null
        let bestRatio = 0
        for (const [id, ratio] of ratios) {
          if (ratio > bestRatio) { bestRatio = ratio; best = id }
        }
        if (best && useEditor.getState().activePageId !== best) {
          useEditor.setState({ activePageId: best })
        }
      },
      { root: el, threshold: [0, 0.1, 0.25, 0.5, 0.75, 1] },
    )
    el.querySelectorAll('[data-page]').forEach(node => io.observe(node))
    return () => io.disconnect()
  }, [pages])

  useEffect(() => {
    const saved = localStorage.getItem('pdf-studio.theme')
    if (saved) document.documentElement.dataset.theme = saved
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.matches('input, textarea, select')) return
      const mod = e.ctrlKey || e.metaKey

      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        e.shiftKey ? redo() : undo()
        return
      }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return }
      if (mod) return

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedAnnIds.length) { e.preventDefault(); deleteAnnotations(selectedAnnIds) }
        return
      }
      if (e.key === 'Escape') { useEditor.setState({ selectedAnnIds: [], cropTarget: null, tool: 'select' }); return }

      const tool = SHORTCUTS[e.key.toLowerCase()]
      if (tool) setTool(tool)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedAnnIds, deleteAnnotations, undo, redo, setTool])

  // Ctrl + wheel zooms, like every other document editor.
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      setZoom(zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoom, setZoom])

  const drop = (e: React.DragEvent) => {
    e.preventDefault()
    setOver(false)
    if (e.dataTransfer.files.length) void importFiles(e.dataTransfer.files)
  }

  return (
    <div
      className="app"
      onDragOver={e => { e.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={drop}
    >
      <Toolbar onSign={() => setSigning(true)} />

      {pages.length === 0 ? (
        <div className="empty">
          <div className={`dropzone${over ? ' over' : ''}`}>
            <h1>Arrastra un PDF aquí</h1>
            <p>Todo se procesa en tu navegador: el archivo nunca se sube a ningún servidor.</p>
            <label className="btn primary">
              Abrir PDF
              <input type="file" accept="application/pdf" multiple hidden
                onChange={e => { if (e.target.files) void importFiles(e.target.files) }} />
            </label>
            <p style={{ marginTop: 22, fontSize: 12 }}>
              <span className="kbd">V</span> mover · <span className="kbd">T</span> texto ·{' '}
              <span className="kbd">R</span> rectángulo · <span className="kbd">O</span> círculo ·{' '}
              <span className="kbd">P</span> lápiz · <span className="kbd">Ctrl</span>+<span className="kbd">Z</span> deshacer
            </p>
          </div>
        </div>
      ) : (
        <>
          <Thumbnails />
          <main className="stage" ref={stageRef}>
            {pages.map((p, i) => <PageView key={p.id} item={p} index={i} scale={zoom} />)}
          </main>
          <Inspector />
        </>
      )}

      {signing && <SignaturePad onClose={() => setSigning(false)} />}
      {busy && <div className="toast">{busy}</div>}
    </div>
  )
}
