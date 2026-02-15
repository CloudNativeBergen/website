import { TRPCError } from '@trpc/server'

import { clientReadUncached, clientWrite } from '@/lib/sanity/client'
import {
  logContractStatusChange,
  logSignatureStatusChange,
} from '@/lib/sponsor-crm/activity'
import { formatDate, getCurrentDateTime } from '@/lib/time'
import { publicProcedure, router } from '@/server/trpc'

import { SigningTokenSchema, SubmitSignatureSchema } from '../schemas/signing'

interface SigningContractData {
  _id: string
  signatureStatus: string
  signatureId: string
  signerEmail: string
  contractStatus?: string
  contractDocument?: {
    asset?: {
      url?: string
    }
  }
  sponsor?: {
    name?: string
  }
  tier?: {
    title?: string
  }
  conference?: {
    title?: string
    startDate?: string
    city?: string
    organizer?: string
  }
  contractValue?: number
  contractCurrency?: string
}

const SIGNING_CONTRACT_QUERY = `*[_type == "sponsorForConference" && signatureId == $signingToken][0]{
  _id,
  signatureStatus,
  signatureId,
  signerEmail,
  contractStatus,
  contractDocument{
    asset->{
      url
    }
  },
  "sponsor": sponsor->{ name },
  "tier": tier->{ title },
  "conference": conference->{ title, startDate, city, organizer },
  contractValue,
  contractCurrency
}`

// Signature placement constants for the contract PDF.
// The signature is placed in the right-side block of the signing area.
const SIGNATURE_MAX_WIDTH = 150
const SIGNATURE_MAX_HEIGHT = 60
const SIGNATURE_X_RATIO = 0.55
const SIGNATURE_Y = 120
const SIGNER_NAME_OFFSET_Y = 12
const SIGNER_DATE_OFFSET_Y = 24

/**
 * Embeds a PNG signature image, signer name, and date into a contract PDF.
 * Returns the signed PDF as a Buffer.
 */
async function embedSignatureInPdf(
  pdfUrl: string,
  signatureDataUrl: string,
  signerName: string,
): Promise<Buffer> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')

  const pdfResponse = await fetch(pdfUrl)
  if (!pdfResponse.ok) {
    throw new Error(`Failed to fetch PDF: ${pdfResponse.statusText}`)
  }
  const pdfBytes = await pdfResponse.arrayBuffer()
  const pdfDoc = await PDFDocument.load(pdfBytes)

  // Decode signature PNG from data URL
  const base64Data = signatureDataUrl.replace('data:image/png;base64,', '')
  const signatureBytes = Buffer.from(base64Data, 'base64')
  const signatureImage = await pdfDoc.embedPng(signatureBytes)

  const firstPage = pdfDoc.getPage(0)
  const { width: pageWidth } = firstPage.getSize()

  // Scale the signature to fit within bounds
  const sigDims = signatureImage.scale(1)
  const scale = Math.min(
    SIGNATURE_MAX_WIDTH / sigDims.width,
    SIGNATURE_MAX_HEIGHT / sigDims.height,
    1,
  )
  const drawWidth = sigDims.width * scale
  const drawHeight = sigDims.height * scale

  const sigX =
    pageWidth * SIGNATURE_X_RATIO + (SIGNATURE_MAX_WIDTH - drawWidth) / 2
  const sigY = SIGNATURE_Y

  firstPage.drawImage(signatureImage, {
    x: sigX,
    y: sigY,
    width: drawWidth,
    height: drawHeight,
  })

  // Add signer name and date below the signature
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const dateStr = formatDate(getCurrentDateTime())

  firstPage.drawText(signerName, {
    x: sigX,
    y: sigY - SIGNER_NAME_OFFSET_Y,
    size: 9,
    font: helvetica,
    color: rgb(0.2, 0.2, 0.2),
  })

  firstPage.drawText(dateStr, {
    x: sigX,
    y: sigY - SIGNER_DATE_OFFSET_Y,
    size: 8,
    font: helvetica,
    color: rgb(0.4, 0.4, 0.4),
  })

  const signedBytes = await pdfDoc.save()
  return Buffer.from(signedBytes)
}

function ensurePendingContract(doc: SigningContractData): void {
  if (doc.signatureStatus === 'signed') {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'This contract has already been signed.',
    })
  }
  if (doc.signatureStatus === 'rejected' || doc.signatureStatus === 'expired') {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: `This contract has been ${doc.signatureStatus}. Please contact the organizer.`,
    })
  }
}

