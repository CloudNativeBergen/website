import { randomUUID } from 'crypto'
import {
  clientWrite,
  clientReadUncached as clientRead,
} from '@/lib/sanity/client'
import { getCurrentDateTime } from '@/lib/time'
import { prepareArrayWithKeys } from '@/lib/sanity/helpers'
import type { ContactPerson, BillingInfo } from '@/lib/sponsor/types'
import type { Conference } from '@/lib/conference/types'
import { WORKSHOP_EARLY_ACCESS_PATH } from '@/lib/workshop/sign-in-paths'
import { isPortalSigned } from './portal-phase'
import { scopedFetch } from '@/lib/sanity/scoped'

/**
 * What the portal shows a sponsor once the contract is signed (#1687, phase
 * 7). The token holder sees all of it, so it holds only this sponsor's own
 * invoice state and codes plus public event facts: no prices, notes, owners,
 * other sponsors or attendee data. Absent before signing.
 */
export interface PortalAfterSigning {
  invoiceStatus: string | null
  invoiceSentAt: string | null
  invoicePaidAt: string | null
  discountCodes: string[]
  /** Where the codes are redeemed; null means the conference's /tickets. */
  ticketUrl: string | null
  /** Site-relative early-access link, only while it still gives a head start. */
  earlyAccessPath: string | null
  workshopSponsorStart: string | null
  workshopOpening: string | null
  startDate: string | null
  endDate: string | null
  venueName: string | null
  venueAddress: string | null
  venueTravelInfo: string | null
  onsiteContact: {
    name: string | null
    email: string | null
  } | null
  contactEmail: string | null
  sponsorEmail: string | null
  /** The public /wall exists and its photos are not purged. */
  hasPhotoWall: boolean
}

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
  signerName: string | null
  signerEmail: string | null
  signatureStatus: string | null
  contractStatus: string | null
  signingUrl: string | null
  contractValue: number | null
  contractCurrency: string | null
  afterSigning?: PortalAfterSigning
}

export interface RegistrationSubmission {
  contactPersons: ContactPerson[]
  billing: BillingInfo
  logo: string
  logoBright?: string | null
  orgNumber: string
  address: string
  signerName?: string
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

    // No token yet — mint one ATOMICALLY: two concurrent first sends (or an
    // open of the Send modal racing a "Copy link") both read null here;
    // `setIfMissing` lets the first writer win and the committed document
    // tells the loser which token is actually stored, so no email ever
    // carries a token that was overwritten a moment later.
    const token = randomUUID()
    const stored = await clientWrite
      .patch(sponsorForConferenceId)
      .setIfMissing({
        registrationToken: token,
        registrationComplete: false,
      })
      .commit<{ registrationToken?: string | null }>()

    return { token: stored?.registrationToken || token }
  } catch (error) {
    console.error(
      `[registration] Failed to generate token for sfc=${sponsorForConferenceId}:`,
      error,
    )
    return { error: error as Error }
  }
}

type RawAfterSigning = Omit<
  PortalAfterSigning,
  'earlyAccessPath' | 'hasPhotoWall'
> & {
  earlyAccessToken?: string | null
  conferenceId?: string | null
  hasPhotoWall?: boolean
}

/**
 * Drops the after-signing block before the contract is signed, and turns the
 * early-access token into a link only while it gives a head start (the same
 * window the early-access email offers). Exported for tests.
 */
