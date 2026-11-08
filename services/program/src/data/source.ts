// The Sanity source: plain types and SanityProgramSource. No tenancy import,
// so the site's parity test can load it.
import type { SanityClient } from '@sanity/client'
// Pure GROQ string constants, shared verbatim with the site.
import { SPEAKER_IMAGE_URL } from '../../../../src/lib/speaker/image-groq'
import { OFFICIAL_SCHEDULE_FILTER } from '../../../../src/lib/speaker/schedule-groq'
import {
  PUBLIC_SPEAKER_GALLERY,
  PUBLIC_TALK_FIELDS,
  SCHEDULE_TRACKS,
} from '../../../../src/lib/proposal/public-groq'

/** Bindings the data layer needs; the generated WorkerEnv extends it. */
export interface DataEnv {
  SANITY_PROJECT_ID: string
  SANITY_DATASET: string
  /** wrangler secret put SANITY_API_TOKEN_READ (per environment) */
  SANITY_API_TOKEN_READ: string
  /** konf-conference's ProgramDate entrypoint: programDate is D1-owned (#2023). */
  CONFERENCE: {
    programDate(orgId: string, conferenceId: string): Promise<string | null>
  }
}

export interface SpeakerRef {
  id: string
  name: string | null
  slug: string | null
  title: string | null
  image: string | null
}
export interface Topic {
  id: string
  title: string | null
  slug: string | null
  color: string | null
  description: string | null
}
/** A talk attachment. Every attachment is public on the site's profile. */
export interface Attachment {
  /** The Sanity array `_key`. */
  key: string | null
  kind: 'file' | 'url'
  attachmentType: string | null
  title: string | null
  description: string | null
  filename: string | null
  url: string | null
}
/** Where and when a talk is scheduled. Hidden until programDate. */
export interface ScheduleInfo {
  date: string | null
  trackTitle: string | null
  startTime: string | null
  endTime: string | null
}
export interface Talk {
  /** Null on an unconfirmed program slot's talk. */
  id: string | null
  title: string | null
  /** Portable Text as JSON (Sanity shape). */
  description: string | null
  format: string | null
  level: string | null
  language: string | null
  /** The four lists are null when the talk has no such field, as in Sanity. */
  audiences: string[] | null
  topics: Topic[] | null
  attachments: Attachment[] | null
  speakers: SpeakerRef[] | null
  scheduleInfo: ScheduleInfo | null
  /** Whether, never which (#1472). Only the program read projects it. */
  hasFeedbackCode: boolean | null
}
export interface Track {
  name: string | null
  description: string | null
  /** The track sponsor's document id (weak reference). */
  sponsorId: string | null
}
export interface Slot {
  start: string | null
  end: string | null
  /** A break's label, when there is no talk. */
  placeholder: string | null
  /** The track the slot is in; the site names the room by its track title. */
  room: string | null
  track: Track
  /**
   * Null for a break. A talk that is not confirmed keeps only its format
   * (the TBA card); its title, description, language, speakers, level,
   * audiences and topics stay null, exactly as SCHEDULE_TRACKS projects it.
   */
  talk: Talk | null
  /** The slot had a talk reference, resolved or not (TBA vs service session). */
  hasTalkRef: boolean
  /** Public status class of the slot's talk; null when none resolved. */
  talkStatus: TalkStatus | null
  /** Index of the slot's track within the day, and of the slot within it. */
  trackIndex: number
  position: number
}
/** confirmed; withdrawn, canceled or rejected; anything else. */
export type TalkStatus = 'CONFIRMED' | 'WITHDRAWN' | 'PENDING'
export interface Day {
  /** The schedule document id. */
  id: string | null
  date: string
  slots: Slot[]
}
export interface GalleryImage {
  id: string
  url: string | null
  alt: string | null
  photographer: string | null
  date: string | null
  location: string | null
  featured: boolean
  /** The Sanity image object `{asset, hotspot, crop, alt}` as JSON. */
  image: string | null
  speakers: { id: string; name: string | null; slug: string | null }[]
}
/** The public profile: nothing private (no email, phone, consent). */
export interface Speaker {
  id: string
  name: string | null
  slug: string | null
  title: string | null
  bio: string | null
  image: string | null
  links: string[]
  /** Only the flags the site shows publicly. */
  flags: string[]
  galleryImages: GalleryImage[]
  /** The speaker document's `_updatedAt` (sitemap lastModified). */
  updatedAt: string | null
  /** Confirmed talks in the tenant's conference. */
  talks: Talk[]
}

export interface Tenant {
  orgId: string
  conferenceId: string
}

/** Where program data comes from. Every read is for one tenant. */
export interface ProgramSource {
  /** Official schedule days, in date order. The caller gates on programDate. */
  program(t: Tenant): Promise<Day[]>
  /** A confirmed talk of the tenant's conference, else null. */
  talk(t: Tenant, id: string): Promise<Talk | null>
  /** Speakers with a confirmed talk in the tenant's conference. */
  speakers(t: Tenant): Promise<Speaker[]>
  speaker(t: Tenant, id: string): Promise<Speaker | null>
  speakerBySlug(t: Tenant, slug: string): Promise<Speaker | null>
}

