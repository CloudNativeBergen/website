// Public data layer. createData is the ONLY export resolvers see: it returns
// a Scoped repository, never the Sanity client.
//
// The store sits behind ProgramSource (DATA_OWNERSHIP rule 3, step 1: proxy
// Sanity, the data does not move). A D1 source implements the same interface
// later; the schema only sees the plain types below.
import { createClient, type SanityClient } from '@sanity/client'
import { ScopedRepository, type Envelope } from '@runkonf/tenancy'
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
}
/** A talk attachment. Every attachment is public on the site's profile. */
export interface Attachment {
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
  id: string
  title: string | null
  /** Portable Text as JSON (Sanity shape). */
  description: string | null
  format: string | null
  level: string | null
  language: string | null
  audiences: string[]
  topics: Topic[]
  attachments: Attachment[]
  speakers: SpeakerRef[]
  scheduleInfo: ScheduleInfo | null
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
  /** Null for a break, or a talk that is not confirmed (TBA on the site). */
  talk: Talk | null
}
export interface Day {
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
const SPEAKER_FIELDS = `_id, name, "slug": slug.current, title, bio, links,
  "flags": flags[@ in ${JSON.stringify(PUBLIC_FLAGS)}], "image": ${SPEAKER_IMAGE_URL},
  "galleryImages": ${PUBLIC_SPEAKER_GALLERY},
  "talks": ${SPEAKER_TALKS}`

const PROGRAM = `*[_type == "schedule" && conference._ref == $conferenceId && conference->organization._ref == $orgId && ${/* groq-global-scoped: the tenant predicate is literal beside it; this is a status constant */ OFFICIAL_SCHEDULE_FILTER}] | order(date asc) {
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

const toSpeakerRef = (r: Row): SpeakerRef => ({
  id: r._id as string,
  name: s(r.name),
  slug: slug(r.slug),
  title: s(r.title),
  image: s(r.image),
})
const toAttachment = (r: Row): Attachment => ({
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
  audiences: strings(r.audiences),
  topics: list(r.topics)
    .filter((t) => t._id)
    .map((t) => ({
      id: t._id as string,
      title: s(t.title),
      slug: slug(t.slug),
      color: s(t.color),
    })),
  attachments: list(r.attachments).map(toAttachment),
  speakers: list(r.speakers)
    .filter((sp) => sp._id)
    .map(toSpeakerRef),
  scheduleInfo: toScheduleInfo(r.scheduleInfo),
})
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
    })),
  talks: list(r.talks).map(toTalk),
})

/** Oslo's calendar date, the site's isProgramPublished clock. */
const osloToday = (now: Date) =>
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
      date: d.date as string,
      slots: list(d.tracks)
        .flatMap((tr) => {
          const track: Track = {
            name: s(tr.trackTitle),
            description: s(tr.trackDescription),
            sponsorId: s((tr.sponsor as Row | null)?._ref),
          }
          return list(tr.talks).map((sl): Slot => {
            const talk = sl.talk as Row | null
            return {
              start: s(sl.startTime),
              end: s(sl.endTime),
              placeholder: s(sl.placeholder),
              room: track.name,
              track,
              talk: talk?.status === 'confirmed' ? toTalk(talk) : null,
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

/** Talk without its schedule (withoutUnpublishedSchedule). */
const unscheduled = (t: Talk): Talk => ({ ...t, scheduleInfo: null })

/** The envelope's tenant, never one the caller names. */
class Program extends ScopedRepository {
  private open?: Promise<boolean>

  constructor(
    private readonly source: ProgramSource,
    private readonly programDate: DataEnv['CONFERENCE']['programDate'],
    envelope: Envelope,
  ) {
    super(envelope)
  }

  private get t(): Tenant | null {
    const { org_id, conference_id } = this.columns
    return conference_id ? { orgId: org_id, conferenceId: conference_id } : null
  }

  /**
   * On or after programDate (src/lib/conference/state.ts
   * isProgramPublished), read from D1 whatever the source, once per request.
   * Fails closed: no date, or a failed read, is not published.
   */
  private published(t: Tenant): Promise<boolean> {
    return (this.open ??= this.programDate(t.orgId, t.conferenceId).then(
      (date) => !!date && osloToday(new Date()) >= date,
      (e: unknown) => {
        console.error('program: programDate read failed', e)
        return false
      },
    ))
  }

  /** Strip every talk's scheduleInfo before programDate. */
  private async gate<T>(t: Tenant, v: T, strip: (v: T) => T): Promise<T> {
    return (await this.published(t)) ? v : strip(v)
  }
  private gateSpeaker = (sp: Speaker): Speaker => ({
    ...sp,
    talks: sp.talks.map(unscheduled),
  })

  async program(): Promise<Day[]> {
    const t = this.t
    if (!t || !(await this.published(t))) return []
    return this.source.program(t)
  }
  async talk(id: string) {
    const t = this.t
    if (!t) return null
    const talk = await this.source.talk(t, id)
    return talk && this.gate(t, talk, unscheduled)
  }
  async speakers() {
    const t = this.t
    if (!t) return []
    return this.gate(t, await this.source.speakers(t), (l) =>
      l.map(this.gateSpeaker),
    )
  }
  async speaker(id: string) {
    const t = this.t
    if (!t) return null
    const sp = await this.source.speaker(t, id)
    return sp && this.gate(t, sp, this.gateSpeaker)
  }
  async speakerBySlug(slug: string) {
    const t = this.t
    if (!t) return null
    const sp = await this.source.speakerBySlug(t, slug)
    return sp && this.gate(t, sp, this.gateSpeaker)
  }
}

export function createData(env: DataEnv, envelope: Envelope) {
  const source = new SanityProgramSource(
    createClient({
      projectId: env.SANITY_PROJECT_ID,
      dataset: env.SANITY_DATASET,
      apiVersion: '2023-05-03',
      useCdn: true,
      // The dataset is private: no token reads nothing.
      token: env.SANITY_API_TOKEN_READ,
      requestTagPrefix: 'program.read',
    }),
  )
  // async: a missing binding rejects, so published() fails closed.
  const programDate: DataEnv['CONFERENCE']['programDate'] = async (o, c) =>
    env.CONFERENCE.programDate(o, c)
  // Built on first use: the constructor refuses a PlatformContext, and that
  // should fail the resolver, not the whole request. One per request, so
  // programDate is read once.
  let program: Program | undefined
  return {
    program: () => (program ??= new Program(source, programDate, envelope)),
  }
}
