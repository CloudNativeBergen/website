import { randomUUID } from 'crypto'
import {
  clientWrite,
  clientReadUncached as clientRead,
} from '@/lib/sanity/client'
import { getCurrentDateTime } from '@/lib/time'
import { prepareArrayWithKeys } from '@/lib/sanity/helpers'
import type { ContactPerson, BillingInfo } from '@/lib/sponsor/types'

export interface RegistrationSponsorInfo {
  _id: string
  sponsorName: string
  sponsorWebsite: string
  sponsorLogo: string | null
  sponsorLogoBright: string | null
  sponsorOrgNumber: string | null
  sponsorAddress: string | null
  tierTitle: string | null
  conferenceName: string
  conferenceStartDate: string | null
  contactPersons: ContactPerson[]
  billing: BillingInfo | null
  registrationComplete: boolean
  signerEmail: string | null
  signatureStatus: string | null
  contractStatus: string | null
  signingUrl: string | null
  contractValue: number | null
  contractCurrency: string | null
}

export interface RegistrationSubmission {
  contactPersons: ContactPerson[]
  billing: BillingInfo
  logo?: string | null
  logoBright?: string | null
  orgNumber?: string
  address?: string
  signerEmail?: string
}

export async function generateRegistrationToken(
  sponsorForConferenceId: string,
): Promise<{ token?: string; error?: Error }> {
  try {
    const token = randomUUID()
    await clientWrite
      .patch(sponsorForConferenceId)
      .set({
        registrationToken: token,
        registrationComplete: false,
      })
      .unset(['registrationCompletedAt'])
      .commit()

    return { token }
  } catch (error) {
    return { error: error as Error }
  }
}

export async function validateRegistrationToken(
  token: string,
): Promise<{ sponsor?: RegistrationSponsorInfo; error?: Error }> {
  try {
    const result = await clientRead.fetch<RegistrationSponsorInfo | null>(
      `*[_type == "sponsorForConference" && registrationToken == $registrationToken][0]{
        _id,
        "sponsorName": sponsor->name,
        "sponsorWebsite": sponsor->website,
        "sponsorLogo": sponsor->logo,
        "sponsorLogoBright": sponsor->logoBright,
        "sponsorOrgNumber": sponsor->orgNumber,
        "sponsorAddress": sponsor->address,
        "tierTitle": tier->title,
        "conferenceName": conference->title,
        "conferenceStartDate": conference->startDate,
        contactPersons[]{ _key, name, email, phone, role, isPrimary },
        billing{ email, reference, comments },
        registrationComplete,
        signerEmail,
        signatureStatus,
        contractStatus,
        signingUrl,
        contractValue,
        contractCurrency
      }`,
      { registrationToken: token },
    )

    if (!result) {
      return { error: new Error('Invalid or expired registration token') }
    }

    return { sponsor: result }
  } catch (error) {
    return { error: error as Error }
  }
}

export async function completeRegistration(
  token: string,
  data: RegistrationSubmission,
): Promise<{
  success?: boolean
  sponsorForConferenceId?: string
  error?: Error
}> {
  try {
    const { sponsor, error: validateError } =
      await validateRegistrationToken(token)

    if (validateError || !sponsor) {
      return { error: validateError || new Error('Invalid registration token') }
    }

    if (sponsor.registrationComplete) {
      return { error: new Error('Registration has already been completed') }
    }

    const contactPersons = prepareArrayWithKeys(data.contactPersons, 'contact')

    // Build sponsor updates if any company info was provided
    const sponsorUpdates: Record<string, unknown> = {}
    if (data.logo) sponsorUpdates.logo = data.logo
    if (data.logoBright) sponsorUpdates.logoBright = data.logoBright
    if (data.orgNumber) sponsorUpdates.orgNumber = data.orgNumber
    if (data.address) sponsorUpdates.address = data.address

    // Use transaction for atomic updates to both documents
    const transaction = clientWrite.transaction()

    // Always update the sponsorForConference document
    const sfcUpdate: Record<string, unknown> = {
      contactPersons,
      billing: data.billing,
      registrationComplete: true,
      registrationCompletedAt: getCurrentDateTime(),
    }
    if (data.signerEmail) {
      sfcUpdate.signerEmail = data.signerEmail
    }
    transaction.patch(sponsor._id, { set: sfcUpdate })

    // Conditionally update the sponsor document if there are updates
    if (Object.keys(sponsorUpdates).length > 0) {
      const sfcDoc = await clientRead.fetch<{ sponsor: { _ref: string } }>(
        `*[_type == "sponsorForConference" && _id == $id][0]{ sponsor }`,
        { id: sponsor._id },
      )

      if (sfcDoc?.sponsor?._ref) {
        transaction.patch(sfcDoc.sponsor._ref, {
          set: sponsorUpdates,
        })
      }
    }

    await transaction.commit()

    return { success: true, sponsorForConferenceId: sponsor._id }
  } catch (error) {
    return { error: error as Error }
  }
}

export function buildPortalUrl(baseUrl: string, token: string): string {
  return `${baseUrl}/sponsor/portal/${token}`
}
