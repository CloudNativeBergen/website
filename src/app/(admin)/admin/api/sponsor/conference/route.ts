import { NextAuthRequest, auth } from '@/lib/auth'
import { checkOrganizerAccess } from '@/lib/auth/admin'
import { ConferenceSponsorInput } from '@/lib/sponsor/types'
import {
  addSponsorToConference,
  removeSponsorFromConference,
} from '@/lib/sponsor/sanity'
import {
  conferenceSponsorResponse,
  conferenceSponsorResponseError,
} from '@/lib/sponsor/server'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'

export const dynamic = 'force-dynamic'

export const POST = auth(async (req: NextAuthRequest) => {
  // Check organizer access
  const accessError = checkOrganizerAccess(req)
  if (accessError) {
    return accessError
  }

  try {
    // Get conference from current domain
    const { conference, error: conferenceError } =
      await getConferenceForCurrentDomain()
    if (conferenceError || !conference) {
      return conferenceSponsorResponseError({
        message: 'Conference not found for current domain',
        type: 'not_found',
        status: 404,
      })
    }

    const data = (await req.json()) as ConferenceSponsorInput

    if (!data.sponsorId || !data.tierId) {
      return conferenceSponsorResponseError({
        message: 'Both sponsorId and tierId are required',
        type: 'validation',
        status: 400,
      })
    }

    const { error } = await addSponsorToConference(
      conference._id,
      data.sponsorId,
      data.tierId,
    )
    if (error) {
      return conferenceSponsorResponseError({
        error,
        message: 'Failed to add sponsor to conference',
      })
    }

    return conferenceSponsorResponse()
  } catch (error) {
    return conferenceSponsorResponseError({
      error: error as Error,
      message: 'Failed to process request',
    })
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as any

export const DELETE = auth(async (req: NextAuthRequest) => {
  // Check organizer access
  const accessError = checkOrganizerAccess(req)
  if (accessError) {
    return accessError
  }

  try {
    // Get conference from current domain
    const { conference, error: conferenceError } =
      await getConferenceForCurrentDomain()
    if (conferenceError || !conference) {
      return conferenceSponsorResponseError({
        message: 'Conference not found for current domain',
        type: 'not_found',
        status: 404,
      })
    }

    const { searchParams } = new URL(req.url!)
    const sponsorId = searchParams.get('sponsorId')

    if (!sponsorId) {
      return conferenceSponsorResponseError({
        message: 'sponsorId query parameter is required',
        type: 'validation',
        status: 400,
      })
    }

    const { error } = await removeSponsorFromConference(
      conference._id,
      sponsorId,
    )
    if (error) {
      return conferenceSponsorResponseError({
        error,
        message: 'Failed to remove sponsor from conference',
      })
    }

    return conferenceSponsorResponse()
  } catch (error) {
    return conferenceSponsorResponseError({
      error: error as Error,
      message: 'Failed to process request',
    })
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as any
