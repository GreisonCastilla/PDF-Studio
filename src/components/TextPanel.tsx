import { useEditor } from '../store'
import type { TextAnn } from '../types'
import { cssMeasure, layoutText } from '../lib/text'

/**
 * Shows — and edits — the contents of the selected text box from the side panel.
 * Handy for long passages, and as a keyboard-friendly alternative to editing in
 * place on the page.
 */
export function TextPanel() {
  const ann = useEditor(s => {
    const found = s.annotations.find(a => s.selectedAnnIds.includes(a.id) && a.type === 'text')
    return (found as TextAnn | undefined) ?? null
  })
  const updateAnnotation = useEditor(s => s.updateAnnotation)
  const pushHistory = useEditor(s => s.pushHistory)

  if (!ann) return null

  const commit = (text: string) => {
    // Keep the box tall enough for the wrapped result, exactly as the canvas editor does.
    const lines = layoutText({ ...ann, text }, cssMeasure({ ...ann, text })).lines.length
    updateAnnotation(ann.id, {
      text,
      h: Math.max(ann.fontSize * ann.lineHeight, lines * ann.fontSize * ann.lineHeight),
    })
  }

  const chars = ann.text.length
  const words = ann.text.trim() ? ann.text.trim().split(/\s+/).length : 0

  return (
    <div className="text-panel">
      <div className="panel-head">
        <span>Texto seleccionado</span>
      </div>
      <div style={{ padding: 10 }}>
        <textarea
          className="input text-panel-area"
          value={ann.text}
          placeholder="Escribe aquí…"
          onFocus={pushHistory}
          onChange={e => commit(e.target.value)}
          onKeyDown={e => e.stopPropagation()}
        />
        <div className="text-panel-meta">
          <span>{words} palabra{words === 1 ? '' : 's'} · {chars} carácter{chars === 1 ? '' : 'es'}</span>
          <span>{ann.fontSize} pt</span>
        </div>
      </div>
    </div>
  )
}
