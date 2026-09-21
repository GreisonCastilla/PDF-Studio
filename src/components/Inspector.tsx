import { useEditor } from '../store'
import type { Annotation, DrawAnn, FontKey, ShapeAnn, TextAnn } from '../types'
import { FONTS } from '../lib/text'
import { Back, Copy, Front, Lock, Trash } from './Icons'

const has = (a: Annotation | undefined, ...kinds: Annotation['type'][]) =>
  !!a && kinds.includes(a.type)

export function Inspector() {
  const {
    annotations, selectedAnnIds, style, setStyle, updateSelected, pushHistory,
    deleteAnnotations, duplicateAnnotations, reorderAnnotation, pages, activePageId, rotatePages,
  } = useEditor()

  const sel = annotations.filter(a => selectedAnnIds.includes(a.id))
  const one = sel[0] as Annotation | undefined
  const page = pages.find(p => p.id === activePageId)

  /** Writes to the selection when there is one, otherwise to the tool defaults. */
  const apply = (patch: Record<string, unknown>, styleKey?: Partial<typeof style>) => {
    if (sel.length) { pushHistory(); updateSelected(patch) }
    if (styleKey) setStyle(styleKey)
  }

  const strokeColor = (one as ShapeAnn | undefined)?.stroke ?? style.stroke
  const strokeWidth = (one as ShapeAnn | undefined)?.strokeWidth ?? style.strokeWidth
  const fill = (one as ShapeAnn | undefined)?.fill ?? style.fill
  const opacity = one?.opacity ?? style.opacity
  const text = one?.type === 'text' ? (one as TextAnn) : null

  const showStroke = !one || has(one, 'rect', 'ellipse', 'line', 'arrow', 'draw', 'highlight')
  const showFill = !one || has(one, 'rect', 'ellipse')

  return (
    <aside className="panel panel-right">
      <div className="panel-head">
        <span>{sel.length ? `Selección · ${sel.length}` : 'Estilo por defecto'}</span>
      </div>
      <div className="panel-body">
        {text && (
          <>
            <div className="field">
              <label>Tipografía</label>
              <select
                className="input"
                value={text.font}
                onChange={e => apply({ font: e.target.value as FontKey }, { font: e.target.value as FontKey })}
              >
                {(Object.keys(FONTS) as FontKey[]).map(k => (
                  <option key={k} value={k}>{FONTS[k].label}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Tamaño · {text.fontSize} pt</label>
              <input
                type="range" min={6} max={96} step={1} value={text.fontSize}
                onChange={e => apply({ fontSize: Number(e.target.value) }, { fontSize: Number(e.target.value) })}
              />
            </div>
            <div className="field">
              <label>Estilo</label>
              <div className="chip-row">
                <button className={`chip${text.bold ? ' on' : ''}`} style={{ fontWeight: 700 }}
                  onClick={() => apply({ bold: !text.bold }, { bold: !text.bold })}>B</button>
                <button className={`chip${text.italic ? ' on' : ''}`} style={{ fontStyle: 'italic' }}
                  onClick={() => apply({ italic: !text.italic }, { italic: !text.italic })}>I</button>
                {(['left', 'center', 'right'] as const).map(al => (
                  <button key={al} className={`chip${text.align === al ? ' on' : ''}`}
                    onClick={() => apply({ align: al })}>
                    {al === 'left' ? '⯇' : al === 'center' ? '≡' : '⯈'}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <label>Interlineado · {text.lineHeight.toFixed(2)}</label>
              <input type="range" min={0.9} max={2.2} step={0.05} value={text.lineHeight}
                onChange={e => apply({ lineHeight: Number(e.target.value) })} />
            </div>
            <div className="field">
              <label>Color del texto</label>
              <div className="row">
                <input type="color" value={text.color}
                  onChange={e => apply({ color: e.target.value }, { color: e.target.value })} />
                <input className="input" value={text.color}
                  onChange={e => apply({ color: e.target.value }, { color: e.target.value })} />
              </div>
            </div>
          </>
        )}

        {showStroke && (
          <>
            <div className="field">
              <label>Trazo</label>
              <div className="row">
                <input type="color" value={strokeColor}
                  onChange={e => apply({ stroke: e.target.value }, { stroke: e.target.value })} />
                <input className="input" value={strokeColor}
                  onChange={e => apply({ stroke: e.target.value }, { stroke: e.target.value })} />
              </div>
            </div>
            <div className="field">
              <label>Grosor · {strokeWidth} pt</label>
              <input type="range" min={0.5} max={40} step={0.5} value={strokeWidth}
                onChange={e => apply({ strokeWidth: Number(e.target.value) }, { strokeWidth: Number(e.target.value) })} />
            </div>
          </>
        )}

        {showFill && (
          <div className="field">
            <label>Relleno</label>
            <div className="row">
              <input type="color" value={fill ?? '#ffffff'}
                onChange={e => apply({ fill: e.target.value }, { fill: e.target.value })} />
              <button className={`chip${fill ? '' : ' on'}`}
                onClick={() => apply({ fill: null }, { fill: null })}>Sin relleno</button>
            </div>
          </div>
        )}

        <div className="field">
          <label>Opacidad · {Math.round(opacity * 100)}%</label>
          <input type="range" min={0.05} max={1} step={0.05} value={opacity}
            onChange={e => apply({ opacity: Number(e.target.value) }, { opacity: Number(e.target.value) })} />
        </div>

        {sel.length > 0 && (
          <div className="field">
            <label>Objeto</label>
            <div className="chip-row">
              <button className="chip" title="Traer al frente"
                onClick={() => reorderAnnotation(sel[0].id, 'front')}><Front size={15} /></button>
              <button className="chip" title="Enviar al fondo"
                onClick={() => reorderAnnotation(sel[0].id, 'back')}><Back size={15} /></button>
              <button className="chip" title="Duplicar"
                onClick={() => duplicateAnnotations(selectedAnnIds)}><Copy size={15} /></button>
              <button className={`chip${one?.locked ? ' on' : ''}`} title="Bloquear"
                onClick={() => apply({ locked: !one?.locked })}><Lock size={15} /></button>
              <button className="chip" title="Eliminar"
                onClick={() => deleteAnnotations(selectedAnnIds)}><Trash size={15} /></button>
            </div>
          </div>
        )}

        {one && (one.type === 'draw' || one.type === 'highlight') && (
          <p style={{ fontSize: 12, color: 'var(--muted)' }}>
            {(one as DrawAnn).strokes.length} trazo(s) vectoriales.
          </p>
        )}

        {page && (
          <div className="field" style={{ marginTop: 18, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
            <label>Página activa</label>
            <div className="chip-row">
              <button className="chip" onClick={() => rotatePages([page.id], -90)}>−90°</button>
              <button className="chip" onClick={() => rotatePages([page.id], 90)}>+90°</button>
              <button className="chip" onClick={() => rotatePages([page.id], 180)}>180°</button>
            </div>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
              {Math.round(page.baseW)} × {Math.round(page.baseH)} pt
              {page.crop && ' · recortada'}
            </p>
          </div>
        )}
      </div>
    </aside>
  )
}
