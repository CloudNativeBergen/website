import { clientReadUncached as clientRead } from '@/lib/sanity/client'
import type {
  ActivityType,
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

export const ACTIVITY_LOG_PAGE_SIZE = 50

export interface ActivityLogFilters {
  /** A sponsorForConference id. */
  sponsor?: string
  /** The organizer assigned to the sponsor (its CRM owner). */
  owner?: string
  type?: ActivityType
}

/**
 * The full activity log (#1704 A1): every activity of the conference, newest
 * first, filtered and paged by offset. Activities carry no conference ref of
 * their own, so the scope goes through the parent sponsorForConference. One
 * row past the page is read to tell whether another page exists.
 */
export function buildActivityLogQuery(filters: ActivityLogFilters): string {
  // Only fixed, param-bound clauses are appended; never user text.
  const extra = [
    filters.sponsor && ' && sponsorForConference._ref == $sponsor',
    filters.owner && ' && sponsorForConference->assignedTo._ref == $owner',
    filters.type && ' && activityType == $type',
  ]
    .filter(Boolean)
    .join('')
  // groq-global-scoped: the literal conference predicate leads the filter; `extra` only narrows it with fixed param-bound clauses.
  return `*[_type == "sponsorActivity" && sponsorForConference->conference._ref == $conferenceId${extra}] | order(createdAt desc, _id desc) [$offset...$end]{${SPONSOR_ACTIVITY_FIELDS}}`
}

export function activityLogParams(
  conferenceId: string,
  filters: ActivityLogFilters,
  offset: number,
) {
  return {
    conferenceId,
    ...(filters.sponsor && { sponsor: filters.sponsor }),
    ...(filters.owner && { owner: filters.owner }),
    ...(filters.type && { type: filters.type }),
    offset,
    end: offset + ACTIVITY_LOG_PAGE_SIZE + 1,
  }
}

export function toActivityLogPage(
  rows: SponsorActivityExpanded[],
  offset: number,
): { items: SponsorActivityExpanded[]; nextCursor: number | null } {
  return {
    items: rows.slice(0, ACTIVITY_LOG_PAGE_SIZE),
    nextCursor:
      rows.length > ACTIVITY_LOG_PAGE_SIZE
        ? offset + ACTIVITY_LOG_PAGE_SIZE
        : null,
  }
}

export async function listActivityLog(
  conferenceId: string,
  filters: ActivityLogFilters,
  offset = 0,
) {
  const rows = await clientRead.fetch<SponsorActivityExpanded[]>(
    buildActivityLogQuery(filters),
    activityLogParams(conferenceId, filters, offset),
  )
  return toActivityLogPage(rows, offset)
}
