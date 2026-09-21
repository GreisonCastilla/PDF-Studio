import type { ImageAsset } from '../types'
import { uid } from './geometry'

function loadBitmap(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('No se pudo leer la imagen'))
    img.src = url
  })
}

/**
 * pdf-lib can only embed PNG and JPEG, so anything else (webp, gif, bmp, svg…)
 * is re-encoded to PNG through a canvas first.
 */
export async function fileToAsset(file: File): Promise<ImageAsset> {
  const buf = new Uint8Array(await file.arrayBuffer())
  const passthrough = file.type === 'image/png' || file.type === 'image/jpeg'
  const url = URL.createObjectURL(new Blob([buf.slice().buffer], { type: file.type || 'image/png' }))
  const img = await loadBitmap(url)

  if (passthrough) {
    return {
      id: uid('img'),
      bytes: buf,
      mime: file.type as 'image/png' | 'image/jpeg',
      url,
      width: img.naturalWidth,
      height: img.naturalHeight,
    }
  }

  URL.revokeObjectURL(url)
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth || 512
  canvas.height = img.naturalHeight || 512
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvasToAsset(canvas)
}

export async function canvasToAsset(canvas: HTMLCanvasElement): Promise<ImageAsset> {
  const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/png'))
  if (!blob) throw new Error('No se pudo convertir la imagen')
  const bytes = new Uint8Array(await blob.arrayBuffer())
  return {
    id: uid('img'),
    bytes,
    mime: 'image/png',
    url: URL.createObjectURL(blob),
    width: canvas.width,
    height: canvas.height,
  }
}

export async function dataUrlToAsset(dataUrl: string): Promise<ImageAsset> {
  const res = await fetch(dataUrl)
  const blob = await res.blob()
  const img = await loadBitmap(dataUrl)
  const bytes = new Uint8Array(await blob.arrayBuffer())
  return {
    id: uid('img'),
    bytes,
    mime: blob.type === 'image/jpeg' ? 'image/jpeg' : 'image/png',
    url: URL.createObjectURL(blob),
    width: img.naturalWidth,
    height: img.naturalHeight,
  }
}
