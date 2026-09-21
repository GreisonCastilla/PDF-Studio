import { memo } from 'react'
import type { Annotation, DrawAnn, ImageAnn, LineAnn, ShapeAnn, TextAnn } from '../types'
import { strokeToPath } from '../lib/geometry'
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
    <image href={url} x={a.x} y={a.y} width={Math.abs(a.w)} height={Math.abs(a.h)}
      opacity={a.opacity} preserveAspectRatio="none" />
  )
}

function Body({ a }: { a: Annotation }) {
  switch (a.type) {
    case 'rect':
    case 'ellipse': return <Shape a={a} />
    case 'line':
    case 'arrow': return <LineShape a={a} />
    case 'draw':
    case 'highlight': return <Ink a={a} />
    case 'image': return <Picture a={a} />
    case 'text': return <TextBlock a={a} />
  }
}

/** One annotation plus, when selected, a hit area so thin strokes stay grabbable. */
export const AnnotationNode = memo(function AnnotationNode(
  { ann, selected, preview, onPointerDown, onDoubleClick }: Props,
) {
  const box = {
    x: Math.min(ann.x, ann.x + ann.w),
    y: Math.min(ann.y, ann.y + ann.h),
    w: Math.abs(ann.w),
    h: Math.abs(ann.h),
  }
  return (
    <g
      className={`ann${ann.locked ? ' locked' : ''}`}
      onPointerDown={preview ? undefined : onPointerDown}
      onDoubleClick={onDoubleClick}
    >
      {!preview && (
        <rect x={box.x - 4} y={box.y - 4} width={box.w + 8} height={box.h + 8}
          fill="transparent" pointerEvents="all" />
      )}
      <Body a={ann} />
      {selected && <rect className="outline" x={box.x} y={box.y} width={box.w} height={box.h} pointerEvents="none" />}
    </g>
  )
})
