import { useEffect, useRef, useState } from 'react'
import { useEditor } from '../store'
import type { DrawAnn, Point } from '../types'
import { displaySize, pointsBounds, simplify, strokeToPath, uid } from '../lib/geometry'
import { fileToAsset } from '../lib/images'
import { scrollToPage } from '../lib/scroll'
import { insertImage } from '../lib/insert'

const STORE_KEY = 'pdf-studio.signatures'
const TARGET_WIDTH = 180 // points on the page
/** The pad is drawn larger than life; the same factor scales the placed ink. */
const PAD_INK = 2

type Saved = { id: string; strokes: Point[][]; color: string }

function loadSaved(): Saved[] {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) ?? '[]') } catch { return [] }
}

/**
 * Signatures are captured as vectors rather than a bitmap: they stay crisp at
 * any zoom and export as real PDF paths instead of a pixelated stamp.
 */
export function SignaturePad({ onClose }: { onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const strokesRef = useRef<Point[][]>([])
  const drawing = useRef(false)
  const [color, setColor] = useState('#0b1b3a')
  const [width, setWidth] = useState(2.4)
  const [saved, setSaved] = useState<Saved[]>(loadSaved)
  const [empty, setEmpty] = useState(true)

  const { pages, activePageId, addAnnotation, addAsset } = useEditor()

  const repaint = () => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.lineCap = ctx.lineJoin = 'round'
    ctx.strokeStyle = color
    ctx.lineWidth = width * PAD_INK
    for (const s of strokesRef.current) {
      const path = new Path2D(strokeToPath(s))
      ctx.stroke(path)
    }
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const r = canvas.getBoundingClientRect()
    canvas.width = r.width
    canvas.height = r.height
    repaint()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(repaint, [color, width])

  const at = (e: React.PointerEvent): Point => {
    const r = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  const place = (strokes: Point[][], inkColor: string) => {
    const page = pages.find(p => p.id === activePageId) ?? pages[0]
    if (!page || !strokes.length) return
    const b = pointsBounds(strokes)
    const size = displaySize(page)
    const target = Math.min(TARGET_WIDTH, size.w * 0.5)
    // A near-vertical signature has no width to scale by, so fall back to height.
    const scale = b.w > 1 ? target / b.w : b.h > 1 ? target / b.h : 1
    const w = b.w * scale
    const h = b.h * scale
    const x = (size.w - w) / 2
    const y = size.h - h - 72 // a signature line height above the bottom margin

    const ann: DrawAnn = {
      id: uid('an'), pageId: page.id, type: 'draw',
      x, y, w, h, opacity: 1, locked: false,
      stroke: inkColor,
      strokeWidth: Math.max(0.5, width * PAD_INK * scale),
      strokes: strokes.map(s => s.map(p => ({
        x: x + (p.x - b.x) * scale,
        y: y + (p.y - b.y) * scale,
      }))),
    }
    addAnnotation(ann)
    scrollToPage(page.id)
    onClose()
  }

  const persist = () => {
    const entry: Saved = { id: uid('sig'), strokes: strokesRef.current, color }
    const next = [entry, ...saved].slice(0, 6)
    setSaved(next)
    localStorage.setItem(STORE_KEY, JSON.stringify(next))
  }

  const onUpload = async (file: File | undefined) => {
    if (!file) return
    const asset = await fileToAsset(file)
    addAsset(asset)
    insertImage(asset, { widthRatio: 0.5, maxWidth: TARGET_WIDTH, anchor: 'signature' })
    onClose()
  }

  return (
    <div className="modal-veil" onPointerDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h2>Firma</h2>
        <p className="hint">Dibuja con el ratón o el dedo. Se guarda como vector, así que no pierde calidad.</p>

        <canvas
          ref={canvasRef}
          className="sign-pad"
          onPointerDown={e => {
            drawing.current = true
            ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
            strokesRef.current = [...strokesRef.current, [at(e)]]
            setEmpty(false)
          }}
          onPointerMove={e => {
            if (!drawing.current) return
            const all = strokesRef.current
            all[all.length - 1] = [...all[all.length - 1], at(e)]
            repaint()
          }}
          onPointerUp={() => {
            drawing.current = false
            strokesRef.current = strokesRef.current.map(s => simplify(s, 0.7))
            repaint()
          }}
        />

        <div className="row" style={{ marginTop: 12 }}>
          <input type="color" value={color} onChange={e => setColor(e.target.value)} title="Color de tinta" />
          <input
            type="range" min={1} max={6} step={0.2} value={width}
            onChange={e => setWidth(Number(e.target.value))} title="Grosor"
          />
          <button className="btn" onClick={() => { strokesRef.current = []; setEmpty(true); repaint() }}>Borrar</button>
        </div>

        {saved.length > 0 && (
          <div className="field" style={{ marginTop: 12 }}>
            <label>Firmas guardadas</label>
            <div className="row" style={{ flexWrap: 'wrap' }}>
              {saved.map(sig => {
                const b = pointsBounds(sig.strokes)
                return (
                  <button
                    key={sig.id}
                    className="chip"
                    style={{ flex: '0 0 auto', width: 96, height: 44, padding: 2 }}
                    title="Insertar esta firma"
                    onClick={() => place(sig.strokes, sig.color)}
                  >
                    <svg viewBox={`${b.x} ${b.y} ${b.w || 1} ${b.h || 1}`} width="88" height="38">
                      {sig.strokes.map((s, i) => (
                        <path key={i} d={strokeToPath(s)} fill="none" stroke={sig.color}
                          strokeWidth={Math.max(1, b.w / 60)} strokeLinecap="round" />
                      ))}
                    </svg>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div className="modal-actions">
          <label className="btn">
            Subir imagen
            <input type="file" accept="image/*" hidden
              onChange={e => void onUpload(e.target.files?.[0])} />
          </label>
          <button className="btn" disabled={empty} onClick={persist}>Guardar firma</button>
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn primary" disabled={empty}
            onClick={() => place(strokesRef.current, color)}>Insertar</button>
        </div>
      </div>
    </div>
  )
}
