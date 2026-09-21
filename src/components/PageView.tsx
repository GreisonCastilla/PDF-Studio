import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useEditor } from '../store'
import type { Annotation, DrawAnn, PageItem, Point, Rect, TextAnn } from '../types'
import { renderPage } from '../lib/pdfjs'
import {
  displayRectToBase, displaySize, normalizeRect, pointsBounds, simplify, uid,
} from '../lib/geometry'
import { FONTS, cssMeasure, layoutText } from '../lib/text'
import { AnnotationNode } from './AnnotationNode'

interface Props { item: PageItem; index: number; scale: number }

type Handle = 'nw' | 'ne' | 'sw' | 'se' | 'p1' | 'p2'

type Drag =
  | { kind: 'create'; ann: Annotation; origin: Point }
  | { kind: 'ink'; ann: DrawAnn }
  | { kind: 'move'; origin: Point; base: Annotation }
  | { kind: 'resize'; origin: Point; base: Annotation; handle: Handle }
  | { kind: 'crop'; origin: Point }

const HANDLE_R = 4.5

function translate(a: Annotation, dx: number, dy: number): Annotation {
  const moved = { ...a, x: a.x + dx, y: a.y + dy }
  if (moved.type === 'draw' || moved.type === 'highlight') {
    moved.strokes = (a as DrawAnn).strokes.map(s => s.map(p => ({ x: p.x + dx, y: p.y + dy })))
  }
  return moved as Annotation
}

/** Applies a corner/endpoint drag, scaling ink points along with the box. */
function resize(base: Annotation, handle: Handle, dx: number, dy: number): Annotation {
  if ((base.type === 'line' || base.type === 'arrow') && (handle === 'p1' || handle === 'p2')) {
    return handle === 'p1'
      ? { ...base, x: base.x + dx, y: base.y + dy, w: base.w - dx, h: base.h - dy }
      : { ...base, w: base.w + dx, h: base.h + dy }
  }
  const left = handle === 'nw' || handle === 'sw'
  const top = handle === 'nw' || handle === 'ne'
  let { x, y, w, h } = base
  if (left) { x += dx; w -= dx } else { w += dx }
  if (top) { y += dy; h -= dy } else { h += dy }
  const min = 6
  if (Math.abs(w) < min) w = Math.sign(w || 1) * min
  if (Math.abs(h) < min) h = Math.sign(h || 1) * min

  const next = { ...base, x, y, w, h } as Annotation
  if (base.type === 'draw' || base.type === 'highlight') {
    const sx = base.w === 0 ? 1 : w / base.w
    const sy = base.h === 0 ? 1 : h / base.h
    ;(next as DrawAnn).strokes = (base as DrawAnn).strokes.map(s =>
      s.map(p => ({ x: x + (p.x - base.x) * sx, y: y + (p.y - base.y) * sy })),
    )
  }
  return next
}

