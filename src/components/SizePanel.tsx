import { useEditor } from '../store'
import type { Annotation } from '../types'
import { MIN_SIZE, aspectOf, canReset, naturalBox, setBox } from '../lib/transform'
import { Link, Reset, Unlink } from './Icons'

const round = (n: number) => Math.round(n * 10) / 10

/** Keeps the sign, so a line dragged right-to-left does not flip when retyped. */
const applySign = (value: number, reference: number) =>
  (reference < 0 ? -1 : 1) * Math.max(MIN_SIZE, Math.abs(value))

/**
 * Numeric size and position for the selected object, with an aspect-ratio lock
 * and a reset back to its natural proportions.
 */
export function SizePanel() {
  const ann = useEditor(s => {
    const found = s.annotations.find(a => s.selectedAnnIds.includes(a.id))
    return (found as Annotation | undefined) ?? null
  })
  const assets = useEditor(s => s.assets)
  const keepAspect = useEditor(s => s.keepAspect)
  const setKeepAspect = useEditor(s => s.setKeepAspect)
  const updateAnnotation = useEditor(s => s.updateAnnotation)
  const pushHistory = useEditor(s => s.pushHistory)

  if (!ann) return null

  const natural = naturalBox(ann, assets)
  const resettable = canReset(ann, assets)
  const isLine = ann.type === 'line' || ann.type === 'arrow'

  const setDimension = (axis: 'w' | 'h', raw: number) => {
    if (!Number.isFinite(raw)) return
    pushHistory()
    const next = applySign(raw, ann[axis])
    const ratio = aspectOf(ann)

    if (keepAspect && ratio && !isLine) {
      const other = axis === 'w'
        ? applySign(Math.abs(next) / ratio, ann.h)
        : applySign(Math.abs(next) * ratio, ann.w)
      updateAnnotation(ann.id, setBox(ann, axis === 'w' ? { w: next, h: other } : { h: next, w: other }))
      return
    }
    updateAnnotation(ann.id, setBox(ann, { [axis]: next }))
  }

  const setPosition = (axis: 'x' | 'y', raw: number) => {
    if (!Number.isFinite(raw)) return
    pushHistory()
    const delta = raw - ann[axis]
    updateAnnotation(ann.id, setBox(ann, { [axis]: ann[axis] + delta }))
  }

  const reset = () => {
    if (!natural) return
    pushHistory()
    updateAnnotation(ann.id, setBox(ann, natural))
  }

  const resetLabel = ann.type === 'text'
    ? 'Volver al ancho inicial y ajustar la altura al contenido'
    : 'Volver al tamaño que tenía al insertarlo'

  return (
    <div className="size-panel">
      <div className="panel-head">
        <span>Tamaño y posición</span>
        <span className="unit">pt</span>
      </div>

      <div className="size-grid">
        <label className="size-field">
          <span>{isLine ? 'Δ X' : 'Ancho'}</span>
          <input
            className="input" type="number" step={1}
            value={round(ann.w)}
            onChange={e => setDimension('w', e.currentTarget.valueAsNumber)}
          />
        </label>

        <button
          className={`chip lock${keepAspect ? ' on' : ''}`}
          title={keepAspect
            ? 'Relación de aspecto bloqueada (Shift la invierte mientras arrastras)'
            : 'Relación de aspecto libre'}
          aria-pressed={keepAspect}
          onClick={() => setKeepAspect(!keepAspect)}
        >
          {keepAspect ? <Link size={15} /> : <Unlink size={15} />}
        </button>

        <label className="size-field">
          <span>{isLine ? 'Δ Y' : 'Alto'}</span>
          <input
            className="input" type="number" step={1}
            value={round(ann.h)}
            onChange={e => setDimension('h', e.currentTarget.valueAsNumber)}
          />
        </label>

        <label className="size-field">
          <span>X</span>
          <input
            className="input" type="number" step={1}
            value={round(ann.x)}
            onChange={e => setPosition('x', e.currentTarget.valueAsNumber)}
          />
        </label>

        <span />

        <label className="size-field">
          <span>Y</span>
          <input
            className="input" type="number" step={1}
            value={round(ann.y)}
            onChange={e => setPosition('y', e.currentTarget.valueAsNumber)}
          />
        </label>
      </div>

      <button
        className="btn size-reset"
        disabled={!resettable}
        title={
          resettable ? resetLabel
          : natural ? 'Ya está en su tamaño inicial'
          : 'Este objeto no guarda un tamaño inicial al que volver'
        }
        onClick={reset}
      >
        <Reset size={15} /> Restablecer
      </button>
    </div>
  )
}
