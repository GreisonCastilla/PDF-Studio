import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useEditor } from '../store'
import type { Annotation, DrawAnn, TextAnn } from '../types'
import {
  ArrowIcon, Circle, Eye, EyeOff, ImageIcon, LineIcon, Lock, Marker, Pen,
  Square, Trash, TypeIcon, Unlock,
} from './Icons'

const ICONS: Record<Annotation['type'], (p: { size?: number }) => React.ReactElement> = {
  text: TypeIcon, image: ImageIcon, rect: Square, ellipse: Circle,
  line: LineIcon, arrow: ArrowIcon, draw: Pen, highlight: Marker,
}

const NAMES: Record<Annotation['type'], string> = {
  text: 'Texto', image: 'Imagen', rect: 'Rectángulo', ellipse: 'Elipse',
  line: 'Línea', arrow: 'Flecha', draw: 'Trazo', highlight: 'Resaltado',
}

function label(a: Annotation): string {
  if (a.type === 'text') {
    const text = (a as TextAnn).text.trim().replace(/\s+/g, ' ')
    return text ? (text.length > 28 ? `${text.slice(0, 28)}…` : text) : 'Texto vacío'
  }
  if (a.type === 'draw') {
    const strokes = (a as DrawAnn).strokes.length
    return strokes > 3 ? 'Firma o trazo' : NAMES.draw
  }
  return NAMES[a.type]
}

/**
 * The objects on the current page, topmost first — the order they are painted
 * in, reversed, which is how every layer list reads.
 */
export function ObjectsPanel() {
  const activePageId = useEditor(s => s.activePageId)
  const pageNumber = useEditor(s => s.pages.findIndex(p => p.id === activePageId) + 1)
  const items = useEditor(useShallow(s => s.annotations.filter(a => a.pageId === activePageId)))
  const selectedAnnIds = useEditor(useShallow(s => s.selectedAnnIds))

  const select = useEditor(s => s.select)
  const toggleAnnotation = useEditor(s => s.toggleAnnotation)
  const deleteAnnotations = useEditor(s => s.deleteAnnotations)
  const reorderPageAnnotations = useEditor(s => s.reorderPageAnnotations)

  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropAt, setDropAt] = useState<number | null>(null)

  // Topmost first on screen; the store keeps the painting order.
  const stack = [...items].reverse()

  const commitOrder = (from: number, to: number) => {
    const next = [...stack]
    const [moved] = next.splice(from, 1)
    next.splice(from < to ? to - 1 : to, 0, moved)
    if (activePageId) reorderPageAnnotations(activePageId, next.reverse().map(a => a.id))
  }

  const focus = (a: Annotation) => {
    select([a.id])
    document.querySelector(`[data-ann="${a.id}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  return (
    <div className="objects-panel">
      <div className="panel-head">
        <span>Objetos{pageNumber > 0 ? ` · pág. ${pageNumber}` : ''}</span>
        <span className="unit">{stack.length}</span>
      </div>

      {stack.length === 0 ? (
        <p className="objects-empty">Nada en esta página todavía.</p>
      ) : (
        <ul className="objects-list" onDragLeave={() => setDropAt(null)}>
          {stack.map((a, i) => {
            const Icon = ICONS[a.type]
            return (
              <li
                key={a.id}
                className={
                  `object-row${selectedAnnIds.includes(a.id) ? ' selected' : ''}` +
                  `${a.hidden ? ' hidden' : ''}${dropAt === i ? ' drop-before' : ''}` +
                  `${dropAt === i + 1 && i === stack.length - 1 ? ' drop-after' : ''}`
                }
                draggable
                onClick={() => focus(a)}
                onDragStart={() => setDragIndex(i)}
                onDragOver={e => {
                  e.preventDefault()
                  const r = e.currentTarget.getBoundingClientRect()
                  setDropAt(e.clientY < r.top + r.height / 2 ? i : i + 1)
                }}
                onDrop={e => {
                  e.preventDefault()
                  if (dragIndex !== null && dropAt !== null) commitOrder(dragIndex, dropAt)
                  setDragIndex(null)
                  setDropAt(null)
                }}
                onDragEnd={() => { setDragIndex(null); setDropAt(null) }}
              >
                <span className="object-icon"><Icon size={15} /></span>
                <span className="object-label" title={label(a)}>{label(a)}</span>
                <button
                  className="mini"
                  title={a.hidden ? 'Mostrar' : 'Ocultar'}
                  onClick={e => { e.stopPropagation(); toggleAnnotation(a.id, 'hidden') }}
                >
                  {a.hidden ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
                <button
                  className="mini"
                  title={a.locked ? 'Desbloquear' : 'Bloquear'}
                  onClick={e => { e.stopPropagation(); toggleAnnotation(a.id, 'locked') }}
                >
                  {a.locked ? <Lock size={14} /> : <Unlock size={14} />}
                </button>
                <button
                  className="mini"
                  title="Eliminar"
                  onClick={e => { e.stopPropagation(); deleteAnnotations([a.id]) }}
                >
                  <Trash size={14} />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
