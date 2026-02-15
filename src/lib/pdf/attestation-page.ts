import type { PDFDocument, PDFFont } from 'pdf-lib'

export interface SigningAttestation {
  agreementName: string
  transactionId: string
  signerName: string
  signerEmail: string
  organizerName?: string
  organizerSignedBy?: string
  organizerSignedAt?: string
  contractSentAt?: string
  signedAt: string
}

interface TimelineEvent {
  text: string
  detail: string
  completed?: boolean
}

const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89
const MARGIN = 50
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2

// Colors
const TEAL = { r: 0.0, g: 0.55, b: 0.6 }
const TEXT = { r: 0.2, g: 0.2, b: 0.2 }
const LABEL = { r: 0.4, g: 0.4, b: 0.4 }
const LINE = { r: 0.8, g: 0.8, b: 0.8 }
const GREEN = { r: 0.15, g: 0.6, b: 0.3 }

/**
 * Appends a signing certificate page to an already-loaded PDFDocument.
 * Modelled after the Adobe Sign audit trail page — provides a tamper-evident
 * record of when the document was sent, signed, and completed.
 */
export async function addAttestationPage(
  pdfDoc: PDFDocument,
  attestation: SigningAttestation,
): Promise<void> {
  const { rgb } = await import('pdf-lib')
  const { StandardFonts } = await import('pdf-lib')

  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  const teal = rgb(TEAL.r, TEAL.g, TEAL.b)
  const textColor = rgb(TEXT.r, TEXT.g, TEXT.b)
  const labelColor = rgb(LABEL.r, LABEL.g, LABEL.b)
  const lineColor = rgb(LINE.r, LINE.g, LINE.b)
  const greenColor = rgb(GREEN.r, GREEN.g, GREEN.b)

  // ── Border ──
  page.drawRectangle({
    x: 25,
    y: 25,
    width: PAGE_WIDTH - 50,
    height: PAGE_HEIGHT - 50,
    borderColor: teal,
    borderWidth: 2,
  })

  let y = PAGE_HEIGHT - 70

  // ── Title ──
  const titleLines = wrapText(
    attestation.agreementName,
    helveticaBold,
    20,
    CONTENT_WIDTH,
  )
  for (const line of titleLines) {
    page.drawText(line, {
      x: MARGIN,
      y,
      size: 20,
      font: helveticaBold,
      color: teal,
    })
    y -= 26
  }
  y -= 4

  // ── Subtitle: "Signing Certificate" + date ──
  const reportDate = attestation.signedAt.slice(0, 10)
  page.drawText('Signing Certificate', {
    x: MARGIN,
    y,
    size: 10,
    font: helvetica,
    color: textColor,
  })
  const dateWidth = helvetica.widthOfTextAtSize(reportDate, 10)
  page.drawText(reportDate, {
    x: PAGE_WIDTH - MARGIN - dateWidth,
    y,
    size: 10,
    font: helvetica,
    color: textColor,
  })
  y -= 24

  // ── Summary table ──
  const tableRows = [
    { label: 'Date:', value: reportDate },
    {
      label: 'Signer:',
      value: `${attestation.signerName} (${attestation.signerEmail})`,
    },
    { label: 'Status:', value: 'Signed' },
    { label: 'Transaction ID:', value: attestation.transactionId },
  ]

  const rowHeight = 24
  const tableHeight = tableRows.length * rowHeight
  const labelColWidth = 110
  const tableTop = y

  // Table border
  page.drawRectangle({
    x: MARGIN,
    y: tableTop - tableHeight,
    width: CONTENT_WIDTH,
    height: tableHeight,
    borderColor: lineColor,
    borderWidth: 1,
  })

  for (let i = 0; i < tableRows.length; i++) {
    const rowY = tableTop - i * rowHeight - 16

    // Row separator
    if (i > 0) {
      page.drawLine({
        start: { x: MARGIN, y: tableTop - i * rowHeight },
        end: {
          x: MARGIN + CONTENT_WIDTH,
          y: tableTop - i * rowHeight,
        },
        thickness: 0.5,
        color: lineColor,
      })
    }

    page.drawText(tableRows[i].label, {
      x: MARGIN + 10,
      y: rowY,
      size: 9,
      font: helveticaBold,
      color: labelColor,
    })

    // Truncate value if too wide
    const maxValueWidth = CONTENT_WIDTH - labelColWidth - 20
    const valueText = truncateText(
      tableRows[i].value,
      helvetica,
      9,
      maxValueWidth,
    )
    page.drawText(valueText, {
      x: MARGIN + labelColWidth,
      y: rowY,
      size: 9,
      font: helvetica,
      color: textColor,
    })
  }

  y = tableTop - tableHeight - 40

  // ── History title ──
  const historyTitle = `"${attestation.agreementName}" History`
  const historyLines = wrapText(historyTitle, helveticaBold, 14, CONTENT_WIDTH)
  for (const line of historyLines) {
    page.drawText(line, {
      x: MARGIN,
      y,
      size: 14,
      font: helveticaBold,
      color: textColor,
    })
    y -= 20
  }
  y -= 10

  // ── Timeline events ──
  const events = buildTimelineEvents(attestation)

  for (const event of events) {
    const bulletColor = event.completed ? greenColor : teal

    // Bullet circle
    page.drawCircle({
      x: MARGIN + 8,
      y: y + 3,
      size: 4,
      color: bulletColor,
    })

    // Event text (may wrap)
    const eventLines = wrapText(event.text, helvetica, 10, CONTENT_WIDTH - 30)
    for (const line of eventLines) {
      page.drawText(line, {
        x: MARGIN + 22,
        y,
        size: 10,
        font: helvetica,
        color: textColor,
      })
      y -= 14
    }

    // Timestamp / detail
    page.drawText(event.detail, {
      x: MARGIN + 22,
      y,
      size: 9,
      font: helvetica,
      color: labelColor,
    })
    y -= 26
  }

  // ── Footer ──
  const orgName = attestation.organizerName || 'Cloud Native Days Norway'
  const footerText = `${orgName} \u2014 Verified Document Signing`
  const footerWidth = helvetica.widthOfTextAtSize(footerText, 8)
  page.drawText(footerText, {
    x: (PAGE_WIDTH - footerWidth) / 2,
    y: 45,
    size: 8,
    font: helvetica,
    color: labelColor,
  })
}

