// Public data layer. createData is the ONLY export resolvers see: it returns
// a Scoped repository, never the Sanity client.
//
// The store sits behind ProgramSource (DATA_OWNERSHIP rule 3, step 1: proxy
// Sanity, the data does not move). A D1 source implements the same interface
// later; the schema only sees the plain types below.
import { createClient, type SanityClient } from '@sanity/client'
import { ScopedRepository, type Envelope } from '@runkonf/tenancy'
// Pure GROQ string constants, reused verbatim from the site.
import { SPEAKER_IMAGE_URL } from '../../../../src/lib/speaker/image-groq'
import { OFFICIAL_SCHEDULE_FILTER } from '../../../../src/lib/speaker/schedule-groq'

/** Bindings the data layer needs; the generated WorkerEnv extends it. */
export interface DataEnv {
  SANITY_PROJECT_ID: string
  SANITY_DATASET: string
  /** wrangler secret put SANITY_API_TOKEN_READ (per environment) */
  SANITY_API_TOKEN_READ: string
}

export interface SpeakerRef {
  id: string
  name: string | null
}
export interface Talk {
  id: string
  title: string | null
  format: string | null
  level: string | null
  speakers: SpeakerRef[]
}
export interface Slot {
  start: string | null
  end: string | null
  /** Null for a break, or a talk that is not confirmed (TBA on the site). */
  talk: Talk | null
}
export interface Day {
  date: string
  slots: Slot[]
}
/** The public profile: nothing private (no email, phone, consent, flags). */
export interface Speaker {
  id: string
  name: string | null
  title: string | null
  bio: string | null
  image: string | null
  links: string[]
}

export interface Tenant {
  orgId: string
  conferenceId: string
}

/** Where program data comes from. Every read is for one tenant. */
export interface ProgramSource {
  /** Official schedule days, in date order. Empty before `programDate`. */
  program(t: Tenant): Promise<Day[]>
  /** A confirmed talk of the tenant's conference, else null. */
  talk(t: Tenant, id: string): Promise<Talk | null>
  /** Speakers with a confirmed talk in the tenant's conference. */
  speakers(t: Tenant): Promise<Speaker[]>
  speaker(t: Tenant, id: string): Promise<Speaker | null>
}

// Public visibility is the site's own (#1887): a talk is public once
// `status == "confirmed"` (src/lib/proposal/data/sanity.ts listPublicTalks,
// src/lib/conference/query.ts EXPANDED_SCHEDULES); an accepted talk is not
// until the speaker confirms. The org predicate pins the conference to the
// envelope's org, so a conference id from another org matches nothing.
const TENANT = `conference._ref == $conferenceId && conference->organization._ref == $orgId`
const PUBLIC_TALK = `_type == "talk" && status == "confirmed" && ${TENANT}`
const TALK_FIELDS = `_id, title, format, level, speakers[]->{_id, name}`

const PROGRAM = `{
  "programDate": *[_type == "conference" && _id == $conferenceId && organization._ref == $orgId][0].programDate,
  "days": *[_type == "schedule" && ${TENANT} && ${OFFICIAL_SCHEDULE_FILTER}] | order(date asc) {
    date,
    tracks[]{ talks[]{ startTime, endTime, talk->{ status, status == "confirmed" => { ${TALK_FIELDS} } } } }
  }
}`
const TALK = `*[${PUBLIC_TALK} && _id == $id][0]{ ${TALK_FIELDS} }`
// Explicit projection: only these fields ever leave Sanity.
const SPEAKER_FIELDS = `_id, name, title, bio, links, "image": ${SPEAKER_IMAGE_URL}`
const SPEAKERS = `*[_type == "speaker" && count(*[${PUBLIC_TALK} && references(^._id)]) > 0] | order(name asc) { ${SPEAKER_FIELDS} }`
const SPEAKER = `*[_type == "speaker" && _id == $id && count(*[${PUBLIC_TALK} && references(^._id)]) > 0][0]{ ${SPEAKER_FIELDS} }`

type Row = Record<string, unknown>
const s = (v: unknown) => (typeof v === 'string' && v.trim()) || null
const list = (v: unknown) => (Array.isArray(v) ? (v as Row[]) : [])

const toTalk = (r: Row): Talk => ({
  id: r._id as string,
  title: s(r.title),
  format: s(r.format),
  level: s(r.level),
  speakers: list(r.speakers)
    .filter((sp) => sp?._id)
    .map((sp) => ({ id: sp._id as string, name: s(sp.name) })),
})
const toSpeaker = (r: Row): Speaker => ({
  id: r._id as string,
  name: s(r.name),
  title: s(r.title),
  bio: s(r.bio),
  image: s(r.image),
  links: Array.isArray(r.links)
    ? r.links.filter((l): l is string => typeof l === 'string')
    : [],
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
  constructor(
    private readonly sanity: Pick<SanityClient, 'fetch'>,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async program(t: Tenant): Promise<Day[]> {
    const r = await this.sanity.fetch<{ programDate?: string; days?: Row[] }>(
      PROGRAM,
      { ...t },
    )
    // src/lib/conference/state.ts isProgramPublished: nothing before programDate.
    // ponytail: reads Sanity's programDate; a tenant whose dates moved to D1
    // (#2019) needs the conference subgraph's value here.
    if (!r?.programDate || osloToday(this.now()) < r.programDate) return []
    return list(r.days).map((d) => ({
      date: d.date as string,
      slots: list(d.tracks)
        .flatMap((tr) => list(tr.talks))
        .map((sl) => {
          const talk = sl.talk as Row | null
          return {
            start: s(sl.startTime),
            end: s(sl.endTime),
            talk: talk?.status === 'confirmed' ? toTalk(talk) : null,
          }
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
}

/** The envelope's tenant, never one the caller names. */
class Program extends ScopedRepository {
  constructor(
    private readonly source: ProgramSource,
    envelope: Envelope,
  ) {
    super(envelope)
  }

  private get t(): Tenant | null {
    const { org_id, conference_id } = this.columns
    return conference_id ? { orgId: org_id, conferenceId: conference_id } : null
  }

  program() {
    return this.t ? this.source.program(this.t) : Promise.resolve([])
  }
  talk(id: string) {
    return this.t ? this.source.talk(this.t, id) : Promise.resolve(null)
  }
  speakers() {
    return this.t ? this.source.speakers(this.t) : Promise.resolve([])
  }
  speaker(id: string) {
    return this.t ? this.source.speaker(this.t, id) : Promise.resolve(null)
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
  // Built on first use: the constructor refuses a PlatformContext, and that
  // should fail the resolver, not the whole request.
  return { program: () => new Program(source, envelope) }
}
