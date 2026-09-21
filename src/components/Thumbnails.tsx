import { useEffect, useRef, useState } from 'react'
import { useEditor } from '../store'
import type { PageItem } from '../types'
import { renderPage } from '../lib/pdfjs'
import { displaySize } from '../lib/geometry'
import { Copy, CropIcon, Plus, RotateCw, Trash } from './Icons'
import { TextPanel } from './TextPanel'
import { scrollToPage } from '../lib/scroll'

const THUMB_W = 150

function Thumb({ item, index }: { item: PageItem; index: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const selected = useEditor(
    s => s.selectedPageIds.includes(item.id) || s.activePageId === item.id,
  )
  const { movePage, rotatePages, deletePages, duplicatePages, selectPages, setActivePage, setCropTarget } =
    useEditor.getState()
  const [dropSide, setDropSide] = useState<'before' | 'after' | null>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const { w } = displaySize(item)
    const handle = renderPage(canvas, item, THUMB_W / w)
    return () => handle.cancel()
  }, [item])

  const focus = () => {
    setActivePage(item.id)
    selectPages([item.id])
    scrollToPage(item.id, 'start')
  }

  return (
    <div
      className={`thumb${selected ? ' selected' : ''}${dropSide ? ` drop-${dropSide}` : ''}`}
      draggable
      onClick={focus}
      onDragStart={e => e.dataTransfer.setData('text/page-index', String(index))}
      onDragOver={e => {
        e.preventDefault()
        const r = e.currentTarget.getBoundingClientRect()
        setDropSide(e.clientY < r.top + r.height / 2 ? 'before' : 'after')
      }}
      onDragLeave={() => setDropSide(null)}
      onDrop={e => {
        e.preventDefault()
        const from = Number(e.dataTransfer.getData('text/page-index'))
        setDropSide(null)
        if (Number.isNaN(from)) return
        let to = dropSide === 'after' ? index + 1 : index
        if (from < to) to -= 1
        movePage(from, to)
      }}
    >
      <canvas ref={ref} />
      <div className="thumb-bar">
        <span>{index + 1}</span>
        <div className="thumb-actions">
          <button className="mini" title="Girar 90°" onClick={e => { e.stopPropagation(); rotatePages([item.id], 90) }}><RotateCw size={14} /></button>
          <button className="mini" title="Recortar" onClick={e => { e.stopPropagation(); focus(); setCropTarget(item.id) }}><CropIcon size={14} /></button>
          <button className="mini" title="Duplicar" onClick={e => { e.stopPropagation(); duplicatePages([item.id]) }}><Copy size={14} /></button>
          <button className="mini" title="Eliminar" onClick={e => { e.stopPropagation(); deletePages([item.id]) }}><Trash size={14} /></button>
        </div>
      </div>
    </div>
  )
}

export function Thumbnails() {
  const pages = useEditor(s => s.pages)
  const insertBlankPage = useEditor(s => s.insertBlankPage)

  return (
    <aside className="panel panel-left">
      <div className="panel-head">
        <span>Páginas · {pages.length}</span>
        <button
          className="mini"
          title="Insertar página en blanco al final"
          onClick={() => void insertBlankPage(pages.length - 1)}
        >
          <Plus size={14} />
        </button>
      </div>
      <div className="panel-body">
        {pages.map((p, i) => <Thumb key={p.id} item={p} index={i} />)}
      </div>
      <TextPanel />
    </aside>
  )
}
