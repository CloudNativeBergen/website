import { randomUUID } from 'crypto'
import {
  clientWrite,
  clientReadUncached as clientRead,
} from '@/lib/sanity/client'
import { getCurrentDateTime } from '@/lib/time'
import { prepareArrayWithKeys } from '@/lib/sanity/helpers'
import type { ContactPerson, BillingInfo } from '@/lib/sponsor/types'

export interface OnboardingSponsorInfo {
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
  onboardingComplete: boolean
}

export interface OnboardingSubmission {
  contactPersons: ContactPerson[]
  billing: BillingInfo
  logo?: string | null
  logoBright?: string | null
  orgNumber?: string
  address?: string
}

export async function generateOnboardingToken(
  sponsorForConferenceId: string,
): Promise<{ token?: string; error?: Error }> {
  try {
    const token = randomUUID()
    await clientWrite
      .patch(sponsorForConferenceId)
      .set({
        onboardingToken: token,
        onboardingComplete: false,
      })
      .unset(['onboardingCompletedAt'])
      .commit()

    return { token }
  } catch (error) {
    return { error: error as Error }
  }
}

export async function validateOnboardingToken(
  token: string,
): Promise<{ sponsor?: OnboardingSponsorInfo; error?: Error }> {
  try {
    const result = await clientRead.fetch<OnboardingSponsorInfo | null>(
      `*[_type == "sponsorForConference" && onboardingToken == $onboardingToken][0]{
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
        onboardingComplete
      }`,
      { onboardingToken: token },
    )

    if (!result) {
      return { error: new Error('Invalid or expired onboarding token') }
    }

    return { sponsor: result }
  } catch (error) {
    return { error: error as Error }
  }
}

export async function completeOnboarding(
  token: string,
  data: OnboardingSubmission,
): Promise<{
  success?: boolean
  sponsorForConferenceId?: string
  error?: Error
}> {
  try {
    const { sponsor, error: validateError } =
      await validateOnboardingToken(token)

    if (validateError || !sponsor) {
      return { error: validateError || new Error('Invalid onboarding token') }
    }

    if (sponsor.onboardingComplete) {
      return { error: new Error('Onboarding has already been completed') }
    }

    const contactPersons = prepareArrayWithKeys(data.contactPersons, 'contact')

    await clientWrite
      .patch(sponsor._id)
      .set({
        contactPersons,
        billing: data.billing,
        onboardingComplete: true,
        onboardingCompletedAt: getCurrentDateTime(),
      })
      .commit()

    if (data.logo || data.logoBright || data.orgNumber || data.address) {
      const sfcDoc = await clientRead.fetch<{ sponsor: { _ref: string } }>(
        `*[_type == "sponsorForConference" && _id == $id][0]{ sponsor }`,
        { id: sponsor._id },
      )

      if (sfcDoc?.sponsor?._ref) {
        const sponsorUpdates: Record<string, unknown> = {}
        if (data.logo) sponsorUpdates.logo = data.logo
        if (data.logoBright) sponsorUpdates.logoBright = data.logoBright
        if (data.orgNumber) sponsorUpdates.orgNumber = data.orgNumber
        if (data.address) sponsorUpdates.address = data.address

        await clientWrite
          .patch(sfcDoc.sponsor._ref)
          .set(sponsorUpdates)
          .commit()
      }
    }

    return { success: true, sponsorForConferenceId: sponsor._id }
  } catch (error) {
    return { error: error as Error }
  }
}

export function buildOnboardingUrl(baseUrl: string, token: string): string {
  return `${baseUrl}/sponsor/onboarding/${token}`
}
