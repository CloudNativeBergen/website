import { clientWrite } from '@/lib/sanity/client'
import { getCurrentDateTime } from '@/lib/time'
import { getSponsorForConference } from './sanity'
import {
  findBestContractTemplate,
  getContractTemplate,
} from './contract-templates'
import { generateContractPdf } from './contract-pdf'
import { uploadTransientDocument, createAgreement } from '@/lib/adobe-sign'
import type { AdobeSignSession } from '@/lib/adobe-sign'
import { logContractStatusChange, logSignatureStatusChange } from './activity'

export interface SendContractResult {
  success: boolean
  agreementId?: string
  error?: string
}

/**
 * Generates a contract PDF and sends it for digital signing via Adobe Sign.
 * Used both by the admin manual send flow and the automated onboarding completion flow.
 */
export async function generateAndSendContract(
  sponsorForConferenceId: string,
  session: AdobeSignSession,
  options?: {
    templateId?: string
    signerEmail?: string
    actorId?: string
  },
): Promise<SendContractResult> {
  const { sponsorForConference: sfc, error: sfcError } =
    await getSponsorForConference(sponsorForConferenceId)

  if (sfcError || !sfc) {
    return { success: false, error: 'Sponsor relationship not found' }
  }

  // Find the best template if not explicitly provided
  let templateId = options?.templateId
  if (!templateId) {
    const { template: best, error: bestError } = await findBestContractTemplate(
      sfc.conference._id,
      sfc.tier?._id,
    )
    if (bestError || !best) {
      return { success: false, error: 'No contract template found' }
    }
    templateId = best._id
  }

  const { template, error: templateError } = await getContractTemplate(
    templateId!,
  )
  if (templateError || !template) {
    return { success: false, error: 'Contract template not found' }
  }

  if (!sfc.conference?.title) {
    return {
      success: false,
      error: 'Conference title is required for contract generation',
    }
  }

  const primaryContact =
    sfc.contactPersons?.find((c: { isPrimary?: boolean }) => c.isPrimary) ||
    sfc.contactPersons?.[0]

  if (!primaryContact?.name || !primaryContact?.email) {
    return {
      success: false,
      error: 'A contact person with name and email is required',
    }
  }

  const signerEmail =
    options?.signerEmail || sfc.signerEmail || primaryContact.email

  try {
    // Generate the PDF
    const pdfBuffer = await generateContractPdf(template, {
      sponsor: {
        name: sfc.sponsor.name,
        orgNumber: sfc.sponsor.orgNumber,
        address: sfc.sponsor.address,
        website: sfc.sponsor.website,
      },
      contactPerson: { name: primaryContact.name, email: primaryContact.email },
      tier: sfc.tier
        ? { title: sfc.tier.title, tagline: sfc.tier.tagline }
        : undefined,
      addons: sfc.addons?.map((a) => ({ title: a.title })),
      contractValue: sfc.contractValue,
      contractCurrency: sfc.contractCurrency,
      conference: {
        title: sfc.conference.title,
        startDate: sfc.conference.startDate,
        endDate: sfc.conference.endDate,
        city: sfc.conference.city,
        organizer: sfc.conference.organizer,
        organizerOrgNumber: sfc.conference.organizerOrgNumber,
        organizerAddress: sfc.conference.organizerAddress,
        venueName: sfc.conference.venueName,
        venueAddress: sfc.conference.venueAddress,
        sponsorEmail: sfc.conference.sponsorEmail,
      },
    })

    const filename = `contract-${sfc.sponsor.name.toLowerCase().replace(/\s+/g, '-')}.pdf`

    // Upload PDF to Sanity
    const asset = await clientWrite.assets.upload('file', pdfBuffer, {
      filename,
      contentType: 'application/pdf',
    })

    const now = getCurrentDateTime()
    const updateFields: Record<string, unknown> = {
      contractStatus: 'contract-sent',
      contractSentAt: now,
      contractTemplate: { _type: 'reference', _ref: templateId },
      contractDocument: {
        _type: 'file',
        asset: { _type: 'reference', _ref: asset._id },
      },
    }

    if (signerEmail) {
      updateFields.signerEmail = signerEmail
      updateFields.signatureStatus = 'pending'
    }

    // Send to Adobe Sign
    let agreementId: string | undefined
    if (signerEmail) {
      try {
        const transientDoc = await uploadTransientDocument(
          session,
          pdfBuffer,
          filename,
        )
        const agreement = await createAgreement(session, {
          name: `Sponsorship Agreement - ${sfc.sponsor.name}`,
          participantEmail: signerEmail,
          message: `Please sign the sponsorship agreement for ${sfc.conference.title}.`,
          fileInfos: [
            { transientDocumentId: transientDoc.transientDocumentId },
          ],
        })
        agreementId = agreement.id
        updateFields.signatureId = agreementId
      } catch (signError) {
        console.error('Adobe Sign agreement creation failed:', signError)
      }
    }

    await clientWrite.patch(sponsorForConferenceId).set(updateFields).commit()

    // Log activity
    const actorId = options?.actorId || 'system'
    const oldContractStatus = sfc.contractStatus
    try {
      await logContractStatusChange(
        sponsorForConferenceId,
        oldContractStatus,
        'contract-sent',
        actorId,
      )
    } catch (logError) {
      console.error('Failed to log contract send activity:', logError)
    }

    if (signerEmail) {
      const oldSignatureStatus = sfc.signatureStatus ?? 'not-started'
      try {
        await logSignatureStatusChange(
          sponsorForConferenceId,
          oldSignatureStatus,
          'pending',
          actorId,
        )
      } catch (logError) {
        console.error('Failed to log signature status change:', logError)
      }
    }

    return { success: true, agreementId }
  } catch (error) {
    console.error('Contract generation/send failed:', error)
    return {
      success: false,
      error:
        error instanceof Error ? error.message : 'Contract generation failed',
    }
  }
}
