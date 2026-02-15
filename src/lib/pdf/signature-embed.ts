import { formatDate, getCurrentDateTime } from '@/lib/time'

import { addAttestationPage, type SigningAttestation } from './attestation-page'
import {
  SPONSOR_SIGNATURE_MARKER,
  SPONSOR_DATE_MARKER,
  ORGANIZER_SIGNATURE_MARKER,
} from './constants'
import { findMarkerInPdf } from './marker-detection'

const SIGNATURE_MAX_WIDTH = 150
const SIGNATURE_MAX_HEIGHT = 60

// Fallback Y position when marker detection fails (pdf-lib coords, 0=bottom)
const SIGNATURE_Y_FALLBACK = 120

// Vertical offset from the detected marker to the signature image bottom.
// The marker text sits just below "Date / Signature" label and the signature
// line. This offset places the image just above the line in the gap between
// the org name label and the line (which has marginTop: 40 in the template).
const SIGNATURE_MARKER_OFFSET_Y = 20

// Offsets for name and date text below the signature image
const SIGNER_NAME_OFFSET_Y = 2
const SIGNER_DATE_OFFSET_Y = 14

export interface EmbedSignatureOptions {
  /** Marker string to locate the signature position. Defaults to sponsor signer marker. */
  signatureMarker?: string
  /** Marker string to locate the date position. Defaults to sponsor date marker. */
  dateMarker?: string
}

/**
 * Core implementation: embeds a PNG signature into PDF bytes.
 *
 * Uses hidden marker text strings in the PDF to find the correct page and
 * vertical position for the signature. The X position is determined by which
 * block we're targeting: organizer (left, ~8%) or sponsor (right, ~55%).
 * The Y position is derived from the marker's absolute page coordinate
 * (computed via CTM tracking in the marker detection), with a fixed offset
 * to place the signature image just above the signature line.
 *
 * Falls back to a fixed Y position if markers are not found.
 */
async function embedSignatureCore(
  pdfBytes: Uint8Array,
  signatureDataUrl: string,
  signerName: string,
  attestation: SigningAttestation | undefined,
  options: EmbedSignatureOptions | undefined,
): Promise<Buffer> {
  const sigMarkerText = options?.signatureMarker ?? SPONSOR_SIGNATURE_MARKER
  const dateMarkerText = options?.dateMarker ?? SPONSOR_DATE_MARKER

  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')

  const pdfDoc = await PDFDocument.load(pdfBytes)

  const match = signatureDataUrl.match(
    /^data:image\/png(?:;[^,]*)?;base64,(.+)$/i,
  )
  if (!match?.[1]) {
    throw new Error('Invalid signature image format. Expected a PNG data URL.')
  }
  const signatureBytes = Buffer.from(match[1], 'base64')
  const signatureImage = await pdfDoc.embedPng(signatureBytes)

  const sigDims = signatureImage.scale(1)
  const scale = Math.min(
    SIGNATURE_MAX_WIDTH / sigDims.width,
    SIGNATURE_MAX_HEIGHT / sigDims.height,
    1,
  )
  const drawWidth = sigDims.width * scale
  const drawHeight = sigDims.height * scale

  // Use marker detection to find the correct page
  const sigMarker = findMarkerInPdf(pdfBytes, sigMarkerText)
  const pageIndex = sigMarker?.pageIndex ?? 0
  const targetPage = pdfDoc.getPage(pageIndex)
  const { width: pageWidth } = targetPage.getSize()

  // Position based on which signature block: organizer (left) or sponsor (right)
  const isOrganizer = sigMarkerText === ORGANIZER_SIGNATURE_MARKER
  const xPercent = isOrganizer ? 0.08 : 0.55
  const sigX = sigMarker
    ? sigMarker.x + (SIGNATURE_MAX_WIDTH - drawWidth) / 2
    : pageWidth * xPercent + (SIGNATURE_MAX_WIDTH - drawWidth) / 2
  const sigY = sigMarker
    ? sigMarker.y + SIGNATURE_MARKER_OFFSET_Y
    : SIGNATURE_Y_FALLBACK

  targetPage.drawImage(signatureImage, {
    x: sigX,
    y: sigY,
    width: drawWidth,
    height: drawHeight,
  })

  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const dateStr = formatDate(getCurrentDateTime())

  // Name and date text placed below the signature image, potentially on a different page
  const dateMarkerPos = findMarkerInPdf(pdfBytes, dateMarkerText)
  const textPageIndex = dateMarkerPos?.pageIndex ?? pageIndex
  const textPage = pdfDoc.getPage(textPageIndex)

  const nameX = sigX
  const nameY = sigY - SIGNER_NAME_OFFSET_Y
  const dateY = sigY - SIGNER_DATE_OFFSET_Y - SIGNER_NAME_OFFSET_Y

  textPage.drawText(signerName, {
    x: nameX,
    y: nameY,
    size: 9,
    font: helvetica,
    color: rgb(0.2, 0.2, 0.2),
  })

  textPage.drawText(dateStr, {
    x: nameX,
    y: dateY,
    size: 8,
    font: helvetica,
    color: rgb(0.4, 0.4, 0.4),
  })

  if (attestation) {
    await addAttestationPage(pdfDoc, attestation)
  }

  const signedBytes = await pdfDoc.save()
  return Buffer.from(signedBytes)
}

/**
 * Embeds a PNG signature image, signer name, and date into a contract PDF
 * fetched from a URL.
 *
 * Locates the marker text in the PDF to position the signature correctly,
 * regardless of which page the signature area ends up on.
 * Falls back to last-page bottom-right positioning if markers are not found.
 *
 * Use `options.signatureMarker` / `options.dateMarker` to target the organizer
 * signature block instead of the default sponsor block.
 *
 * When `attestation` is provided, appends a signing certificate page
 * with an audit trail of the signing process.
 */
export async function embedSignatureInPdf(
  pdfUrl: string,
  signatureDataUrl: string,
  signerName: string,
  attestation?: SigningAttestation,
  options?: EmbedSignatureOptions,
): Promise<Buffer> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)

  let pdfResponse: Response
  try {
    pdfResponse = await fetch(pdfUrl, { signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }

  if (!pdfResponse.ok) {
    throw new Error(`Failed to fetch PDF: ${pdfResponse.statusText}`)
  }
  const pdfBytes = new Uint8Array(await pdfResponse.arrayBuffer())

  return embedSignatureCore(
    pdfBytes,
    signatureDataUrl,
    signerName,
    attestation,
    options,
  )
}

/**
 * Embeds a PNG signature image into a contract PDF provided as a Buffer.
 * Same as `embedSignatureInPdf` but skips the URL fetch — useful when
 * the PDF is already in memory (e.g. organizer counter-signing before upload).
 */
export async function embedSignatureInPdfBuffer(
  pdfBuffer: Buffer,
  signatureDataUrl: string,
  signerName: string,
  options?: EmbedSignatureOptions,
): Promise<Buffer> {
  return embedSignatureCore(
    new Uint8Array(pdfBuffer),
    signatureDataUrl,
    signerName,
    undefined,
    options,
  )
}
