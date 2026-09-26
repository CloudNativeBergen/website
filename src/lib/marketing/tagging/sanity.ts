/**
 * The reads the save and approval checks (tagging spec §4.3, §4.4) and the
 * editor's tag button (§2) need. Every read is tenant-scoped through
 * `scopedFetch`, and the caller has proven any id it passes belongs to the
 * request's conference BEFORE calling (guard before fetch).
 */

import { clientReadUncached } from '@/lib/sanity/client'
import { scopedFetch } from '@/lib/sanity/scoped'
import { blueskyHandleFromLinks } from './handle'
import type { TaggablePerson } from './checks'
import type { MentionRecord } from './body'
import {
  MENTION_RECORD_PROJECTION,
  mentionRecordsFrom,
  type RawMentionRecord,
} from './records'

/** What the checks read off a speaker: `RawTaggablePerson`. */
const PERSON_FIELDS = '{ _id, name, links, socialTagOptOut }'

export interface RawTaggablePerson {
  _id: string | null
  name: string | null
  links: unknown
  socialTagOptOut: boolean | null
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
    seen.add(row._id)
    const optedOut = row.socialTagOptOut === true
    const links = Array.isArray(row.links)
      ? row.links.filter((l): l is string => typeof l === 'string')
      : null
    return [
      {
        speakerId: row._id,
        name: row.name ?? '',
        handle:
          optedOut && options.forClient ? null : blueskyHandleFromLinks(links),
        optedOut,
      },
    ]
  })
}

/**
 * Every speaker with a talk at this conference, with the handle from their
 * links and their opt-out: what a body's `@handle`s are matched against.
 */
export async function getConferenceTaggablePeople(
  conferenceId: string,
): Promise<TaggablePerson[]> {
  const rows = await scopedFetch<(RawTaggablePerson | null)[] | null>(
    clientReadUncached,
    { conferenceId },
    `*[_type == "talk" && !(_id in path("drafts.**")) && !(_id in path("versions.**"))].speakers[]->${PERSON_FIELDS}`,
    {},
    { cache: 'no-store' },
  )
  return taggablePeopleFrom(rows)
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
 * A Bluesky publishing Task's subject's people — a speaker, or a talk's
 * speakers in the talk's order — for the tag button. Gated like the
 * "Tag by hand" list: the subject reference may point at any speaker or
 * talk, so only a speaker with a talk HERE, or a talk of this conference,
 * yields anyone. Embedded in the Task editor read; `$conferenceId` is bound
 * by `scopedFetch`.
 */
export const TAG_PEOPLE_PROJECTION = `select(kind == "publishing" && channel == "bluesky" => subject->{
  "people": select(
    _type == "speaker" && count(*[_type == "talk" && conference._ref == $conferenceId && ^._id in speakers[]._ref && !(_id in path("drafts.**")) && !(_id in path("versions.**"))]) > 0 => [${PERSON_FIELDS}],
    _type == "talk" && conference._ref == $conferenceId && !(_id in path("drafts.**")) && !(_id in path("versions.**")) => speakers[]->${PERSON_FIELDS}
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
