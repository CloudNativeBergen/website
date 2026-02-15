import { TRPCError } from '@trpc/server'

import { embedSignatureInPdf, type SigningAttestation } from '@/lib/pdf'
import { clientReadUncached, clientWrite } from '@/lib/sanity/client'
import {
  logContractStatusChange,
  logSignatureStatusChange,
} from '@/lib/sponsor-crm/activity'
import { sanitizeSponsorName } from '@/lib/sponsor-crm/utils'
import { getCurrentDateTime } from '@/lib/time'
import { publicProcedure, router } from '@/server/trpc'

import { SigningTokenSchema, SubmitSignatureSchema } from '../schemas/signing'

interface SigningContractData {
  _id: string
  signatureStatus: string
  signatureId: string
  signerEmail: string
  contractStatus?: string
  contractSentAt?: string
  organizerSignedBy?: string
  organizerSignedAt?: string
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
    sponsorEmail?: string
    domains?: string[]
    socialLinks?: string[]
  }
  contactPersons?: Array<{ name?: string; email?: string; isPrimary?: boolean }>
  contractValue?: number
  contractCurrency?: string
}

const SIGNING_CONTRACT_QUERY = `*[_type == "sponsorForConference" && signatureId == $signingToken][0]{
  _id,
  signatureStatus,
  signatureId,
  signerEmail,
  contractStatus,
  contractSentAt,
  organizerSignedBy,
  organizerSignedAt,
  contractDocument{
    asset->{
      url
    }
  },
  "sponsor": sponsor->{ name },
  "tier": tier->{ title },
  "conference": conference->{ title, startDate, city, organizer, sponsorEmail, domains, socialLinks },
  contactPersons[]{ name, email, isPrimary },
  contractValue,
  contractCurrency
}`

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
          contractPdfUrl: doc.contractDocument?.asset?.url,
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

      // Embed signature and append signing certificate
      const now = getCurrentDateTime()
      const attestation: SigningAttestation = {
        agreementName: `Sponsorship Agreement - ${doc.sponsor?.name || 'Sponsor'}`,
        transactionId: doc.signatureId,
        signerName: input.signerName,
        signerEmail: doc.signerEmail,
        organizerName: doc.conference?.organizer,
        organizerSignedBy: doc.organizerSignedBy,
        organizerSignedAt: doc.organizerSignedAt,
        contractSentAt: doc.contractSentAt,
        signedAt: now,
      }

      let signedPdfBuffer: Buffer
      try {
        signedPdfBuffer = await embedSignatureInPdf(
          pdfUrl,
          input.signatureDataUrl,
          input.signerName,
          attestation,
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
      const filename = `contract-${sanitizeSponsorName(doc.sponsor?.name || 'sponsor')}-signed.pdf`

      let asset: { _id: string; url: string }
      try {
        asset = (await clientWrite.assets.upload('file', signedPdfBuffer, {
          filename,
          contentType: 'application/pdf',
        })) as { _id: string; url: string }
      } catch (uploadError) {
        console.error('[signing] Failed to upload signed PDF:', uploadError)
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to save the signed contract. Please try again.',
          cause: uploadError,
        })
      }

      // Update the sponsor record
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

      // Send confirmation email (best-effort, non-critical)
      try {
        if (doc.conference?.sponsorEmail && doc.signerEmail) {
          const { renderContractEmail, CONTRACT_EMAIL_SLUGS } =
            await import('@/lib/email/contract-email')
          const { resend, retryWithBackoff } =
            await import('@/lib/email/config')

          const { formatNumber } = await import('@/lib/format')
          const contractValueStr = doc.contractValue
            ? `${formatNumber(doc.contractValue)} ${doc.contractCurrency || 'NOK'}`
            : undefined

          const result = await renderContractEmail(
            CONTRACT_EMAIL_SLUGS.SIGNED,
            {
              sponsorName: doc.sponsor?.name || 'Sponsor',
              signerName: input.signerName,
              tierName: doc.tier?.title,
              contractValue: contractValueStr,
              conference: {
                title: doc.conference.title || 'Cloud Native Day',
                city: doc.conference.city,
                startDate: doc.conference.startDate,
                domains: doc.conference.domains,
                organizer: doc.conference.organizer,
                sponsorEmail: doc.conference.sponsorEmail,
                socialLinks: doc.conference.socialLinks,
              },
            },
          )

          if (!result) {
            console.error('[signing] Contract email template not found')
          } else {
            const fromEmail = doc.conference.sponsorEmail
            const fromName = doc.conference.organizer || 'Cloud Native Days'

            await retryWithBackoff(async () => {
              return resend.emails.send({
                from: `${fromName} <${fromEmail}>`,
                to: [doc.signerEmail],
                subject: result.subject,
                react: result.react,
                attachments: [
                  {
                    filename,
                    content: signedPdfBuffer,
                  },
                ],
              })
            })

            console.log(
              `[signing] Confirmation email sent to ${doc.signerEmail}`,
            )
          }
        }
      } catch (emailError) {
        console.error(
          '[signing] Failed to send confirmation email:',
          emailError,
        )
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
        contractPdfUrl: asset.url,
      }
    }),
})