/** The site's public speaker badge (speaker/[slug]/page.tsx): local only. */
export const PUBLIC_FLAGS = ['local']

// Public visibility is the site's own (#1887): a talk is public once
// `status == "confirmed"` (src/lib/proposal/data/sanity.ts listPublicTalks,
// src/lib/conference/query.ts EXPANDED_SCHEDULES); an accepted talk is not
// until the speaker confirms. The org predicate pins the conference to the
// envelope's org, so a conference id from another org matches nothing.
// Every root filter carries `conference._ref == $conferenceId &&
// conference->organization._ref == $orgId` literally, so review and
// tenancy/no-unscoped-groq both see it. Projections are the site's own
// (src/lib/proposal/public-groq.ts), so both return the same shape.
// groq-global-scoped: the talks are those of ^ speaker in $conferenceId of $orgId.
const SPEAKER_TALKS = `*[_type == "talk" && references(^._id) && status == "confirmed" && conference._ref == $conferenceId && conference->organization._ref == $orgId] | order(title asc) { ${PUBLIC_TALK_FIELDS} }`
// Explicit projection: only these fields ever leave Sanity.
const SPEAKER_FIELDS = `_id, _updatedAt, name, "slug": slug.current, title, bio, links,
  "flags": flags[@ in ${JSON.stringify(PUBLIC_FLAGS)}], "image": ${SPEAKER_IMAGE_URL},
  "galleryImages": ${PUBLIC_SPEAKER_GALLERY},
  "talks": ${SPEAKER_TALKS}`

const PROGRAM = `*[_type == "schedule" && conference._ref == $conferenceId && conference->organization._ref == $orgId && ${/* groq-global-scoped: the tenant predicate is literal beside it; this is a status constant */ OFFICIAL_SCHEDULE_FILTER}] | order(date asc) {
    _id,
    date,
    ${SCHEDULE_TRACKS}
  }`
const TALK = `*[_type == "talk" && _id == $id && status == "confirmed" && conference._ref == $conferenceId && conference->organization._ref == $orgId][0]{ ${PUBLIC_TALK_FIELDS} }`
// groq-global-scoped: only a speaker with a confirmed talk in $conferenceId
// of $orgId matches (the nested count carries the tenant predicate).
const SPEAKERS = `*[_type == "speaker" && count(*[_type == "talk" && references(^._id) && status == "confirmed" && conference._ref == $conferenceId && conference->organization._ref == $orgId]) > 0] | order(name asc) { ${SPEAKER_FIELDS} }`
// groq-global-scoped: only a speaker with a confirmed talk in $conferenceId
// of $orgId matches (the nested count carries the tenant predicate).
const SPEAKER = `*[_type == "speaker" && _id == $id && count(*[_type == "talk" && references(^._id) && status == "confirmed" && conference._ref == $conferenceId && conference->organization._ref == $orgId]) > 0][0]{ ${SPEAKER_FIELDS} }`
// groq-global-scoped: only a speaker with a confirmed talk in $conferenceId
// of $orgId matches (the nested count carries the tenant predicate).
const SPEAKER_BY_SLUG = `*[_type == "speaker" && slug.current == $slug && count(*[_type == "talk" && references(^._id) && status == "confirmed" && conference._ref == $conferenceId && conference->organization._ref == $orgId]) > 0][0]{ ${SPEAKER_FIELDS} }`

type Row = Record<string, unknown>
const s = (v: unknown) => (typeof v === 'string' && v.trim()) || null
const list = (v: unknown) =>
  Array.isArray(v) ? (v as Row[]).filter((x) => x != null) : []
const strings = (v: unknown) =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
/** `slug` arrives as a string (`slug.current`) or as the raw slug object. */
const slug = (v: unknown) =>
  s(v) ?? s((v as { current?: unknown } | null)?.current)

/** null for a missing field, so the site can tell it from an empty list. */
const orNull = <T>(v: unknown, f: (v: unknown) => T): T | null =>
  v == null ? null : f(v)

