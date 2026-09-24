import QRCodeStyling from 'qr-code-styling'
import type { QrStyle } from './meme-generator-draw'

/** The fields of a QR style, as one comparable key. */
export function qrStyleKey(style: QrStyle): string {
  return JSON.stringify([
    style.url,
    style.size,
    style.dotsColor,
    style.backgroundColor,
    style.dotsType,
    style.cornerSquareType,
    style.cornerDotType,
  ])
}

/**
 * Generate and decode the QR image for `style`, at twice its drawn size so it
 * stays crisp. Rejects if the generator produces nothing.
 */
export async function renderQrImage(style: QrStyle): Promise<HTMLImageElement> {
  const qrCode = new QRCodeStyling({
    width: style.size * 2,
    height: style.size * 2,
    type: 'canvas',
    data: style.url,
    dotsOptions: { color: style.dotsColor, type: style.dotsType },
    backgroundOptions: { color: style.backgroundColor },
    cornersSquareOptions: { type: style.cornerSquareType },
    cornersDotOptions: { type: style.cornerDotType },
    qrOptions: { errorCorrectionLevel: 'M' },
  })
  const blob = await qrCode.getRawData('png')
  if (!(blob instanceof Blob)) throw new Error('QR generator returned no image')
  // An <img>, not an ImageBitmap: Chromium filters the two differently when
  // drawn at half size, and the image is what the QR always was.
  const url = URL.createObjectURL(blob)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    return image
  } finally {
    URL.revokeObjectURL(url)
  }
}
