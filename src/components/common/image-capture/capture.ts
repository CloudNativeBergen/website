import html2canvas from 'html2canvas-pro'

const waitForImages = async (element: HTMLElement): Promise<void> => {
  const images = element.querySelectorAll('img')
  if (images.length === 0) return

  await Promise.all(
    Array.from(images).map((img) => {
      return new Promise<void>((resolve) => {
        if (img.complete && img.naturalWidth > 0) {
          resolve()
        } else {
          img.onload = () => resolve()
          img.onerror = () => {
            console.warn('Image failed to load:', img.src.substring(0, 100))
            resolve()
          }

          setTimeout(resolve, 3000)
        }
      })
    }),
  )
}

/** Longest a capture waits for content that is still drawing. */
const PENDING_TIMEOUT_MS = 10_000

/**
 * Wait until nothing inside `element` is marked `data-capture-pending` — a
 * component still drawing asynchronously (the meme generator while its logo
 * raster decodes) marks itself so a capture does not catch it half-drawn.
 * Gives up after {@link PENDING_TIMEOUT_MS}: a capture must never hang.
 */
const waitForPending = async (element: HTMLElement): Promise<void> => {
  const started = Date.now()
  while (
    element.querySelector('[data-capture-pending]') &&
    Date.now() - started < PENDING_TIMEOUT_MS
  ) {
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

const updateImageSources = async (element: HTMLElement): Promise<void> => {
  const images = element.querySelectorAll('img')
  const externalImages = Array.from(images).filter(
    (img) =>
      !img.src.startsWith('data:') &&
      !img.src.includes(window.location.hostname),
  )

  externalImages.forEach((img) => {
    const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(img.src)}`
    img.src = proxyUrl
  })

  if (externalImages.length > 0) {
    await waitForImages(element)
  }
}

/** The pixels a capture must come out at (a studio Format's size). */
export interface CaptureSize {
  width: number
  height: number
}

/** What a capture is rendered at when no size is asked for: 4× the CSS box. */
const DEFAULT_SCALE = 4

const generateCanvas = async (
  element: HTMLElement,
  scale: number,
): Promise<HTMLCanvasElement> => {
  const canvas = await html2canvas(element, {
    backgroundColor: null,
    scale,
    useCORS: true,
    allowTaint: false,
    removeContainer: false,
    imageTimeout: 12000,
    width: element.offsetWidth,
    height: element.offsetHeight,
    logging: false,
    onclone: (clonedDoc: Document) => {
      const qrElements = clonedDoc.querySelectorAll('[data-qr-code]')
      qrElements.forEach((el: Element) => {
        if (el instanceof HTMLElement) {
          el.style.opacity = '1'
          el.style.visibility = 'visible'
          el.style.display = 'block'
        }
      })

      const textElements = clonedDoc.querySelectorAll(
        'h1, h2, h3, p, span, div',
      )
      textElements.forEach((el: Element) => {
        if (el instanceof HTMLElement) {
          el.style.color = el.style.color || 'inherit'
        }
      })
    },
  })

  if (canvas.width === 0 || canvas.height === 0) {
    throw new Error('Generated canvas has zero dimensions')
  }

  return canvas
}

/**
 * The render drawn onto a canvas of EXACTLY `size` (docs/MARKETING_STUDIO_
 * FORMATS_SPEC.md §2). The card's CSS box is laid out in the Format's aspect
 * but rounded to whole CSS pixels, so the scaled render can come out a pixel
 * off; the image handed out never does.
 */
const fitToSize = (
  source: HTMLCanvasElement,
  size: CaptureSize,
): HTMLCanvasElement => {
  const target = document.createElement('canvas')
  target.width = size.width
  target.height = size.height
  const context = target.getContext('2d')
  if (!context) throw new Error('Canvas 2D context unavailable')
  context.drawImage(source, 0, 0, size.width, size.height)
  return target
}

/**
 * Shared raster lifecycle for downloads, Task attachments and gallery saves.
 * With `size`, the PNG is exactly that many pixels; without, 4× the CSS box.
 */
export async function captureImage(
  element: HTMLElement,
  size?: CaptureSize,
): Promise<Blob> {
  if (!element.offsetWidth || !element.offsetHeight) {
    throw new Error('Cannot capture an element with zero dimensions')
  }
  const sources = Array.from(element.querySelectorAll('img')).map((image) => ({
    image,
    src: image.getAttribute('src'),
  }))
  let canvas: HTMLCanvasElement | undefined
  let output: HTMLCanvasElement | undefined
  try {
    await waitForPending(element)
    await waitForImages(element)
    await updateImageSources(element)
    await new Promise((resolve) => setTimeout(resolve, 300))
    canvas = await generateCanvas(
      element,
      size ? size.width / element.offsetWidth : DEFAULT_SCALE,
    )
    output = size ? fitToSize(canvas, size) : canvas
    return await new Promise<Blob>((resolve, reject) => {
      output!.toBlob(
        (blob) =>
          blob
            ? resolve(blob)
            : reject(new Error('Failed to create blob from canvas')),
        'image/png',
        1,
      )
    })
  } finally {
    for (const { image, src } of sources) {
      if (src === null) image.removeAttribute('src')
      else image.setAttribute('src', src)
    }
    for (const used of new Set([canvas, output])) {
      if (used) {
        used.width = 0
        used.height = 0
      }
    }
  }
}