const toSpeakerRef = (r: Row): SpeakerRef => ({
  id: r._id as string,
  name: s(r.name),
  slug: slug(r.slug),
  title: s(r.title),
  image: s(r.image),
})
const toAttachment = (r: Row): Attachment => ({
  key: s(r._key),
  kind: r._type === 'fileAttachment' ? 'file' : 'url',
  attachmentType: s(r.attachmentType),
  title: s(r.title),
  description: s(r.description),
  filename: s(r.filename),
  url: s(r.url),
})
const toScheduleInfo = (r: unknown): ScheduleInfo | null => {
  const x = r as Row | null
  if (!x?.date) return null
  const slot = (x.timeSlot ?? {}) as Row
  return {
    date: s(x.date),
    trackTitle: s(x.trackTitle),
    startTime: s(slot.startTime),
    endTime: s(slot.endTime),
  }
}
const toTalk = (r: Row): Talk => ({
  id: r._id as string,
  title: s(r.title),
  description: r.description ? JSON.stringify(r.description) : null,
  format: s(r.format),
  level: s(r.level),
  language: s(r.language),
  audiences: orNull(r.audiences, strings),
  topics:
    orNull(r.topics, list)
      ?.filter((t) => t._id)
      .map((t) => ({
        id: t._id as string,
        title: s(t.title),
        slug: slug(t.slug),
        color: s(t.color),
        description: s(t.description),
      })) ?? null,
  attachments: orNull(r.attachments, list)?.map(toAttachment) ?? null,
  speakers:
    orNull(r.speakers, list)
      ?.filter((sp) => sp._id)
      .map(toSpeakerRef) ?? null,
  scheduleInfo: toScheduleInfo(r.scheduleInfo),
  hasFeedbackCode:
    typeof r.hasFeedbackCode === 'boolean' ? r.hasFeedbackCode : null,
})
const talkStatus = (v: unknown): TalkStatus =>
  v === 'confirmed'
    ? 'CONFIRMED'
    : v === 'withdrawn' || v === 'canceled' || v === 'rejected'
      ? 'WITHDRAWN'
      : 'PENDING'
const toSpeaker = (r: Row): Speaker => ({
  ...toSpeakerRef(r),
  bio: s(r.bio),
  links: strings(r.links),
  flags: strings(r.flags).filter((f) => PUBLIC_FLAGS.includes(f)),
  galleryImages: list(r.galleryImages)
    .filter((g) => g._id)
    .map((g) => ({
      id: g._id as string,
      url: s(g.imageUrl),
      alt: s(g.imageAlt),
      photographer: s(g.photographer),
      date: s(g.date),
      location: s(g.location),
      featured: g.featured === true,
      image: g.image ? JSON.stringify(g.image) : null,
      speakers: list(g.speakers)
        .filter((x) => x._id)
        .map((x) => ({
          id: x._id as string,
          name: s(x.name),
          slug: slug(x.slug),
        })),
    })),
  updatedAt: s(r._updatedAt),
  talks: list(r.talks).map(toTalk),
})

/** Oslo's calendar date, the site's isProgramPublished clock. */
export const osloToday = (now: Date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Oslo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)

export class SanityProgramSource implements ProgramSource {
  constructor(private readonly sanity: Pick<SanityClient, 'fetch'>) {}

  async program(t: Tenant): Promise<Day[]> {
    const days = await this.sanity.fetch<Row[]>(PROGRAM, { ...t })
    return list(days).map((d) => ({
      id: s(d._id),
      date: d.date as string,
      slots: list(d.tracks)
        .flatMap((tr, trackIndex) => {
          const track: Track = {
            name: s(tr.trackTitle),
            description: s(tr.trackDescription),
            sponsorId: s((tr.sponsor as Row | null)?._ref),
          }
          return list(tr.talks).map((sl, position): Slot => {
            const talk = (sl.talk as Row | null)?._id ? (sl.talk as Row) : null
            return {
              start: s(sl.startTime),
              end: s(sl.endTime),
              placeholder: s(sl.placeholder),
              room: track.name,
              track,
              // An unconfirmed talk arrives without title, description,
              // language, speakers, level, audiences and topics (SCHEDULE_TRACKS). Null them here too,
              // independent of the projection (second layer). The id goes as
              // well: the talk(id) root and the profile never know an
              // unconfirmed talk, so no id leads anywhere.
              talk: talk
                ? talk.status === 'confirmed'
                  ? toTalk(talk)
                  : {
                      ...toTalk(talk),
                      id: null,
                      title: null,
                      description: null,
                      language: null,
                      speakers: null,
                      attachments: null,
                      level: null,
                      audiences: null,
                      topics: null,
                    }
                : null,
              hasTalkRef: sl.hasTalkRef === true,
              talkStatus: talk ? talkStatus(talk.status) : null,
              trackIndex,
              position,
            }
          })
        })
        .sort((a, b) => (a.start ?? '').localeCompare(b.start ?? '')),
    }))
  }

  async talk(t: Tenant, id: string) {
    const r = await this.sanity.fetch<Row | null>(TALK, { ...t, id })
    return r ? toTalk(r) : null
  }

  async speakers(t: Tenant) {
    return list(await this.sanity.fetch<Row[]>(SPEAKERS, { ...t })).map(
      toSpeaker,
    )
  }

  async speaker(t: Tenant, id: string) {
    const r = await this.sanity.fetch<Row | null>(SPEAKER, { ...t, id })
    return r ? toSpeaker(r) : null
  }

  async speakerBySlug(t: Tenant, slug: string) {
    const r = await this.sanity.fetch<Row | null>(SPEAKER_BY_SLUG, {
      ...t,
      slug,
    })
    return r ? toSpeaker(r) : null
  }
}