export function PageView({ item, index, scale }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const dragRef = useRef<Drag | null>(null)
  const [draft, setDraft] = useState<Annotation | null>(null)
  const [cropDraft, setCropDraft] = useState<Rect | null>(null)
  const [editing, setEditing] = useState<string | null>(null)

  const size = useMemo(() => displaySize(item), [item])

  // Subscribing per page, with shallow comparison, keeps a drag on one page from
  // re-rendering every other page in a long document.
  const pageAnns = useEditor(useShallow(s => s.annotations.filter(a => a.pageId === item.id)))
  const selectedAnnIds = useEditor(useShallow(s => s.selectedAnnIds))
  const tool = useEditor(s => s.tool)
  const style = useEditor(s => s.style)
  const cropping = useEditor(s => s.cropTarget === item.id)

  const addAnnotation = useEditor(s => s.addAnnotation)
  const updateAnnotation = useEditor(s => s.updateAnnotation)
  const select = useEditor(s => s.select)
  const pushHistory = useEditor(s => s.pushHistory)
  const setCrop = useEditor(s => s.setCrop)
  const setCropTarget = useEditor(s => s.setCropTarget)
  const setTool = useEditor(s => s.setTool)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const handle = renderPage(canvas, item, scale)
    return () => handle.cancel()
  }, [item, scale])

  const toPt = useCallback((e: { clientX: number; clientY: number }): Point => {
    const r = svgRef.current!.getBoundingClientRect()
    return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale }
  }, [scale])

  const newAnnotation = (type: string, p: Point): Annotation | null => {
    const base = { id: uid('an'), pageId: item.id, x: p.x, y: p.y, w: 0, h: 0, opacity: style.opacity, locked: false }
    switch (type) {
      case 'rect':
      case 'ellipse':
        return { ...base, type, stroke: style.stroke, strokeWidth: style.strokeWidth, fill: style.fill }
      case 'line':
      case 'arrow':
        return { ...base, type, stroke: style.stroke, strokeWidth: style.strokeWidth }
      case 'draw':
        return { ...base, type: 'draw', strokes: [[p]], stroke: style.stroke, strokeWidth: style.strokeWidth }
      case 'highlight':
        return { ...base, type: 'highlight', strokes: [[p]], stroke: style.highlight, strokeWidth: Math.max(10, style.strokeWidth * 6), opacity: 1 }
      case 'text':
        return {
          ...base, type: 'text', w: Math.min(240, size.w - p.x), h: style.fontSize * 1.25,
          text: '', fontSize: style.fontSize, font: style.font,
          bold: style.bold, italic: style.italic, color: style.color,
          align: 'left', lineHeight: 1.25,
        }
      default:
        return null
    }
  }

  const onSurfaceDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    const p = toPt(e)
    svgRef.current?.setPointerCapture(e.pointerId)

    if (cropping) {
      dragRef.current = { kind: 'crop', origin: p }
      setCropDraft({ x: p.x, y: p.y, w: 0, h: 0 })
      return
    }
    if (tool === 'select') {
      select([])
      return
    }
    if (tool === 'text') {
      // Without this, the browser's own mousedown focus handling runs after React
      // has mounted the textarea and immediately blurs it again.
      e.preventDefault()
      const ann = newAnnotation('text', p)!
      addAnnotation(ann)
      setEditing(ann.id)
      setTool('select')
      return
    }
    const ann = newAnnotation(tool, p)
    if (!ann) return
    if (ann.type === 'draw' || ann.type === 'highlight') {
      dragRef.current = { kind: 'ink', ann: ann as DrawAnn }
    } else {
      dragRef.current = { kind: 'create', ann, origin: p }
    }
    setDraft(ann)
  }

  const onAnnDown = (ann: Annotation) => (e: React.PointerEvent) => {
    if (tool !== 'select' || ann.locked || e.button !== 0) return
    e.stopPropagation()
    svgRef.current?.setPointerCapture(e.pointerId)
    select([ann.id])
    pushHistory()
    dragRef.current = { kind: 'move', origin: toPt(e), base: ann }
  }

  const onHandleDown = (ann: Annotation, handle: Handle) => (e: React.PointerEvent) => {
    e.stopPropagation()
    svgRef.current?.setPointerCapture(e.pointerId)
    pushHistory()
    dragRef.current = { kind: 'resize', origin: toPt(e), base: ann, handle }
  }

  const onMove = (e: React.PointerEvent) => {
    const d = dragRef.current
    if (!d) return
    const p = toPt(e)

    if (d.kind === 'crop') {
      setCropDraft({ x: d.origin.x, y: d.origin.y, w: p.x - d.origin.x, h: p.y - d.origin.y })
      return
    }
    if (d.kind === 'ink') {
      const strokes = [...d.ann.strokes]
      strokes[strokes.length - 1] = [...strokes[strokes.length - 1], p]
      d.ann = { ...d.ann, strokes }
      setDraft(d.ann)
      return
    }
    if (d.kind === 'create') {
      let w = p.x - d.origin.x
      let h = p.y - d.origin.y
      if (e.shiftKey) {
        if (d.ann.type === 'line' || d.ann.type === 'arrow') {
          if (Math.abs(w) > Math.abs(h)) h = 0; else w = 0
        } else {
          const m = Math.max(Math.abs(w), Math.abs(h))
          w = Math.sign(w || 1) * m
          h = Math.sign(h || 1) * m
        }
      }
      d.ann = { ...d.ann, w, h } as Annotation
      setDraft(d.ann)
      return
    }
    const dx = p.x - d.origin.x
    const dy = p.y - d.origin.y
    if (d.kind === 'move') {
      updateAnnotation(d.base.id, translate(d.base, dx, dy))
    } else {
      updateAnnotation(d.base.id, resize(d.base, d.handle, dx, dy))
    }
  }

  const onUp = (e: React.PointerEvent) => {
    const d = dragRef.current
    dragRef.current = null
    svgRef.current?.releasePointerCapture(e.pointerId)
    if (!d) return

    if (d.kind === 'crop') {
      const r = cropDraft && normalizeRect(cropDraft)
      setCropDraft(r && r.w > 8 && r.h > 8 ? r : null)
      return
    }
    setDraft(null)

    if (d.kind === 'ink') {
      const strokes = d.ann.strokes.map(s => simplify(s, 0.8)).filter(s => s.length > 1)
      if (!strokes.length) return
      const b = pointsBounds(strokes, d.ann.strokeWidth / 2)
      addAnnotation({ ...d.ann, strokes, x: b.x, y: b.y, w: b.w, h: b.h })
      return
    }
    if (d.kind === 'create') {
      const a = d.ann
      const isLine = a.type === 'line' || a.type === 'arrow'
      if (Math.abs(a.w) < 3 && Math.abs(a.h) < 3) return
      addAnnotation(isLine ? a : ({ ...a, ...normalizeRect(a) } as Annotation))
      setTool('select')
    }
  }

  const applyCrop = () => {
    if (!cropDraft) return
    // Stored unrotated, so later rotations do not shift the window.
    setCrop(item.id, displayRectToBase(item, normalizeRect(cropDraft)))
    setCropDraft(null)
  }

  /** Leaving an untouched box behind would litter the document with invisible text. */
  const stopEditing = useCallback((id: string) => {
    setEditing(null)
    const ann = useEditor.getState().annotations.find(a => a.id === id)
    if (ann?.type === 'text' && !ann.text.trim()) {
      useEditor.setState(state => ({
        annotations: state.annotations.filter(a => a.id !== id),
        selectedAnnIds: state.selectedAnnIds.filter(sid => sid !== id),
      }))
    }
  }, [])

  const editingAnn = editing ? pageAnns.find(a => a.id === editing) as TextAnn | undefined : undefined
  const selectedHere = pageAnns.filter(a => selectedAnnIds.includes(a.id))

  return (
    <div className="page-wrap" data-page={item.id}>
      <div className="page-label">Página {index + 1}{item.crop ? ' · recortada' : ''}</div>
      <div
        className="page-shell"
        style={{ width: size.w * scale, height: size.h * scale }}
      >
        <canvas ref={canvasRef} />
        <svg
          ref={svgRef}
          className="page-overlay"
          width={size.w * scale}
          height={size.h * scale}
          viewBox={`0 0 ${size.w} ${size.h}`}
          onPointerDown={onSurfaceDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          style={{ cursor: tool === 'select' ? 'default' : 'crosshair' }}
        >
          <rect x={0} y={0} width={size.w} height={size.h} fill="transparent" />

          {pageAnns.map(a => a.id === editing ? null : (
            <AnnotationNode
              key={a.id}
              ann={a}
              selected={selectedAnnIds.includes(a.id)}
              onPointerDown={onAnnDown(a)}
              onDoubleClick={a.type === 'text' ? () => { select([a.id]); setEditing(a.id) } : undefined}
            />
          ))}

          {draft && <AnnotationNode ann={draft} selected={false} preview />}

          {!cropping && selectedHere.map(a => {
            const isLine = a.type === 'line' || a.type === 'arrow'
            const pts: [Handle, number, number][] = isLine
              ? [['p1', a.x, a.y], ['p2', a.x + a.w, a.y + a.h]]
              : (() => {
                  const b = normalizeRect(a)
                  return [
                    ['nw', b.x, b.y], ['ne', b.x + b.w, b.y],
                    ['sw', b.x, b.y + b.h], ['se', b.x + b.w, b.y + b.h],
                  ] as [Handle, number, number][]
                })()
            return pts.map(([h, cx, cy]) => (
              <rect
                key={`${a.id}-${h}`}
                className={`handle ${h}`}
                x={cx - HANDLE_R} y={cy - HANDLE_R}
                width={HANDLE_R * 2} height={HANDLE_R * 2}
                onPointerDown={onHandleDown(a, h)}
              />
            ))
          })}

          {cropping && cropDraft && (() => {
            const r = normalizeRect(cropDraft)
            return (
              <g pointerEvents="none">
                <path
                  className="crop-veil"
                  fillRule="evenodd"
                  d={`M0 0H${size.w}V${size.h}H0Z M${r.x} ${r.y}H${r.x + r.w}V${r.y + r.h}H${r.x}Z`}
                />
                <rect x={r.x} y={r.y} width={r.w} height={r.h} fill="none" stroke="#fff" strokeWidth={1} />
              </g>
            )
          })()}
        </svg>

        {editingAnn && (
          <TextEditor
            ann={editingAnn}
            scale={scale}
            onChange={patch => updateAnnotation(editingAnn.id, patch)}
            onClose={() => stopEditing(editingAnn.id)}
          />
        )}

        {cropping && (
          <div style={{
            position: 'absolute', bottom: -46, left: 0, display: 'flex', gap: 8,
          }}>
            <button className="btn primary" disabled={!cropDraft} onClick={applyCrop}>Aplicar recorte</button>
            {item.crop && <button className="btn" onClick={() => { setCrop(item.id, null); setCropDraft(null) }}>Quitar recorte</button>}
            <button className="btn" onClick={() => { setCropDraft(null); setCropTarget(null) }}>Cancelar</button>
          </div>
        )}
      </div>
    </div>
  )
}

