import { clientWrite } from '@/lib/sanity/client'
import { getCurrentDateTime } from '@/lib/time'
import { getSponsorForConference } from './sanity'
import {
  findBestContractTemplate,
  getContractTemplate,
} from './contract-templates'
import { generateContractPdf } from './contract-pdf'
import type { ContractSigningProvider } from '@/lib/contract-signing'
import { logContractStatusChange, logSignatureStatusChange } from './activity'
import { sanitizeSponsorName } from './utils'

export interface SendContractResult {
  success: boolean
  agreementId?: string
  signingUrl?: string
  error?: string
}

/**
 * Generates a contract PDF and sends it for digital signing via the
 * configured contract signing provider.
 *
 * Used both by the admin manual send flow and the automated
 * registration completion flow.
 */
export async function generateAndSendContract(
  sponsorForConferenceId: string,
  signingProvider: ContractSigningProvider,
  options?: {
    templateId?: string
    signerName?: string
    signerEmail?: string
    actorId?: string
  },
): Promise<SendContractResult> {
  const logCtx = `[contract-send] sfc=${sponsorForConferenceId}`

  const { sponsorForConference: sfc, error: sfcError } =
    await getSponsorForConference(sponsorForConferenceId)

  if (sfcError || !sfc) {
    console.error(`${logCtx} Sponsor relationship lookup failed:`, sfcError)
    return { success: false, error: 'Sponsor relationship not found' }
  }

  const sponsorName = sfc.sponsor?.name || 'Unknown sponsor'
  const logCtxFull = `${logCtx} sponsor="${sponsorName}"`

  if (!sfc.sponsor?.name) {
    console.error(
      `${logCtxFull} Missing sponsor reference on sponsorForConference`,
    )
    return {
      success: false,
      error:
        'Sponsor details are missing. Please link a sponsor to this conference entry.',
    }
  }

  // Find the best template if not explicitly provided
  let templateId = options?.templateId
  if (!templateId) {
    const { template: best, error: bestError } = await findBestContractTemplate(
      sfc.conference._id,
      sfc.tier?._id,
    )
    if (bestError || !best) {
      console.error(`${logCtxFull} No contract template found:`, bestError)
      return {
        success: false,
        error: `No contract template found for tier "${sfc.tier?.title || 'unknown'}". Create a template in Settings first.`,
      }
    }
    templateId = best._id
  }

  const { template, error: templateError } =
    await getContractTemplate(templateId)
  if (templateError || !template) {
    console.error(
      `${logCtxFull} Template ${templateId} not found:`,
      templateError,
    )
    return {
      success: false,
      error: 'Contract template not found. It may have been deleted.',
    }
  }

  if (!sfc.conference?.title) {
    console.error(`${logCtxFull} Conference missing title`)
    return {
      success: false,
      error:
        'Conference title is required for contract generation. Update the conference settings.',
    }
  }

  const primaryContact =
    sfc.contactPersons?.find((c: { isPrimary?: boolean }) => c.isPrimary) ||
    sfc.contactPersons?.[0]

  if (!primaryContact?.name || !primaryContact?.email) {
    console.error(`${logCtxFull} Missing contact person with name and email`)
    return {
      success: false,
      error:
        'A contact person with name and email is required. Complete sponsor registration first.',
    }
  }

  const signerEmail =
    options?.signerEmail || sfc.signerEmail || primaryContact.email
  const signerName =
    options?.signerName || sfc.signerName || primaryContact.name

  // Generate the PDF
  let pdfBuffer: Buffer
  try {
    pdfBuffer = await generateContractPdf(template, {
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
        logoBright: sfc.conference.logoBright,
      },
    })
  } catch (pdfError) {
    console.error(`${logCtxFull} PDF generation failed:`, pdfError)
    return {
      success: false,
      error:
        'Failed to generate contract PDF. Check that the template is valid.',
    }
  }

  if (!pdfBuffer || pdfBuffer.length === 0) {
    console.error(`${logCtxFull} PDF generation returned empty buffer`)
    return {
      success: false,
      error:
        'Contract PDF generation produced an empty document. Check the template configuration.',
    }
  }

  const filename = `contract-${sanitizeSponsorName(sponsorName)}.pdf`

  // Upload PDF to Sanity
  let asset: { _id: string }
  try {
    asset = await clientWrite.assets.upload('file', pdfBuffer, {
      filename,
      contentType: 'application/pdf',
    })
  } catch (uploadError) {
    console.error(`${logCtxFull} Sanity asset upload failed:`, uploadError)
    return {
      success: false,
      error: 'Failed to upload contract PDF. Please try again.',
    }
  }

  if (!asset?._id) {
    console.error(`${logCtxFull} Asset upload returned no ID`)
    return {
      success: false,
      error: 'Contract PDF upload failed — no asset reference returned.',
    }
  }

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
    updateFields.signerName = signerName
    updateFields.signerEmail = signerEmail
    updateFields.signatureStatus = 'pending'
  }

  // Send for digital signing via the configured provider
  let agreementId: string | undefined
  let signingUrl: string | undefined
  if (signerEmail) {
    try {
      const result = await signingProvider.sendForSigning({
        pdf: pdfBuffer,
        filename,
        signerEmail,
        agreementName: `Sponsorship Agreement - ${sponsorName}`,
        message: `Please sign the sponsorship agreement for ${sfc.conference.title}.`,
      })

      agreementId = result.agreementId
      updateFields.signatureId = agreementId

      if (result.signingUrl) {
        signingUrl = result.signingUrl
        updateFields.signingUrl = signingUrl
      }
    } catch (signError) {
      console.error(
        `${logCtxFull} Contract signing agreement creation failed:`,
        signError,
      )
      return {
        success: false,
        error:
          'Failed to create digital signing agreement. The contract PDF was generated but not sent for signing. Please try again.',
      }
    }
  }

  try {
    await clientWrite.patch(sponsorForConferenceId).set(updateFields).commit()
  } catch (patchError) {
    console.error(`${logCtxFull} Failed to update sponsor record:`, patchError)
    return {
      success: false,
      error:
        'Contract was generated but failed to update the sponsor record. Please try again.',
    }
  }

  // Log activity (non-critical)
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
    console.error(
      `${logCtxFull} Failed to log contract send activity:`,
      logError,
    )
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
      console.error(
        `${logCtxFull} Failed to log signature status change:`,
        logError,
      )
    }
  }

  return { success: true, agreementId, signingUrl }
}
