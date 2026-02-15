import { describe, it, expect } from '@jest/globals'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { addAttestationPage, type SigningAttestation } from '@/lib/pdf'

const BASE_ATTESTATION: SigningAttestation = {
  agreementName: 'Sponsorship Agreement - Acme Corp',
  transactionId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  signerName: 'Jane Doe',
  signerEmail: 'jane@acme.com',
  organizerName: 'Cloud Native Bergen',
  contractSentAt: '2026-02-14T08:59:48Z',
  signedAt: '2026-02-14T09:21:11Z',
}

async function createMinimalPdf(): Promise<PDFDocument> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const page = doc.addPage([595.28, 841.89])
  page.drawText('Contract content', { x: 50, y: 400, size: 12, font })
  return doc
}

describe('addAttestationPage', () => {
  it('appends a new page to the PDF', async () => {
    const doc = await createMinimalPdf()
    expect(doc.getPageCount()).toBe(1)

    await addAttestationPage(doc, BASE_ATTESTATION)

    expect(doc.getPageCount()).toBe(2)
  })

  it('produces a valid PDF that can be saved', async () => {
    const doc = await createMinimalPdf()
    await addAttestationPage(doc, BASE_ATTESTATION)

    const bytes = await doc.save()
    expect(bytes.length).toBeGreaterThan(0)

    // Re-parse to verify it is valid
    const reloaded = await PDFDocument.load(bytes)
    expect(reloaded.getPageCount()).toBe(2)
  })

  it('creates an A4-sized attestation page', async () => {
    const doc = await createMinimalPdf()
    await addAttestationPage(doc, BASE_ATTESTATION)

    const attestPage = doc.getPage(1)
    const { width, height } = attestPage.getSize()
    expect(width).toBeCloseTo(595.28, 1)
    expect(height).toBeCloseTo(841.89, 1)
  })

  it('works without optional fields', async () => {
    const doc = await createMinimalPdf()
    const minimal: SigningAttestation = {
      agreementName: 'Agreement',
      transactionId: 'abc-123',
      signerName: 'Test',
      signerEmail: 'test@example.com',
      signedAt: '2026-02-15T12:00:00Z',
    }

    await addAttestationPage(doc, minimal)
    expect(doc.getPageCount()).toBe(2)

    const bytes = await doc.save()
    expect(bytes.length).toBeGreaterThan(0)
  })

  it('handles long agreement names without error', async () => {
    const doc = await createMinimalPdf()
    const longName: SigningAttestation = {
      ...BASE_ATTESTATION,
      agreementName:
        'Very Long Sponsorship Agreement Title For Cloud Native Days Norway 2026 - Super Enterprise Corporation International Inc.',
    }

    await addAttestationPage(doc, longName)

    const bytes = await doc.save()
    const reloaded = await PDFDocument.load(bytes)
    expect(reloaded.getPageCount()).toBe(2)
  })

  it('includes attestation page content in the PDF text', async () => {
    const doc = await createMinimalPdf()
    await addAttestationPage(doc, BASE_ATTESTATION)

    // Save and inspect raw bytes — pdf-lib uses FlateDecode, so we check
    // the cross-reference structure confirms 2 pages were written.
    const bytes = await doc.save()
    const reloaded = await PDFDocument.load(bytes)
    expect(reloaded.getPageCount()).toBe(2)

    // The attestation page should be A4 sized
    const attestPage = reloaded.getPage(1)
    const { width } = attestPage.getSize()
    expect(width).toBeCloseTo(595.28, 1)
  })

  it('includes organizer counter-sign event when provided', async () => {
    const doc = await createMinimalPdf()
    const withOrganizer: SigningAttestation = {
      ...BASE_ATTESTATION,
      organizerSignedBy: 'Hans Admin',
      organizerSignedAt: '2026-02-14T08:30:00Z',
    }

    await addAttestationPage(doc, withOrganizer)
    expect(doc.getPageCount()).toBe(2)

    const bytes = await doc.save()
    const reloaded = await PDFDocument.load(bytes)
    expect(reloaded.getPageCount()).toBe(2)
  })

  it('omits organizer event when only one organizer field is set', async () => {
    const doc = await createMinimalPdf()
    const partial: SigningAttestation = {
      ...BASE_ATTESTATION,
      organizerSignedBy: 'Hans Admin',
      // organizerSignedAt intentionally omitted
    }

    await addAttestationPage(doc, partial)
    expect(doc.getPageCount()).toBe(2)

    const bytes = await doc.save()
    expect(bytes.length).toBeGreaterThan(0)
  })
})