function buildTimelineEvents(att: SigningAttestation): TimelineEvent[] {
  const events: TimelineEvent[] = []

  if (att.organizerSignedBy && att.organizerSignedAt) {
    events.push({
      text: `Contract counter-signed by ${att.organizerSignedBy} (organizer)`,
      detail: formatTimestamp(att.organizerSignedAt),
    })
  }

  if (att.contractSentAt) {
    events.push({
      text: `Contract sent to ${att.signerEmail} for signature`,
      detail: formatTimestamp(att.contractSentAt),
    })
  }

  events.push({
    text: `Document e-signed by ${att.signerName} (${att.signerEmail})`,
    detail: `Signature Date: ${formatTimestamp(att.signedAt)}`,
  })

  events.push({
    text: 'Agreement completed.',
    detail: formatTimestamp(att.signedAt),
    completed: true,
  })

  return events
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const yyyy = date.getUTCFullYear()
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(date.getUTCDate()).padStart(2, '0')

  let hours = date.getUTCHours()
  const minutes = String(date.getUTCMinutes()).padStart(2, '0')
  const seconds = String(date.getUTCSeconds()).padStart(2, '0')
  const ampm = hours >= 12 ? 'PM' : 'AM'
  hours = hours % 12 || 12

  return `${yyyy}-${mm}-${dd} - ${hours}:${minutes}:${seconds} ${ampm} UTC`
}

function wrapText(
  text: string,
  font: PDFFont,
  fontSize: number,
  maxWidth: number,
): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let currentLine = ''

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word
    if (font.widthOfTextAtSize(testLine, fontSize) <= maxWidth) {
      currentLine = testLine
    } else {
      if (currentLine) lines.push(currentLine)
      currentLine = word
    }
  }
  if (currentLine) lines.push(currentLine)

  return lines
}

function truncateText(
  text: string,
  font: PDFFont,
  fontSize: number,
  maxWidth: number,
): string {
  if (font.widthOfTextAtSize(text, fontSize) <= maxWidth) return text
  let truncated = text
  while (
    truncated.length > 0 &&
    font.widthOfTextAtSize(truncated + '...', fontSize) > maxWidth
  ) {
    truncated = truncated.slice(0, -1)
  }
  return truncated + '...'
}
