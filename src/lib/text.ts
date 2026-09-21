import type { FontKey, TextAnn } from '../types'

/**
 * The PDF base-14 fonts paired with metric-compatible web fonts, so what the
 * browser paints lines up with what pdf-lib writes.
 */
export const FONTS: Record<FontKey, { label: string; css: string; asc: number; desc: number }> = {
  helvetica: {
    label: 'Helvetica / Arial',
    css: "Arial, 'Liberation Sans', Helvetica, sans-serif",
    asc: 0.718, desc: 0.207,
  },
  times: {
    label: 'Times',
    css: "'Times New Roman', 'Liberation Serif', Times, serif",
    asc: 0.683, desc: 0.217,
  },
  courier: {
    label: 'Courier',
    css: "'Courier New', 'Liberation Mono', monospace",
    asc: 0.629, desc: 0.157,
  },
}

export type Measure = (text: string) => number

let ctx: CanvasRenderingContext2D | null = null
/** Browser-side text measurement used by the on-screen preview. */
export function cssMeasure(ann: TextAnn): Measure {
  ctx ??= document.createElement('canvas').getContext('2d')
  const f = FONTS[ann.font]
  const style = `${ann.italic ? 'italic ' : ''}${ann.bold ? 'bold ' : ''}${ann.fontSize}px ${f.css}`
  if (ctx) ctx.font = style
  return t => ctx?.measureText(t).width ?? t.length * ann.fontSize * 0.5
}

/** Greedy word wrap; long unbreakable words are split character by character. */
export function wrapText(text: string, maxWidth: number, measure: Measure): string[] {
  const out: string[] = []
  for (const paragraph of text.split('\n')) {
    if (paragraph === '') { out.push(''); continue }
    let line = ''
    for (const word of paragraph.split(/(\s+)/)) {
      if (word === '') continue
      const candidate = line + word
      if (line && measure(candidate) > maxWidth) {
        out.push(line.trimEnd())
        line = word.trimStart()
        while (measure(line) > maxWidth && line.length > 1) {
          let cut = line.length - 1
          while (cut > 1 && measure(line.slice(0, cut)) > maxWidth) cut--
          out.push(line.slice(0, cut))
          line = line.slice(cut)
        }
      } else {
        line = candidate
      }
    }
    out.push(line.trimEnd())
  }
  return out
}

export interface TextLayout { lines: string[]; baselines: number[]; widths: number[] }

/**
 * Lines plus their baseline offsets from the box top, in display points.
 * Both the SVG preview and the PDF exporter call this, which is what keeps the
 * two pixel-aligned.
 */
export function layoutText(ann: TextAnn, measure: Measure): TextLayout {
  const f = FONTS[ann.font]
  const lh = ann.fontSize * ann.lineHeight
  const first = (lh - (f.asc + f.desc) * ann.fontSize) / 2 + f.asc * ann.fontSize
  const lines = wrapText(ann.text, Math.max(8, ann.w), measure)
  return {
    lines,
    baselines: lines.map((_, i) => first + i * lh),
    widths: lines.map(measure),
  }
}

/** Horizontal offset of a line inside the box, honouring the alignment. */
export function lineOffset(ann: TextAnn, width: number): number {
  if (ann.align === 'center') return (ann.w - width) / 2
  if (ann.align === 'right') return ann.w - width
  return 0
}

export function textHeight(ann: TextAnn, lineCount: number): number {
  return Math.max(ann.fontSize * ann.lineHeight, lineCount * ann.fontSize * ann.lineHeight)
}

const REPLACEMENTS: Record<string, string> = {
  '‘': "'", '’': "'", '“': '"', '”': '"',
  '…': '...', '−': '-', ' ': ' ', '\t': '    ',
}

/**
 * The base-14 fonts are WinAnsi-encoded; anything outside that range makes
 * pdf-lib throw, so unsupported characters are folded or dropped on export.
 */
export function toWinAnsi(text: string): string {
  let out = ''
  for (const ch of text) {
    const mapped = REPLACEMENTS[ch] ?? ch
    for (const c of mapped) {
      const code = c.codePointAt(0)!
      if (code === 10 || (code >= 32 && code <= 126) || (code >= 160 && code <= 255)) out += c
      else if (code >= 0x2013 && code <= 0x2014) out += '-'
      else out += ''
    }
  }
  return out
}
