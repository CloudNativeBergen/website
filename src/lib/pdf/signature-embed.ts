import { formatDate, getCurrentDateTime } from '@/lib/time'

import { SIGNATURE_MARKER, DATE_MARKER } from './constants'
import { findMarkerInPdf } from './marker-detection'

const SIGNATURE_MAX_WIDTH = 150
const SIGNATURE_MAX_HEIGHT = 60

// Vertical offset: signature image is placed above the marker
const SIGNATURE_OFFSET_Y = 10
// Name and date are placed below the marker
const SIGNER_NAME_OFFSET_Y = 2
const SIGNER_DATE_OFFSET_Y = 14

/**
 * Embeds a PNG signature image, signer name, and date into a contract PDF.
 *
 * Locates the Adobe Sign marker in the PDF to position the signature
 * correctly, regardless of which page the signature area ends up on.
 * Falls back to last-page bottom-right positioning if markers are not found.
 */
export async function embedSignatureInPdf(
  pdfUrl: string,
  signatureDataUrl: string,
  signerName: string,
): Promise<Buffer> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')

  const pdfResponse = await fetch(pdfUrl)
  if (!pdfResponse.ok) {
    throw new Error(`Failed to fetch PDF: ${pdfResponse.statusText}`)
  }
  const pdfBytes = new Uint8Array(await pdfResponse.arrayBuffer())
  const pdfDoc = await PDFDocument.load(pdfBytes)

  // Decode signature PNG from data URL
  const base64Data = signatureDataUrl.replace('data:image/png;base64,', '')
  const signatureBytes = Buffer.from(base64Data, 'base64')
  const signatureImage = await pdfDoc.embedPng(signatureBytes)

  // Scale the signature to fit within bounds
  const sigDims = signatureImage.scale(1)
  const scale = Math.min(
    SIGNATURE_MAX_WIDTH / sigDims.width,
    SIGNATURE_MAX_HEIGHT / sigDims.height,
    1,
  )
  const drawWidth = sigDims.width * scale
  const drawHeight = sigDims.height * scale

  // Find the signature marker position in the PDF
  const sigMarker = findMarkerInPdf(pdfBytes, SIGNATURE_MARKER)

  let targetPage: ReturnType<typeof pdfDoc.getPage>
  let sigX: number
  let sigY: number

  if (sigMarker) {
    targetPage = pdfDoc.getPage(sigMarker.pageIndex)
    sigX = sigMarker.x + (SIGNATURE_MAX_WIDTH - drawWidth) / 2
    sigY = sigMarker.y + SIGNATURE_OFFSET_Y
  } else {
    const lastPageIndex = pdfDoc.getPageCount() - 1
    targetPage = pdfDoc.getPage(lastPageIndex)
    const { width: pageWidth } = targetPage.getSize()
    sigX = pageWidth * 0.55 + (SIGNATURE_MAX_WIDTH - drawWidth) / 2
    sigY = 120
  }

  targetPage.drawImage(signatureImage, {
    x: sigX,
    y: sigY,
    width: drawWidth,
    height: drawHeight,
  })

  // Add signer name and date below the signature line
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const dateStr = formatDate(getCurrentDateTime())

  const dateMarker = findMarkerInPdf(pdfBytes, DATE_MARKER)
  const nameX = dateMarker ? dateMarker.x : sigMarker ? sigMarker.x : sigX
  const nameY = dateMarker
    ? dateMarker.y + SIGNER_DATE_OFFSET_Y
    : sigMarker
      ? sigMarker.y - SIGNER_NAME_OFFSET_Y
      : sigY - SIGNER_NAME_OFFSET_Y
  const dateY = dateMarker
    ? dateMarker.y
    : sigMarker
      ? sigMarker.y - SIGNER_DATE_OFFSET_Y - SIGNER_NAME_OFFSET_Y
      : sigY - SIGNER_DATE_OFFSET_Y - SIGNER_NAME_OFFSET_Y

  targetPage.drawText(signerName, {
    x: nameX,
    y: nameY,
    size: 9,
    font: helvetica,
    color: rgb(0.2, 0.2, 0.2),
  })

  targetPage.drawText(dateStr, {
    x: nameX,
    y: dateY,
    size: 8,
    font: helvetica,
    color: rgb(0.4, 0.4, 0.4),
  })

  const signedBytes = await pdfDoc.save()
  return Buffer.from(signedBytes)
}
