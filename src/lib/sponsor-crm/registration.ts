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
  if (!sponsorForConferenceId) {
    return { error: new Error('Sponsor relationship ID is required') }
  }

  try {
    // Check for existing token — never overwrite a completed registration
    const existing = await clientRead.fetch<{
      registrationToken: string | null
      registrationComplete: boolean
    }>(
      `*[_type == "sponsorForConference" && _id == $id][0]{
        registrationToken, registrationComplete
      }`,
      { id: sponsorForConferenceId },
    )

    if (!existing) {
      return { error: new Error('Sponsor relationship not found') }
    }

    if (existing.registrationComplete) {
      // Registration already done — return existing token without resetting
      if (existing.registrationToken) {
        return { token: existing.registrationToken }
      }
      return {
        error: new Error(
          'Registration is already complete. Cannot generate a new token.',
        ),
      }
    }

    // Reuse existing token if one is already set
    if (existing.registrationToken) {
      return { token: existing.registrationToken }
    }

    // No token yet — generate a fresh one
    const token = randomUUID()
    await clientWrite
      .patch(sponsorForConferenceId)
      .set({
        registrationToken: token,
        registrationComplete: false,
      })
      .commit()

    return { token }
  } catch (error) {
    console.error(
      `[registration] Failed to generate token for sfc=${sponsorForConferenceId}:`,
      error,
    )
    return { error: error as Error }
  }
}

export async function validateRegistrationToken(
  token: string,
): Promise<{ sponsor?: RegistrationSponsorInfo; error?: Error }> {
  if (!token) {
    return { error: new Error('Registration token is required') }
  }

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

    if (!result._id) {
      console.error('[registration] Token lookup returned document without _id')
      return { error: new Error('Invalid registration data') }
    }

    return { sponsor: result }
  } catch (error) {
    console.error('[registration] Token validation failed:', error)
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
  if (!token) {
    return { error: new Error('Registration token is required') }
  }

  if (!data.contactPersons || data.contactPersons.length === 0) {
    return {
      error: new Error(
        'At least one contact person is required to complete registration',
      ),
    }
  }

  const invalidContacts = data.contactPersons.filter((c) => !c.name || !c.email)
  if (invalidContacts.length > 0) {
    return {
      error: new Error(
        'All contact persons must have a name and email address',
      ),
    }
  }

  if (!data.billing?.email) {
    return {
      error: new Error('Billing email is required to complete registration'),
    }
  }

  try {
    const { sponsor, error: validateError } =
      await validateRegistrationToken(token)

    if (validateError || !sponsor) {
      return { error: validateError || new Error('Invalid registration token') }
    }

    if (sponsor.registrationComplete) {
      return { error: new Error('Registration has already been completed') }
    }

    const logCtx = `[registration] sfc=${sponsor._id} sponsor="${sponsor.sponsorName}"`
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
      } else {
        console.warn(
          `${logCtx} No sponsor reference found — skipping company info updates`,
        )
      }
    }

    await transaction.commit()

    return { success: true, sponsorForConferenceId: sponsor._id }
  } catch (error) {
    console.error('[registration] Registration completion failed:', error)
    return { error: error as Error }
  }
}

export function buildPortalUrl(baseUrl: string, token: string): string {
  return `${baseUrl}/sponsor/portal/${token}`
}
