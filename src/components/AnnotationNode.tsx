import { memo } from 'react'
import type { Annotation, DrawAnn, ImageAnn, LineAnn, Rect, ShapeAnn, TextAnn } from '../types'
import { normalizeRect, strokeToPath } from '../lib/geometry'
import { FONTS, cssMeasure, layoutText, lineOffset } from '../lib/text'
import { useEditor } from '../store'

interface Props {
  ann: Annotation
  selected: boolean
  preview?: boolean
  onPointerDown?: (e: React.PointerEvent) => void
  onDoubleClick?: (e: React.MouseEvent) => void
}

function Shape({ a }: { a: ShapeAnn }) {
  const common = {
    stroke: a.stroke,
    strokeWidth: a.strokeWidth,
    fill: a.fill ?? 'none',
    fillOpacity: a.fill ? a.opacity : 0,
    strokeOpacity: a.opacity,
  }
  return a.type === 'rect'
    ? <rect x={a.x} y={a.y} width={a.w} height={a.h} {...common} />
    : <ellipse cx={a.x + a.w / 2} cy={a.y + a.h / 2} rx={Math.abs(a.w / 2)} ry={Math.abs(a.h / 2)} {...common} />
}

function LineShape({ a }: { a: LineAnn }) {
  const x2 = a.x + a.w
  const y2 = a.y + a.h
  const head: string[] = []
  if (a.type === 'arrow') {
    const angle = Math.atan2(a.h, a.w)
    const len = Math.max(8, a.strokeWidth * 4)
    for (const spread of [Math.PI * 0.82, -Math.PI * 0.82]) {
      head.push(`M ${x2} ${y2} L ${x2 + len * Math.cos(angle + spread)} ${y2 + len * Math.sin(angle + spread)}`)
    }
  }
  return (
    <g stroke={a.stroke} strokeWidth={a.strokeWidth} strokeOpacity={a.opacity} strokeLinecap="round" fill="none">
      <line x1={a.x} y1={a.y} x2={x2} y2={y2} />
      {head.map((d, i) => <path key={i} d={d} />)}
    </g>
  )
}

function Ink({ a }: { a: DrawAnn }) {
  return (
    <g
      stroke={a.stroke}
      strokeWidth={a.strokeWidth}
      strokeOpacity={a.opacity}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
      style={a.type === 'highlight' ? { mixBlendMode: 'multiply' } : undefined}
    >
      {a.strokes.map((s, i) => <path key={i} d={strokeToPath(s)} />)}
    </g>
  )
}

function TextBlock({ a }: { a: TextAnn }) {
  const measure = cssMeasure(a)
  const { lines, baselines, widths } = layoutText(a, measure)
  const f = FONTS[a.font]
  return (
    <g
      fill={a.color}
      fillOpacity={a.opacity}
      fontFamily={f.css}
      fontSize={a.fontSize}
      fontWeight={a.bold ? 700 : 400}
      fontStyle={a.italic ? 'italic' : 'normal'}
      style={{ whiteSpace: 'pre' }}
    >
      {lines.map((line, i) => (
        <text key={i} x={a.x + lineOffset(a, widths[i])} y={a.y + baselines[i]}>{line}</text>
      ))}
    </g>
  )
}

function Picture({ a }: { a: ImageAnn }) {
  const url = useEditor(s => s.assets[a.assetId]?.url)
  if (!url) return null
  return (
    <image href={url} x={a.x} y={a.y} width={a.w} height={a.h}
      opacity={a.opacity} preserveAspectRatio="none" />
  )
}

function Body({ a, box }: { a: Annotation; box: Rect }) {
  // Shapes, images and text are drawn from the normalised frame, so they can
  // never drift away from the selection outline and its handles.
  switch (a.type) {
    case 'rect':
    case 'ellipse': return <Shape a={{ ...a, ...box }} />
    case 'image': return <Picture a={{ ...a, ...box }} />
    case 'text': return <TextBlock a={{ ...a, ...box }} />
    case 'line':
    case 'arrow': return <LineShape a={a} />
    case 'draw':
    case 'highlight': return <Ink a={a} />
  }
}

/** One annotation plus, when selected, a hit area so thin strokes stay grabbable. */
/** How wide a transparent stroke has to be before it is comfortable to grab. */
const grabWidth = (strokeWidth: number) => Math.max(12, strokeWidth + 8)

/**
 * The area that responds to the pointer, which is deliberately *not* the
 * bounding box for every kind of object.
 *
 * A signature, a diagonal arrow or an unfilled rectangle only cover a fraction
 * of the box they occupy. Claiming the whole box would let them sit invisibly on
 * top of their neighbours and swallow clicks meant for whatever is underneath —
 * which is exactly what makes objects feel unresponsive when several are close
 * together. So each shape is grabbed by what it actually draws.
 */
function HitArea({ ann, box }: { ann: Annotation; box: Rect }) {
  switch (ann.type) {
    case 'image':
    case 'text':
      return <rect x={box.x} y={box.y} width={box.w} height={box.h} fill="transparent" pointerEvents="all" />

    case 'rect':
    case 'ellipse': {
      const a = ann as ShapeAnn
      // A filled shape is solid; an outlined one is grabbed by its outline, so
      // anything framed by it stays reachable.
      const common = {
        fill: a.fill ? 'transparent' : 'none',
        stroke: 'transparent',
        strokeWidth: grabWidth(a.strokeWidth),
        pointerEvents: (a.fill ? 'all' : 'stroke') as 'all' | 'stroke',
      }
      return a.type === 'rect'
        ? <rect x={box.x} y={box.y} width={box.w} height={box.h} {...common} />
        : <ellipse cx={box.x + box.w / 2} cy={box.y + box.h / 2} rx={box.w / 2} ry={box.h / 2} {...common} />
    }

    case 'line':
    case 'arrow': {
      const a = ann as LineAnn
      return (
        <line
          x1={a.x} y1={a.y} x2={a.x + a.w} y2={a.y + a.h}
          stroke="transparent" strokeWidth={grabWidth(a.strokeWidth)}
          strokeLinecap="round" pointerEvents="stroke"
        />
      )
    }

    case 'draw':
    case 'highlight': {
      const a = ann as DrawAnn
      return (
        <g stroke="transparent" strokeWidth={grabWidth(a.strokeWidth)} fill="none"
          strokeLinecap="round" strokeLinejoin="round" pointerEvents="stroke">
          {a.strokes.map((stroke, i) => <path key={i} d={strokeToPath(stroke)} />)}
        </g>
      )
    }
  }
}

export const AnnotationNode = memo(function AnnotationNode(
  { ann, selected, preview, onPointerDown, onDoubleClick }: Props,
) {
  const box = normalizeRect(ann)
  return (
    <g
      data-ann={ann.id}
      className={`ann${ann.locked ? ' locked' : ''}`}
      onPointerDown={preview ? undefined : onPointerDown}
      onDoubleClick={onDoubleClick}
    >
      {!preview && <HitArea ann={ann} box={box} />}
      <Body a={ann} box={box} />
      {selected && <rect className="outline" x={box.x} y={box.y} width={box.w} height={box.h} pointerEvents="none" />}
    </g>
  )
})
