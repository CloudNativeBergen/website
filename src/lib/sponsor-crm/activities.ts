import { clientReadUncached as clientRead } from '@/lib/sanity/client'
import type { SponsorActivityExpanded } from './types'

const SPONSOR_ACTIVITY_FIELDS = `
  _id,
  _createdAt,
  _updatedAt,
  sponsor_for_conference->{
    _id,
    sponsor->{
      _id,
      name
    }
  },
  activity_type,
  description,
  metadata,
  created_by->{
    _id,
    name,
    email,
    avatar
  },
  created_at
`

export async function listActivitiesForSponsor(
  sponsorForConferenceId: string,
): Promise<{
  activities?: SponsorActivityExpanded[]
  error?: Error
}> {
  try {
    const activities = await clientRead.fetch<SponsorActivityExpanded[]>(
      `*[_type == "sponsorActivity" && sponsor_for_conference._ref == $sponsorId] | order(created_at desc){${SPONSOR_ACTIVITY_FIELDS}}`,
      { sponsorId: sponsorForConferenceId },
    )

    return { activities }
  } catch (error) {
    return { error: error as Error }
  }
}