/** Inline editor; the box grows to fit so the preview matches the exported text. */
function TextEditor({
  ann, scale, onChange, onClose,
}: {
  ann: TextAnn
  scale: number
  onChange: (p: Partial<TextAnn>) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    // One frame later: focusing inside the same tick loses the race against the
    // browser's default mousedown focus handling.
    const id = requestAnimationFrame(() => {
      const el = ref.current
      if (!el) return
      el.focus()
      el.select()
    })
    return () => cancelAnimationFrame(id)
  }, [])

  const commit = (text: string) => {
    const lines = layoutText({ ...ann, text }, cssMeasure({ ...ann, text })).lines.length
    onChange({ text, h: Math.max(ann.fontSize * ann.lineHeight, lines * ann.fontSize * ann.lineHeight) })
  }

  return (
    <textarea
      ref={ref}
      className="text-edit"
      value={ann.text}
      placeholder="Escribe aquí…"
      onChange={e => commit(e.target.value)}
      onBlur={onClose}
      onPointerDown={e => e.stopPropagation()}
      onKeyDown={e => {
        e.stopPropagation()
        if (e.key === 'Escape') { e.preventDefault(); onClose() }
      }}
      style={{
        left: ann.x * scale,
        top: ann.y * scale,
        width: Math.max(40, ann.w * scale),
        height: Math.max(ann.fontSize * ann.lineHeight, ann.h) * scale + 4,
        fontSize: ann.fontSize * scale,
        lineHeight: `${ann.lineHeight}`,
        fontFamily: FONTS[ann.font].css,
        textAlign: ann.align,
        fontWeight: ann.bold ? 700 : 400,
        fontStyle: ann.italic ? 'italic' : 'normal',
        color: ann.color,
      }}
    />
  )
}