export function withAfterSigning(
  raw: Omit<RegistrationSponsorInfo, 'afterSigning'> & {
    afterSigning?: RawAfterSigning
  },
  now: Date = new Date(),
): RegistrationSponsorInfo {
  const { afterSigning, ...sponsor } = raw
  if (!afterSigning || !isPortalSigned(sponsor)) return sponsor
  const {
    earlyAccessToken,
    // The conference id is only for the photo-wall lookup: not sent on.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    conferenceId,
    ...rest
  } = afterSigning
  const { workshopSponsorStart: from, workshopOpening: to } = rest
  const headStart =
    !!earlyAccessToken &&
    !!from &&
    !!to &&
    new Date(from) < new Date(to) &&
    now < new Date(to)
  return {
    ...sponsor,
    afterSigning: {
      ...rest,
      hasPhotoWall: rest.hasPhotoWall ?? false,
      onsiteContact: rest.onsiteContact
        ? { name: rest.onsiteContact.name, email: rest.onsiteContact.email }
        : null,
      earlyAccessPath: headStart
        ? `${WORKSHOP_EARLY_ACCESS_PATH}/${encodeURIComponent(earlyAccessToken)}`
        : null,
    },
  }
}

/** Whether `/wall` exists for the conference and its photos are not purged. */
async function hasLivePhotoWall(conferenceId: string): Promise<boolean> {
  const id = await scopedFetch<string | null>(
    clientRead,
    { conferenceId },
    `*[_type == "photoWall" && !defined(purgedAt) && !(_id in path("drafts.**"))][0]._id`,
    {},
  )
  return !!id
}

export async function validateRegistrationToken(
  token: string,
): Promise<{ sponsor?: RegistrationSponsorInfo; error?: Error }> {
  if (!token) {
    return { error: new Error('Registration token is required') }
  }

  try {
    const result = await clientRead.fetch<
      | (Omit<RegistrationSponsorInfo, 'afterSigning'> & {
          afterSigning?: RawAfterSigning
        })
      | null
    >(
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
        billing{ invoiceFormat, email, reference, comments },
        registrationComplete,
        signerName,
        signerEmail,
        signatureStatus,
        contractStatus,
        signingUrl,
        contractValue,
        contractCurrency,
        "afterSigning": {
          invoiceStatus,
          invoiceSentAt,
          invoicePaidAt,
          "discountCodes": coalesce(discountCodes[].code, []),
          "ticketUrl": coalesce(conference->sponsorRegistrationLink, conference->registrationLink),
          "earlyAccessToken": workshopEarlyAccessToken,
          "workshopSponsorStart": conference->workshopRegistrationSponsorStart,
          "workshopOpening": conference->workshopRegistrationStart,
          "startDate": conference->startDate,
          "endDate": conference->endDate,
          "venueName": conference->venueName,
          "venueAddress": conference->venueAddress,
          "venueTravelInfo": conference->venueTravelInfo,
          "onsiteContact": conference->speakerInfo.onsiteContact{ name, email },
          "contactEmail": conference->contactEmail,
          "sponsorEmail": conference->sponsorEmail,
          "conferenceId": conference._ref
        }
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

    const conferenceId = result.afterSigning?.conferenceId
    if (result.afterSigning && conferenceId && isPortalSigned(result)) {
      result.afterSigning.hasPhotoWall = await hasLivePhotoWall(conferenceId)
    }
    return { sponsor: withAfterSigning(result) }
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

  if (!data.logo) {
    return {
      error: new Error('Company logo is required to complete registration'),
    }
  }

  if (!data.address?.trim()) {
    return {
      error: new Error('Company address is required to complete registration'),
    }
  }

  if (!data.orgNumber?.trim()) {
    return {
      error: new Error(
        'Organization number is required to complete registration',
      ),
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
      sfcUpdate.signerName = data.signerName
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

export interface SfcNotificationData {
  _id: string
  sponsorName: string
  ownerName: string | null
  tierTitle: string | null
  contractValue: number | null
  contractCurrency: string | null
  conference: Conference | null
}

export async function getSfcForNotification(
  sfcId: string,
): Promise<SfcNotificationData | null> {
  return clientRead.fetch<SfcNotificationData | null>(
    `*[_type == "sponsorForConference" && _id == $id][0]{
      _id,
      "sponsorName": sponsor->name,
      "ownerName": assignedTo->name,
      "tierTitle": tier->title,
      contractValue,
      contractCurrency,
      "conference": conference->{ ... }
    }`,
    { id: sfcId },
  )
}
