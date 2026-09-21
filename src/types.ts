export type Tool =
  | 'select' | 'text' | 'rect' | 'ellipse' | 'line' | 'arrow'
  | 'draw' | 'highlight' | 'image' | 'crop'

export type FontKey = 'helvetica' | 'times' | 'courier'

export interface Point { x: number; y: number }

/** Rect in the page's *base* space (unrotated, origin top-left, y down, PDF points). */
export interface Rect { x: number; y: number; w: number; h: number }

export interface PageItem {
  id: string
  srcId: string
  /** 0-based index inside the source document. */
  srcIndex: number
  /** Extra rotation added by the user, on top of the PDF's own /Rotate. */
  rotation: number
  /** Crop window in base space; null means the full visible box. */
  crop: Rect | null
  /** Visible box size (CropBox) at rotation 0. */
  baseW: number
  baseH: number
  /** Offset of the visible box inside the PDF user space. */
  baseX: number
  baseY: number
  /** The /Rotate value already stored in the PDF. */
  baseRotation: number
}

export interface PdfSource {
  id: string
  name: string
  /** Pristine copy kept for pdf-lib; pdf.js gets its own clone. */
  bytes: Uint8Array
  pageCount: number
}

export interface ImageAsset {
  id: string
  /** PNG or JPEG bytes — the only formats pdf-lib can embed. */
  bytes: Uint8Array
  mime: 'image/png' | 'image/jpeg'
  url: string
  width: number
  height: number
}

interface AnnBase {
  id: string
  pageId: string
  /** Bounding box in *display* space: origin top-left, y down, PDF points. */
  x: number
  y: number
  w: number
  h: number
  opacity: number
  locked: boolean
  /** Size at insertion time. The reset button in the size panel returns here. */
  initial?: { w: number; h: number }
}

export interface TextAnn extends AnnBase {
  type: 'text'
  text: string
  fontSize: number
  font: FontKey
  bold: boolean
  italic: boolean
  color: string
  align: 'left' | 'center' | 'right'
  lineHeight: number
}

export interface ShapeAnn extends AnnBase {
  type: 'rect' | 'ellipse'
  stroke: string
  strokeWidth: number
  fill: string | null
}

/** Endpoints are (x, y) and (x + w, y + h); w/h may be negative. */
export interface LineAnn extends AnnBase {
  type: 'line' | 'arrow'
  stroke: string
  strokeWidth: number
}

/** Freehand ink — also how signatures are stored, as crisp vectors. */
export interface DrawAnn extends AnnBase {
  type: 'draw' | 'highlight'
  /** Absolute display-space points, one array per stroke. */
  strokes: Point[][]
  stroke: string
  strokeWidth: number
}

export interface ImageAnn extends AnnBase {
  type: 'image'
  assetId: string
}

export type Annotation = TextAnn | ShapeAnn | LineAnn | DrawAnn | ImageAnn
export type AnnKind = Annotation['type']

export interface DocState {
  sources: Record<string, PdfSource>
  assets: Record<string, ImageAsset>
  pages: PageItem[]
  annotations: Annotation[]
}
