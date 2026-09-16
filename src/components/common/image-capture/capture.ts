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

const generateCanvas = async (
  element: HTMLElement,
): Promise<HTMLCanvasElement> => {
  const canvas = await html2canvas(element, {
    backgroundColor: null,
    scale: 4,
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

/** Shared raster lifecycle for downloads and Task attachments. */
export async function captureImage(element: HTMLElement): Promise<Blob> {
  if (!element.offsetWidth || !element.offsetHeight) {
    throw new Error('Cannot capture an element with zero dimensions')
  }
  const sources = Array.from(element.querySelectorAll('img')).map((image) => ({
    image,
    src: image.getAttribute('src'),
  }))
  let canvas: HTMLCanvasElement | undefined
  try {
    await waitForImages(element)
    await updateImageSources(element)
    await new Promise((resolve) => setTimeout(resolve, 300))
    canvas = await generateCanvas(element)
    return await new Promise<Blob>((resolve, reject) => {
      canvas!.toBlob(
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
    if (canvas) {
      canvas.width = 0
      canvas.height = 0
    }
  }
}
