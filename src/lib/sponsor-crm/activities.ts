import { clientReadUncached as clientRead } from '@/lib/sanity/client'
import type { SponsorActivityExpanded } from './types'

const SPONSOR_ACTIVITY_FIELDS = `
  _id,
  _createdAt,
  _updatedAt,
  sponsorForConference->{
    _id,
    sponsor->{
      _id,
      name
    }
  },
  activityType,
  description,
  metadata,
  createdBy->{
    _id,
    name,
    email,
    "image": coalesce(image.asset->url, imageURL)
  },
  createdAt
`

export async function listActivitiesForSponsor(
  sponsorForConferenceId: string,
  limit?: number,
): Promise<{
  activities?: SponsorActivityExpanded[]
  error?: Error
}> {
  try {
    const limitClause = limit ? ` [0...${limit}]` : ''
    const activities = await clientRead.fetch<SponsorActivityExpanded[]>(
      `*[_type == "sponsorActivity" && sponsorForConference._ref == $sponsorId] | order(createdAt desc)${limitClause}{${SPONSOR_ACTIVITY_FIELDS}}`,
      { sponsorId: sponsorForConferenceId },
    )

    return { activities }
  } catch (error) {
    return { error: error as Error }
  }
}

export async function listActivitiesForConference(
  conferenceId: string,
  limit?: number,
): Promise<{
  activities?: SponsorActivityExpanded[]
  error?: Error
}> {
  try {
    const limitClause = limit ? ` [0...${limit}]` : ''
    const activities = await clientRead.fetch<SponsorActivityExpanded[]>(
      `*[_type == "sponsorActivity" && sponsorForConference->conference._ref == $conferenceId] | order(createdAt desc)${limitClause}{${SPONSOR_ACTIVITY_FIELDS}}`,
      { conferenceId },
    )

    return { activities }
  } catch (error) {
    return { error: error as Error }
  }
}
