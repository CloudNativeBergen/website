/**
 * The reads the save and approval checks (tagging spec §4.3, §4.4) and the
 * editor's tag button (§2) need. Every read is tenant-scoped through
 * `scopedFetch`, and the caller has proven any id it passes belongs to the
 * request's conference BEFORE calling (guard before fetch).
 */

import { clientReadUncached } from '@/lib/sanity/client'
import { scopedFetch } from '@/lib/sanity/scoped'
import { blueskyHandlesFromLinks, parseBlueskyHandle } from './handle'
import type { TaggablePerson } from './checks'
import type { MentionRecord } from './body'
import {
  MENTION_RECORD_PROJECTION,
  mentionRecordsFrom,
  type RawMentionRecord,
} from './records'

/** What the checks read off a speaker: `RawTaggablePerson`. */
const PERSON_FIELDS = '{ _id, name, links, socialTagOptOut, erasedAt }'

/**
 * What the checks read off a sponsor company (spec §3.3): its CRM handle, and
 * no opt-out — the organizer's own entry about a commercial partner.
 */
const SPONSOR_FIELDS = '{ _id, name, blueskyHandle, "sponsor": true }'

export interface RawTaggablePerson {
  _id: string | null
  name: string | null
  links: unknown
  socialTagOptOut: boolean | null
  /** Set by the GDPR erasure (#1162): the person is gone, never tagged. */
  erasedAt?: string | null
  /** A sponsor company's CRM handle (spec §3.3), in place of `links`. */
  blueskyHandle?: string | null
  /** The row is a sponsor company, not a speaker. */
  sponsor?: boolean | null
}

/**
 * People as the checks see them. `forClient` blanks an opted-out speaker's
 * handle, so their links never reach the browser (spec §3.2): the button
 * only needs to know they said no.
 */
export function taggablePeopleFrom(
  rows: readonly (RawTaggablePerson | null)[] | null | undefined,
  options: { forClient?: boolean } = {},
): TaggablePerson[] {
  const seen = new Set<string>()
  return (rows ?? []).flatMap((row): TaggablePerson[] => {
    if (!row?._id || seen.has(row._id)) return []
    // An erased speaker keeps the document and the talk refs but is nobody
    // to tag: off the roster, so a tag still recorded for them is refused
    // as not a speaker here, and the button does not list them.
    if (row.erasedAt) return []
    seen.add(row._id)
    const sponsor = row.sponsor === true
    // A sponsor has no opt-out (spec §3.3).
    const optedOut = !sponsor && row.socialTagOptOut === true
    const links = Array.isArray(row.links)
      ? row.links.filter((l): l is string => typeof l === 'string')
      : null
    const sponsorHandle =
      sponsor && row.blueskyHandle
        ? parseBlueskyHandle(row.blueskyHandle)
        : null
    // An opted-out speaker's links never reach the browser (spec §3.2).
    const handles = sponsor
      ? sponsorHandle
        ? [sponsorHandle]
        : []
      : optedOut && options.forClient
        ? []
        : blueskyHandlesFromLinks(links)
    return [
      {
        speakerId: row._id,
        ...(sponsor ? { sponsor: true as const } : {}),
        name: row.name ?? '',
        handle: handles[0] ?? null,
        ...(options.forClient ? {} : { handles }),
        optedOut,
      },
    ]
  })
}

/**
 * Every speaker with a talk at this conference, with the handle from their
 * links and their opt-out, then every company sponsoring it, with its CRM
 * handle (spec §3.3): what a body's `@handle`s are matched against.
 *
 * `sponsor` is an ORG-level document shared across editions, so it is only
 * reached through a `sponsorForConference` of THIS conference: another
 * edition's sponsor — or another tenant's — is a stranger here.
 */
export async function getConferenceTaggablePeople(
  conferenceId: string,
): Promise<TaggablePerson[]> {
  const [speakers, sponsors] = await Promise.all([
    scopedFetch<(RawTaggablePerson | null)[] | null>(
      clientReadUncached,
      { conferenceId },
      `*[_type == "talk" && !(_id in path("drafts.**")) && !(_id in path("versions.**"))].speakers[]->${PERSON_FIELDS}`,
      {},
      { cache: 'no-store' },
    ),
    scopedFetch<(RawTaggablePerson | null)[] | null>(
      clientReadUncached,
      { conferenceId },
      `*[_type == "sponsorForConference" && !(_id in path("drafts.**")) && !(_id in path("versions.**"))].sponsor->${SPONSOR_FIELDS}`,
      {},
      { cache: 'no-store' },
    ),
  ])
  return taggablePeopleFrom([...(speakers ?? []), ...(sponsors ?? [])])
}

/** The variant's recorded mentions, whole (the publish projection keeps only DIDs). */
export async function getVariantMentionRecords(
  variantId: string,
  conferenceId: string,
): Promise<MentionRecord[]> {
  const rows = await scopedFetch<(RawMentionRecord | null)[] | null>(
    clientReadUncached,
    { conferenceId },
    `*[_type == "socialPostVariant" && _id == $variantId][0].mentions[]${MENTION_RECORD_PROJECTION}`,
    { variantId },
    { cache: 'no-store' },
  )
  return mentionRecordsFrom(rows)
}

/**
 * A Bluesky publishing Task's subject's people — a speaker, a talk's
 * speakers in the talk's order, or a sponsor company — for the tag button. Gated like the
 * "Tag by hand" list: the subject reference may point at any speaker or
 * talk, so only a speaker with a talk HERE, or a talk of this conference,
 * yields anyone. Embedded in the Task editor read; `$conferenceId` is bound
 * by `scopedFetch`.
 */
export const TAG_PEOPLE_PROJECTION = `select(kind == "publishing" && channel == "bluesky" => subject->{
  "people": select(
    _type == "speaker" && count(*[_type == "talk" && conference._ref == $conferenceId && ^._id in speakers[]._ref && !(_id in path("drafts.**")) && !(_id in path("versions.**"))]) > 0 => [${PERSON_FIELDS}],
    _type == "talk" && conference._ref == $conferenceId && !(_id in path("drafts.**")) && !(_id in path("versions.**")) => speakers[]->${PERSON_FIELDS},
    _type == "sponsor" && count(*[_type == "sponsorForConference" && conference._ref == $conferenceId && sponsor._ref == ^._id && !(_id in path("drafts.**")) && !(_id in path("versions.**"))]) > 0 => [${SPONSOR_FIELDS}]
  )
})`

export interface RawTagPeople {
  people: (RawTaggablePerson | null)[] | null
}

export async function getTaskTagPeople(
  taskId: string,
  conferenceId: string,
): Promise<TaggablePerson[]> {
  const row = await scopedFetch<{ tagPeople: RawTagPeople | null } | null>(
    clientReadUncached,
    { conferenceId },
    `*[_type == "marketingTask" && _id == $taskId && !(_id in path("drafts.**")) && !(_id in path("versions.**"))][0]{ "tagPeople": ${TAG_PEOPLE_PROJECTION} }`,
    { taskId },
    { cache: 'no-store' },
  )
  return taggablePeopleFrom(row?.tagPeople?.people)
}