function sanitizeSponsorName(name?: string): string {
  return (name || 'sponsor')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export const signingRouter = router({
  getContract: publicProcedure
    .input(SigningTokenSchema)
    .query(async ({ input }) => {
      const doc = await clientReadUncached.fetch<SigningContractData | null>(
        SIGNING_CONTRACT_QUERY,
        { signingToken: input.token },
      )

      if (!doc) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Contract not found or link has expired.',
        })
      }

      if (doc.signatureStatus === 'signed') {
        return {
          status: 'signed' as const,
          sponsorName: doc.sponsor?.name,
          conferenceName: doc.conference?.title,
        }
      }

      ensurePendingContract(doc)

      return {
        status: 'pending' as const,
        sponsorName: doc.sponsor?.name,
        conferenceName: doc.conference?.title,
        conferenceCity: doc.conference?.city,
        conferenceStartDate: doc.conference?.startDate,
        organizer: doc.conference?.organizer,
        tierName: doc.tier?.title,
        contractValue: doc.contractValue,
        contractCurrency: doc.contractCurrency,
        signerEmail: doc.signerEmail,
        contractPdfUrl: doc.contractDocument?.asset?.url,
      }
    }),

  submitSignature: publicProcedure
    .input(SubmitSignatureSchema)
    .mutation(async ({ input }) => {
      const doc = await clientReadUncached.fetch<SigningContractData | null>(
        SIGNING_CONTRACT_QUERY,
        { signingToken: input.token },
      )

      if (!doc) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Contract not found or link has expired.',
        })
      }

      ensurePendingContract(doc)

      const pdfUrl = doc.contractDocument?.asset?.url
      if (!pdfUrl) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Contract PDF not found. Please contact the organizer.',
        })
      }

      // Embed signature into the contract PDF
      let signedPdfBuffer: Buffer
      try {
        signedPdfBuffer = await embedSignatureInPdf(
          pdfUrl,
          input.signatureDataUrl,
          input.signerName,
        )
      } catch (pdfError) {
        console.error('[signing] Failed to embed signature in PDF:', pdfError)
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message:
            'Failed to process the signed contract. Please try again or contact the organizer.',
          cause: pdfError,
        })
      }

      // Upload signed PDF to Sanity
      const filename = `contract-${sanitizeSponsorName(doc.sponsor?.name)}-signed.pdf`

      let asset: { _id: string }
      try {
        asset = await clientWrite.assets.upload('file', signedPdfBuffer, {
          filename,
          contentType: 'application/pdf',
        })
      } catch (uploadError) {
        console.error('[signing] Failed to upload signed PDF:', uploadError)
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to save the signed contract. Please try again.',
          cause: uploadError,
        })
      }

      // Update the sponsor record
      const now = getCurrentDateTime()
      try {
        await clientWrite
          .patch(doc._id)
          .set({
            signatureStatus: 'signed',
            contractStatus: 'contract-signed',
            contractSignedAt: now,
            contractSignedBy: input.signerName,
            contractDocument: {
              _type: 'file',
              asset: { _type: 'reference', _ref: asset._id },
            },
          })
          .commit()
      } catch (patchError) {
        console.error('[signing] Failed to update sponsor record:', patchError)
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message:
            'Signature was captured but failed to update the record. Please contact the organizer.',
          cause: patchError,
        })
      }

      // Log activity (non-critical — best-effort)
      try {
        await logSignatureStatusChange(
          doc._id,
          doc.signatureStatus ?? 'pending',
          'signed',
          'signer',
        )
        await logContractStatusChange(
          doc._id,
          doc.contractStatus ?? 'contract-sent',
          'contract-signed',
          'signer',
        )
      } catch (logError) {
        console.error('[signing] Failed to log signing activity:', logError)
      }

      return {
        success: true,
        sponsorName: doc.sponsor?.name,
        conferenceName: doc.conference?.title,
        conferenceCity: doc.conference?.city,
        organizer: doc.conference?.organizer,
        tierName: doc.tier?.title,
        contractValue: doc.contractValue,
        contractCurrency: doc.contractCurrency,
        signerName: input.signerName,
        signerEmail: doc.signerEmail,
        signedAt: now,
      }
    }),
})
