// The Sanity source: plain types and SanityCfpSource. No tenancy import, so a
// site test can load it.
import type { SanityClient } from '@sanity/client'

/** Bindings the data layer needs; the generated WorkerEnv extends it. */
export interface DataEnv {
  SANITY_PROJECT_ID: string
  SANITY_DATASET: string
  /** wrangler secret put SANITY_API_TOKEN_READ (per environment) */
  SANITY_API_TOKEN_READ: string
}

export interface Tenant {
  orgId: string
  conferenceId: string
}

export interface Option {
  value: string
  label: string
}
export interface CfpTopic {
  id: string
  title: string | null
  description: string | null
  color: string | null
}
/**
 * Who presents a talk: an id and a display name, nothing else. Speaker
 * identity is undecided (#2022); this reference is all a client may rely on.
 */
export interface SpeakerRef {
  id: string
  name: string | null
}
/** A confirmed talk: the CFP's public outcome. Details live in program. */
export interface CfpTalk {
  id: string
  title: string | null
  format: string | null
  level: string | null
  language: string | null
  audiences: string[]
  topicIds: string[]
  speakers: SpeakerRef[]
}
export interface Cfp {
  topics: CfpTopic[]
  talks: CfpTalk[]
}

/** Where CFP data comes from. Every read is for one tenant. */
export interface CfpSource {
  /** Null when the tenant has no such conference. */
  cfp(t: Tenant): Promise<Cfp | null>
}

// Public means `status == "confirmed"`, as on the site (listPublicTalks) and
// in program: an accepted talk the speaker has not confirmed is not public,
// nor is any draft, submitted, waitlisted, rejected or withdrawn proposal.
// Each root filter carries the tenant predicate literally, so review and
// tenancy/no-unscoped-groq both see it. Speakers project to id and name only.
export const TALKS = `*[_type == "talk" && conference._ref == $conferenceId && conference->organization._ref == $orgId && status == "confirmed"] | order(title asc){
      _id, title, format, level, language, audiences,
      "topicIds": topics[]._ref,
      "speakers": speakers[]->{ _id, name }
    }`
// Topics are B-group (CONFERENCE_FIELDS.md: conference_topics) but nothing in
// D1 serves them yet; switch this read when they move.
export const CONFERENCE = `*[_type == "conference" && _id == $conferenceId && organization._ref == $orgId][0]{
      "topics": topics[]->{ _id, title, description, color }
    }`
const BOTH = `{ "conference": ${CONFERENCE}, "talks": ${TALKS} }`

type Row = Record<string, unknown>
const s = (v: unknown) => (typeof v === 'string' && v.trim()) || null
const list = (v: unknown) =>
  Array.isArray(v) ? (v as Row[]).filter((x) => x != null) : []
const strs = (v: unknown) =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []

export class SanityCfpSource implements CfpSource {
  constructor(private readonly sanity: Pick<SanityClient, 'fetch'>) {}

  async cfp(t: Tenant): Promise<Cfp | null> {
    const r = await this.sanity.fetch<Row | null>(BOTH, { ...t })
    const conf = r?.conference as Row | null | undefined
    if (!conf) return null
    // Allowlist mapping: a field Sanity returns that is not named here
    // never reaches the schema.
    return {
      topics: list(conf.topics)
        .filter((x) => x._id)
        .map((x) => ({
          id: x._id as string,
          title: s(x.title),
          description: s(x.description),
          color: s(x.color),
        })),
      talks: list(r?.talks)
        .filter((x) => x._id)
        .map((x) => ({
          id: x._id as string,
          title: s(x.title),
          format: s(x.format),
          level: s(x.level),
          language: s(x.language),
          audiences: strs(x.audiences),
          topicIds: strs(x.topicIds),
          speakers: list(x.speakers)
            .filter((p) => p._id)
            .map((p) => ({ id: p._id as string, name: s(p.name) })),
        })),
    }
  }
}
