import { TRPCError } from '@trpc/server'

import { clientReadUncached, clientWrite } from '@/lib/sanity/client'
import { getCurrentDateTime } from '@/lib/time'
import { publicProcedure, router } from '@/server/trpc'

import { SigningTokenSchema, SubmitSignatureSchema } from '../schemas/signing'

interface SigningContractData {
  _id: string
  signatureStatus: string
  signatureId: string
  signerEmail: string
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

      if (
        doc.signatureStatus === 'rejected' ||
        doc.signatureStatus === 'expired'
      ) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: `This contract has been ${doc.signatureStatus}. Please contact the organizer.`,
        })
      }

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

      if (doc.signatureStatus === 'signed') {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'This contract has already been signed.',
        })
      }

      if (
        doc.signatureStatus === 'rejected' ||
        doc.signatureStatus === 'expired'
      ) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: `This contract has been ${doc.signatureStatus}. Please contact the organizer.`,
        })
      }

      // Embed signature into the contract PDF
      const pdfUrl = doc.contractDocument?.asset?.url
      if (!pdfUrl) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Contract PDF not found. Please contact the organizer.',
        })
      }

      let signedPdfBuffer: Buffer
      try {
        const { PDFDocument } = await import('pdf-lib')

        const pdfResponse = await fetch(pdfUrl)
        if (!pdfResponse.ok) {
          throw new Error(`Failed to fetch PDF: ${pdfResponse.statusText}`)
        }
        const pdfBytes = await pdfResponse.arrayBuffer()
        const pdfDoc = await PDFDocument.load(pdfBytes)

        // Decode signature PNG from data URL
        const base64Data = input.signatureDataUrl.replace(
          'data:image/png;base64,',
          '',
        )
        const signatureBytes = Buffer.from(base64Data, 'base64')
        const signatureImage = await pdfDoc.embedPng(signatureBytes)

        // Place signature on the last page of the main contract (page 1)
        // Position: right side of the signature area (sponsor/partner block)
        const firstPage = pdfDoc.getPage(0)
        const { width: pageWidth } = firstPage.getSize()

        // Scale the signature to fit (max 150x60)
        const maxWidth = 150
        const maxHeight = 60
        const sigDims = signatureImage.scale(1)
        const scale = Math.min(
          maxWidth / sigDims.width,
          maxHeight / sigDims.height,
          1,
        )
        const drawWidth = sigDims.width * scale
        const drawHeight = sigDims.height * scale

        // Position: right half of the page, above the signature line
        // The signature area is roughly at y=120 from bottom, right block
        // starts at roughly 55% of page width
        const sigX = pageWidth * 0.55 + (maxWidth - drawWidth) / 2
        const sigY = 120

        firstPage.drawImage(signatureImage, {
          x: sigX,
          y: sigY,
          width: drawWidth,
          height: drawHeight,
        })

        // Add signer name and date as text below the signature
        const { rgb } = await import('pdf-lib')
        const helvetica = await pdfDoc.embedFont('Helvetica' as never)
        const dateStr = new Date().toLocaleDateString('en-GB', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })

        firstPage.drawText(input.signerName, {
          x: sigX,
          y: sigY - 12,
          size: 9,
          font: helvetica,
          color: rgb(0.2, 0.2, 0.2),
        })

        firstPage.drawText(dateStr, {
          x: sigX,
          y: sigY - 24,
          size: 8,
          font: helvetica,
          color: rgb(0.4, 0.4, 0.4),
        })

        const signedBytes = await pdfDoc.save()
        signedPdfBuffer = Buffer.from(signedBytes)
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
      const safeName = (doc.sponsor?.name || 'sponsor')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
      const filename = `contract-${safeName}-signed.pdf`

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

      return {
        success: true,
        sponsorName: doc.sponsor?.name,
        conferenceName: doc.conference?.title,
      }
    }),
})
