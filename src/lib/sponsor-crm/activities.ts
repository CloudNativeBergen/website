import { clientReadUncached as clientRead } from '@/lib/sanity/client'
import type {
  CommunicationKind,
  SponsorActivityExpanded,
  SponsorCommunicationRecord,
} from './types'

// The SUMMARY projection. A sent-communication record's `body` (rendered
// HTML) and `attachments` are deliberately absent here — the feed stays cheap
// and they load on expand via `getCommunicationRecord` (#1261).
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
  createdAt,
  communicationKind,
  recipients[]{ contactKey, name, email, role, isDefault },
  subject,
  deliveryStatus,
  error,
  "templateId": template._ref,
  template->{ _id, title },
  templateEdited,
  providerMessageId
`

const SPONSOR_COMMUNICATION_FIELDS = `
  ${SPONSOR_ACTIVITY_FIELDS},
  body,
  attachments[]{ label, url }
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

/**
 * One sent-communication record IN FULL (body and attachments included).
 * Scoped to the conference through the parent sponsor: a record of another
 * tenant's sponsor, or a plain id miss, both read as `null`.
 */
export async function getCommunicationRecord(
  activityId: string,
  conferenceId: string,
): Promise<{ record?: SponsorCommunicationRecord | null; error?: Error }> {
  try {
    const record = await clientRead.fetch<SponsorCommunicationRecord | null>(
      `*[_type == "sponsorActivity" && _id == $activityId && defined(communicationKind) && sponsorForConference->conference._ref == $conferenceId][0]{${SPONSOR_COMMUNICATION_FIELDS}}`,
      { activityId, conferenceId },
    )
    return { record }
  } catch (error) {
    return { error: error as Error }
  }
}

/**
 * The Communications tab: only sends, newest first, optionally one kind,
 * paginated by offset so "load more" is a second call with the same filter.
 */
export async function listCommunicationsForSponsor(
  sponsorForConferenceId: string,
  conferenceId: string,
  options: { kind?: CommunicationKind; offset?: number; limit?: number } = {},
): Promise<{
  items?: SponsorActivityExpanded[]
  total?: number
  error?: Error
}> {
  const offset = Math.max(0, options.offset ?? 0)
  const limit = Math.min(100, Math.max(1, options.limit ?? 20))
  try {
    // Both roots carry the conference predicate as well as the sponsor id,
    // so a sponsor of another tenant reads as empty even if the caller's
    // guard were ever removed. A null `$kind` means every kind.
    const result = await clientRead.fetch<{
      items: SponsorActivityExpanded[]
      total: number
    }>(
      `{
        "items": *[_type == "sponsorActivity" && sponsorForConference._ref == $sponsorId && sponsorForConference->conference._ref == $conferenceId && defined(communicationKind) && ($kind == null || communicationKind == $kind)] | order(createdAt desc) [$offset...$end]{${SPONSOR_ACTIVITY_FIELDS}},
        "total": count(*[_type == "sponsorActivity" && sponsorForConference._ref == $sponsorId && sponsorForConference->conference._ref == $conferenceId && defined(communicationKind) && ($kind == null || communicationKind == $kind)])
      }`,
      {
        sponsorId: sponsorForConferenceId,
        conferenceId,
        kind: options.kind ?? null,
        offset,
        end: offset + limit,
      },
    )
    return { items: result.items, total: result.total }
  } catch (error) {
    return { error: error as Error }
  }
}
