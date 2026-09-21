import { useRef, useState } from 'react'
import { canRedo, canUndo, useEditor } from '../store'
import type { Tool } from '../types'
import { buildPdf, download } from '../lib/export'
import { fileToAsset } from '../lib/images'
import { insertImage } from '../lib/insert'
import {
  ArrowIcon, Circle, CropIcon, Cursor, Download, FilePlus, ImageIcon, LineIcon,
  Marker, Moon, Pen, RotateCcw, RotateCw, Scissors, SignIcon, Square, Sun,
  Trash, TypeIcon, Undo, Redo, ZoomIn, ZoomOut,
} from './Icons'

const TOOLS: { id: Tool; label: string; key: string; Icon: (p: { size?: number }) => React.ReactElement }[] = [
  { id: 'select', label: 'Seleccionar', key: 'V', Icon: Cursor },
  { id: 'text', label: 'Texto', key: 'T', Icon: TypeIcon },
  { id: 'rect', label: 'Rectángulo', key: 'R', Icon: Square },
  { id: 'ellipse', label: 'Círculo', key: 'O', Icon: Circle },
  { id: 'line', label: 'Línea', key: 'L', Icon: LineIcon },
  { id: 'arrow', label: 'Flecha', key: 'A', Icon: ArrowIcon },
  { id: 'draw', label: 'Lápiz', key: 'P', Icon: Pen },
  { id: 'highlight', label: 'Resaltador', key: 'H', Icon: Marker },
]

export function Toolbar({ onSign }: { onSign: () => void }) {
  const store = useEditor()
  const {
    tool, setTool, pages, selectedPageIds, activePageId, zoom, setZoom,
    undo, redo, importFiles, addAsset, docName,
    rotatePages, deletePages, setCropTarget, setBusy, insertBlankPage, cropTarget,
  } = store
  const imageInput = useRef<HTMLInputElement>(null)
  const pdfInput = useRef<HTMLInputElement>(null)
  const [dark, setDark] = useState(
    () => document.documentElement.dataset.theme === 'dark',
  )

  const targetPages = selectedPageIds.length
    ? selectedPageIds
    : activePageId ? [activePageId] : []

  const onImage = async (file: File | undefined) => {
    if (!file) return
    const asset = await fileToAsset(file)
    addAsset(asset)
    insertImage(asset)
  }

  const save = async (only?: string[]) => {
    setBusy('Generando PDF…')
    try {
      const bytes = await buildPdf(store, only)
      download(bytes, only ? `${docName.replace(/\.pdf$/i, '')}-extracto` : docName)
    } catch (err) {
      alert(`No se pudo exportar: ${(err as Error).message}`)
    } finally {
      setBusy(null)
    }
  }

  const toggleTheme = () => {
    const next = dark ? 'light' : 'dark'
    document.documentElement.dataset.theme = next
    localStorage.setItem('pdf-studio.theme', next)
    setDark(!dark)
  }

  return (
    <header className="topbar">
      <div className="brand"><span className="brand-dot" /> PDF Studio</div>

      <div className="tool-group">
        {TOOLS.map(({ id, label, key, Icon }) => (
          <button
            key={id}
            className={`btn icon${tool === id ? ' active' : ''}`}
            title={`${label} (${key})`}
            onClick={() => setTool(id)}
          >
            <Icon />
          </button>
        ))}
        <button className="btn icon" title="Imagen (I)" onClick={() => imageInput.current?.click()}>
          <ImageIcon />
        </button>
        <button className="btn icon" title="Firma (S)" onClick={onSign}>
          <SignIcon />
        </button>
        <button
          className={`btn icon${tool === 'crop' ? ' active' : ''}`}
          title="Recortar página (C)"
          disabled={!activePageId}
          onClick={() => setCropTarget(cropTarget === activePageId ? null : activePageId)}
        >
          <CropIcon />
        </button>
      </div>

      <div className="sep" />

      <button className="btn icon" title="Deshacer (Ctrl+Z)" disabled={!canUndo(store)} onClick={undo}><Undo /></button>
      <button className="btn icon" title="Rehacer (Ctrl+Y)" disabled={!canRedo(store)} onClick={redo}><Redo /></button>

      <div className="sep" />

      <button className="btn icon" title="Girar −90°" disabled={!targetPages.length}
        onClick={() => rotatePages(targetPages, -90)}><RotateCcw /></button>
      <button className="btn icon" title="Girar +90°" disabled={!targetPages.length}
        onClick={() => rotatePages(targetPages, 90)}><RotateCw /></button>
      <button className="btn icon danger" title="Eliminar página" disabled={!targetPages.length}
        onClick={() => deletePages(targetPages)}><Trash /></button>
      <button className="btn icon" title="Insertar página en blanco"
        disabled={!pages.length}
        onClick={() => void insertBlankPage(pages.findIndex(p => p.id === activePageId))}><FilePlus /></button>

      <div className="sep" />

      <button className="btn icon" title="Alejar" onClick={() => setZoom(zoom / 1.2)}><ZoomOut /></button>
      <button className="btn" title="Ajustar al ancho" onClick={() => setZoom(1, true)}>
        {Math.round(zoom * 100)}%
      </button>
      <button className="btn icon" title="Acercar" onClick={() => setZoom(zoom * 1.2)}><ZoomIn /></button>

      <div className="spacer" />

      <button className="btn icon" title={dark ? 'Tema claro' : 'Tema oscuro'} onClick={toggleTheme}>
        {dark ? <Sun /> : <Moon />}
      </button>
      <button className="btn" onClick={() => pdfInput.current?.click()}>Añadir PDF</button>
      <button className="btn" title="Exportar solo las páginas seleccionadas"
        disabled={!selectedPageIds.length}
        onClick={() => void save(selectedPageIds)}><Scissors /> Extraer</button>
      <button className="btn primary" disabled={!pages.length} onClick={() => void save()}>
        <Download /> Guardar PDF
      </button>

      <input ref={imageInput} type="file" accept="image/*" hidden
        onChange={e => { void onImage(e.target.files?.[0]); e.target.value = '' }} />
      <input ref={pdfInput} type="file" accept="application/pdf" multiple hidden
        onChange={e => { if (e.target.files) void importFiles(e.target.files); e.target.value = '' }} />
    </header>
  )
}
