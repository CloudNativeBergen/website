import { describe, it, expect } from '@jest/globals'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import {
  findMarkerInPdf,
  parseTextPosition,
  SPONSOR_SIGNATURE_MARKER,
  SPONSOR_DATE_MARKER,
} from '@/lib/pdf'

/**
 * Creates a minimal PDF with marker text at a known position.
 * Uses pdf-lib to draw text, so the content stream format matches
 * what our contract PDF generator produces.
 */
async function createPdfWithMarkers(options?: {
  markerPage?: number
  totalPages?: number
  markerX?: number
  markerY?: number
}): Promise<Uint8Array> {
  const {
    markerPage = 0,
    totalPages = 1,
    markerX = 300,
    markerY = 80,
  } = options ?? {}

  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)

  for (let i = 0; i < totalPages; i++) {
    const page = doc.addPage([595.28, 841.89]) // A4

    page.drawText(`Page ${i + 1} content`, {
      x: 50,
      y: 750,
      size: 14,
      font,
    })

    if (i === markerPage) {
      // Draw the signature marker (tiny, white — invisible in print)
      page.drawText(SPONSOR_SIGNATURE_MARKER, {
        x: markerX,
        y: markerY,
        size: 1,
        font,
      })
      page.drawText(SPONSOR_DATE_MARKER, {
        x: markerX,
        y: markerY - 10,
        size: 1,
        font,
      })
    }
  }

  return doc.save()
}

/**
 * Creates a PDF with no marker text at all.
 */
async function createPdfWithoutMarkers(): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const page = doc.addPage([595.28, 841.89])
  page.drawText('Contract content without markers', {
    x: 50,
    y: 400,
    size: 12,
    font,
  })
  return doc.save()
}

describe('findMarkerInPdf', () => {
  it('finds signature marker on a single-page PDF', async () => {
    const pdfBytes = await createPdfWithMarkers({
      markerX: 300,
      markerY: 80,
    })
    const result = findMarkerInPdf(pdfBytes, SPONSOR_SIGNATURE_MARKER)

    expect(result).not.toBeNull()
    expect(result!.pageIndex).toBe(0)
    expect(result!.x).toBeCloseTo(300, 0)
    expect(result!.y).toBeCloseTo(80, 0)
  })

  it('finds signature marker on the correct page of a multi-page PDF', async () => {
    const pdfBytes = await createPdfWithMarkers({
      markerPage: 1,
      totalPages: 3,
      markerX: 280,
      markerY: 100,
    })
    const result = findMarkerInPdf(pdfBytes, SPONSOR_SIGNATURE_MARKER)

    expect(result).not.toBeNull()
    expect(result!.pageIndex).toBe(1)
    expect(result!.x).toBeCloseTo(280, 0)
    expect(result!.y).toBeCloseTo(100, 0)
  })

  it('finds date marker at a different position', async () => {
    const pdfBytes = await createPdfWithMarkers({
      markerX: 300,
      markerY: 80,
    })
    const result = findMarkerInPdf(pdfBytes, SPONSOR_DATE_MARKER)

    expect(result).not.toBeNull()
    expect(result!.pageIndex).toBe(0)
    expect(result!.x).toBeCloseTo(300, 0)
    expect(result!.y).toBeCloseTo(70, 0) // 80 - 10
  })

  it('returns null when marker is not present', async () => {
    const pdfBytes = await createPdfWithoutMarkers()
    const result = findMarkerInPdf(pdfBytes, SPONSOR_SIGNATURE_MARKER)

    expect(result).toBeNull()
  })

  it('returns null for an unknown marker string', async () => {
    const pdfBytes = await createPdfWithMarkers()
    const result = findMarkerInPdf(pdfBytes, '{{NonExistent_Marker}}')

    expect(result).toBeNull()
  })

  it('finds marker on the last page of a long document', async () => {
    const pdfBytes = await createPdfWithMarkers({
      markerPage: 4,
      totalPages: 5,
      markerX: 310,
      markerY: 90,
    })
    const result = findMarkerInPdf(pdfBytes, SPONSOR_SIGNATURE_MARKER)

    expect(result).not.toBeNull()
    expect(result!.pageIndex).toBe(4)
    expect(result!.x).toBeCloseTo(310, 0)
    expect(result!.y).toBeCloseTo(90, 0)
  })
})

describe('parseTextPosition', () => {
  it('extracts position from Tm operator followed by Tj', () => {
    const stream = [
      'BT',
      '1 0 0 1 250 120 Tm',
      '/F1 10 Tf',
      '(Hello World) Tj',
      'ET',
    ].join('\n')

    const pos = parseTextPosition(stream, 'Hello World')
    expect(pos).toEqual({ x: 250, y: 120 })
  })

  it('extracts position from Td operator', () => {
    const stream = [
      'BT',
      '100 200 Td',
      '(Some text) Tj',
      '50 -20 Td',
      '(Target text) Tj',
      'ET',
    ].join('\n')

    const pos = parseTextPosition(stream, 'Target text')
    expect(pos).toEqual({ x: 150, y: 180 })
  })

  it('handles TJ array operator', () => {
    const stream = [
      'BT',
      '1 0 0 1 300 400 Tm',
      '[(Hello) 20 ( World)] TJ',
      'ET',
    ].join('\n')

    const pos = parseTextPosition(stream, 'Hello World')
    expect(pos).toEqual({ x: 300, y: 400 })
  })

  it('resets position on BT', () => {
    const stream = [
      'BT',
      '100 200 Td',
      '(First block) Tj',
      'ET',
      'BT',
      '300 500 Td',
      '(Target) Tj',
      'ET',
    ].join('\n')

    const pos = parseTextPosition(stream, 'Target')
    expect(pos).toEqual({ x: 300, y: 500 })
  })

  it('returns null when marker is not in the stream', () => {
    const stream = ['BT', '100 200 Td', '(Some other text) Tj', 'ET'].join('\n')

    const pos = parseTextPosition(stream, 'Not here')
    expect(pos).toBeNull()
  })

  it('handles TD operator (uppercase)', () => {
    const stream = ['BT', '0 0 Td', '80 300 TD', '(Found it) Tj', 'ET'].join(
      '\n',
    )

    const pos = parseTextPosition(stream, 'Found it')
    expect(pos).toEqual({ x: 80, y: 300 })
  })

  it('handles cumulative Td offsets', () => {
    const stream = [
      'BT',
      '10 20 Td',
      '(Line 1) Tj',
      '0 -15 Td',
      '(Line 2) Tj',
      '0 -15 Td',
      '(Line 3) Tj',
      'ET',
    ].join('\n')

    const pos = parseTextPosition(stream, 'Line 3')
    expect(pos).toEqual({ x: 10, y: -10 })
  })

  it('handles negative coordinates', () => {
    const stream = [
      'BT',
      '1 0 0 1 -50 -100 Tm',
      '(Negative pos) Tj',
      'ET',
    ].join('\n')

    const pos = parseTextPosition(stream, 'Negative pos')
    expect(pos).toEqual({ x: -50, y: -100 })
  })

  it('handles floating point coordinates', () => {
    const stream = ['BT', '1 0 0 1 297.64 80.5 Tm', '(Precise) Tj', 'ET'].join(
      '\n',
    )

    const pos = parseTextPosition(stream, 'Precise')
    expect(pos).toEqual({ x: 297.64, y: 80.5 })
  })
})
