// A speaker's own proposals (#2078): types, GROQ, the rules and the Sanity
// source. No tenancy import, so a site test can load it.
//
// AUTHORIZATION is the resource fact "this user is a speaker of this talk"
// (docs/AUTHORIZATION.md §3.3, phase 3b), checked in the query itself:
// `$speakerId in speakers[]._ref` sits next to the tenant predicate, so a
// foreign, another conference's or a nonexistent id all read as nothing and
// the caller gets one NOT_FOUND. `can()` does not exist in packages/tenancy
// yet; when it lands, `isSpeaker` below becomes its talk arm.
//
// The site's rules, mirrored (src/server/routers/proposal.ts update/action,
// src/server/proposalSubmission.ts, src/server/schemas/proposal.ts), with
// decision 9 on top: after acceptance only title and abstract, until the
// program is published.
import type { SanityClient } from '@sanity/client'
import { OPTIONS, type SpeakerRef, type Tenant } from './source'

/** konf-identity `SpeakerLink`: safe match keys and the profile. */
export interface SpeakerLink {
  providers: string[]
  emails: string[]
  profile: {
    name: string
    bio: string
    links: string[]
    photoKey: string | null
  } | null
}
/** konf-conference `ProgramDate.cfpWindow`: null for no published conference. */
export interface CfpWindow {
  cfpStartDate: string | null
  cfpEndDate: string | null
  programDate: string | null
  startDate: string | null
}

export const STATUS = [
  'draft',
  'submitted',
  'accepted',
  'waitlisted',
  'confirmed',
  'rejected',
  'withdrawn',
  'canceled',
] as const
export type Status = (typeof STATUS)[number]

/** The speaker's own view: their text and status. No review, score or note. */
export interface MyProposal {
  id: string
  status: Status
  title: string | null
  abstract: string | null
  format: string | null
  level: string | null
  language: string | null
  audiences: string[]
  topicIds: string[]
  outline: string | null
  prerequisites: string | null
  capacity: number | null
  speakers: SpeakerRef[]
}
export interface ProposalFields {
  title?: string | null
  abstract?: string | null
  format?: string | null
  level?: string | null
  language?: string | null
  audiences?: string[] | null
  topicIds?: string[] | null
  outline?: string | null
  prerequisites?: string | null
  capacity?: number | null
  tos?: boolean | null
}

export class ProposalError extends Error {
  constructor(
    readonly code: 'NOT_FOUND' | 'FORBIDDEN' | 'BAD_USER_INPUT' | 'CONFLICT',
    message: string,
  ) {
    super(message)
  }
}
const no = (code: ProposalError['code'], m: string): never => {
  throw new ProposalError(code, m)
}
export const NOT_FOUND = 'Proposal not found'

// ---- the speaker link ------------------------------------------------------

// groq-global: a speaker document is not tenant-scoped; the match keys come
// from identity for the envelope's own user, never from the caller.
export const SPEAKERS_BY_KEYS = `*[_type == "speaker" && !(_id in path("drafts.**")) && !defined(erasedAt) && (count(providers[@ in $providers]) > 0 || count(knownEmails[lower(@) in $emails]) > 0)]{
      _id, providers, knownEmails, "granted": ticketEmailGrants[].email
    }`

type Row = Record<string, unknown>
const strs = (v: unknown) =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
const lower = (v: unknown) => strs(v).map((e) => e.trim().toLowerCase())

/**
 * The user's Sanity speaker, matched on the site's safe keys (#2094, #1914):
 * a linked provider account, or a login-verified `knownEmails` entry that an
 * organizer did not add off a ticket. The display email and slug never match.
 * More than one match is ambiguous and matches nothing (fail closed).
 */
export function pickSpeaker(rows: Row[], link: SpeakerLink): string | null {
  const providers = new Set(link.providers)
  const emails = new Set(link.emails)
  const hits = rows.filter((r) => {
    if (strs(r.providers).some((p) => providers.has(p))) return true
    const granted = new Set(lower(r.granted))
    return lower(r.knownEmails).some((e) => emails.has(e) && !granted.has(e))
  })
  return hits.length === 1 ? (hits[0]._id as string) : null
}

// ---- rules -----------------------------------------------------------------

const osloToday = (now: Date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Oslo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)

/** Both dates set and today inside them (Oslo days, inclusive). Unknown is closed. */
export const cfpOpen = (w: CfpWindow | null, now: Date) =>
  !!w?.cfpStartDate &&
  !!w.cfpEndDate &&
  osloToday(now) >= w.cfpStartDate &&
  osloToday(now) <= w.cfpEndDate

/** On or after programDate. A failed read (undefined) counts as published. */
export const programPublished = (w: CfpWindow | null | undefined, now: Date) =>
  w === undefined || (!!w?.programDate && osloToday(now) >= w.programDate)

/** Self-withdrawal closes 14 days before the event (#251). */
const withdrawalCutoff = (w: CfpWindow | null, now: Date) => {
  const start = w?.startDate ? new Date(w.startDate).getTime() : NaN
  return !Number.isNaN(start) && start - now.getTime() <= 14 * 864e5
}

/** The site's speaker transitions to withdrawn (state-machine.ts). */
const WITHDRAWABLE: Status[] = [
  'submitted',
  'accepted',
  'waitlisted',
  'confirmed',
]
const ACTIVE = (s: Status) =>
  !['draft', 'withdrawn', 'canceled', 'rejected'].includes(s)
const ACCEPTED: Status[] = ['accepted', 'confirmed']
const AFTER_ACCEPTANCE = new Set(['title', 'abstract'])
const MAX_PROPOSALS = 3
const MAX_SPEAKER_CAPACITY = 200
const MAX_CAPACITY = 500

const values = (k: keyof typeof OPTIONS) => OPTIONS[k].map((o) => o.value)
const isWorkshop = (f: string | null | undefined) =>
  f === 'workshop_120' || f === 'workshop_240'

/**
 * ProposalInputSchema's strict rules (submitted proposals), plus
 * `assertSpeakerCapacity`. Messages are the site's; none echoes a value.
 */
export function validate(p: ProposalFields, storedCapacity?: number | null) {
  const bad = (m: string) => no('BAD_USER_INPUT', m)
  if (!p.title?.trim()) bad('Title is required')
  if (!p.abstract?.trim()) bad('Description cannot be empty')
  if (!p.language || !values('languages').includes(p.language))
    bad('Language must be specified')
  if (!p.format || !values('formats').includes(p.format))
    bad('Format must be specified')
  if (!p.level || !values('levels').includes(p.level))
    bad('Level must be specified')
  const aud = values('audiences')
  if (!p.audiences?.length || !p.audiences.every((a) => aud.includes(a)))
    bad('At least one audience must be specified')
  if (!p.topicIds?.length) bad('At least one topic is required')
  if (p.tos !== true) bad('Terms of Service must be accepted')
  if (p.prerequisites?.trim() && !isWorkshop(p.format))
    bad('Prerequisites are only allowed for workshop formats')
  const c = p.capacity
  if (c != null) {
    if (!Number.isInteger(c) || c < 1 || c > MAX_CAPACITY)
      bad(`Capacity must be a whole number from 1 to ${MAX_CAPACITY}`)
    if (c > MAX_SPEAKER_CAPACITY && c !== storedCapacity)
      bad(
        `Capacity cannot exceed ${MAX_SPEAKER_CAPACITY} participants. Ask the organizers for more.`,
      )
  }
  for (const k of ['title', 'outline', 'prerequisites'] as const)
    if ((p[k]?.length ?? 0) > 2000) bad(`${k} is too long`)
  if ((p.abstract?.length ?? 0) > 10000) bad('Description is too long')
}

// ---- Sanity ----------------------------------------------------------------

const FIELDS = `_id, _rev, status, title, description, format, level, language, audiences,
      "topicIds": topics[]._ref, outline, prerequisites, capacity,
      "speakers": speakers[]->{ _id, name }`
// Every root filter carries the tenant AND the speaker predicate literally.
export const MINE = `*[_type == "talk" && conference._ref == $conferenceId && conference->organization._ref == $orgId && $speakerId in speakers[]._ref && status != "deleted"] | order(_createdAt desc){
      ${FIELDS}
    }`
export const ONE = `*[_type == "talk" && _id == $id && conference._ref == $conferenceId && conference->organization._ref == $orgId && $speakerId in speakers[]._ref && status != "deleted"][0]{
      ${FIELDS}
    }`
export const CONFERENCE_CFP = `*[_type == "conference" && _id == $conferenceId && organization._ref == $orgId][0]{
      formats, "topicIds": topics[]._ref
    }`

// Portable text <-> plain text: the API speaks paragraphs.
const toText = (v: unknown) => {
  const text = (Array.isArray(v) ? (v as Row[]) : [])
    .filter((b) => b?._type === 'block')
    .map((b) =>
      (Array.isArray(b.children) ? (b.children as Row[]) : [])
        .map((c) => (typeof c.text === 'string' ? c.text : ''))
        .join(''),
    )
    .join('\n\n')
  return text.trim() || null
}
const key = () => crypto.randomUUID().replace(/-/g, '').slice(0, 12)
export const toBlocks = (text: string) =>
  text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => ({
      _type: 'block',
      _key: key(),
      style: 'normal',
      markDefs: [],
      children: [{ _type: 'span', _key: key(), text: p, marks: [] }],
    }))
const ref = (id: string) => ({ _type: 'reference', _ref: id, _key: key() })

const s = (v: unknown) => (typeof v === 'string' && v.trim()) || null
interface Stored extends MyProposal {
  rev: string
}
// Allowlist mapping: nothing Sanity returns beyond these reaches the schema.
const toProposal = (r: Row): Stored => ({
  id: r._id as string,
  rev: r._rev as string,
  status: (STATUS as readonly string[]).includes(r.status as string)
    ? (r.status as Status)
    : 'draft',
  title: s(r.title),
  abstract: toText(r.description),
  format: s(r.format),
  level: s(r.level),
  language: s(r.language),
  audiences: strs(r.audiences),
  topicIds: strs(r.topicIds),
  outline: s(r.outline),
  prerequisites: s(r.prerequisites),
  capacity: typeof r.capacity === 'number' ? r.capacity : null,
  speakers: (Array.isArray(r.speakers) ? (r.speakers as Row[]) : [])
    .filter((p) => p?._id)
    .map((p) => ({ id: p._id as string, name: s(p.name) })),
})
const strip = (p: Stored): MyProposal => {
  const { rev, ...rest } = p
  void rev
  return rest
}

/** The Sanity writes cfp makes; a test backs it with an in-memory dataset. */
export type Writer = Pick<SanityClient, 'fetch' | 'create' | 'patch'>

/** The Sanity document fields a write sets, from API fields. */
function toDoc(p: ProposalFields) {
  const doc: Row = {}
  const set = (k: string, v: unknown) => {
    if (v !== undefined) doc[k] = v
  }
  set('title', p.title?.trim())
  if (p.abstract != null) doc.description = toBlocks(p.abstract)
  set('format', p.format)
  set('level', p.level)
  set('language', p.language)
  set('audiences', p.audiences ?? undefined)
  if (p.topicIds) doc.topics = p.topicIds.map(ref)
  set('outline', p.outline)
  set('prerequisites', p.prerequisites)
  set('capacity', p.capacity)
  set('tos', p.tos ?? undefined)
  return doc
}

export interface Who extends Tenant {
  speakerId: string
}

export class MyProposals {
  constructor(
    private readonly sanity: Writer,
    private readonly window: () => Promise<CfpWindow | null>,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private async load(w: Who, id: string) {
    const r = await this.sanity.fetch<Row | null>(ONE, { ...w, id })
    return r?._id ? toProposal(r) : no('NOT_FOUND', NOT_FOUND)
  }

  async list(w: Who) {
    const rows = await this.sanity.fetch<Row[]>(MINE, { ...w })
    return (rows ?? []).filter((r) => r?._id).map((r) => strip(toProposal(r)))
  }

  async get(w: Who, id: string) {
    return strip(await this.load(w, id))
  }

  async submit(w: Who, input: ProposalFields, link: SpeakerLink) {
    const win = await this.window()
    if (!cfpOpen(win, this.now()))
      no('FORBIDDEN', 'The Call for Papers is closed')
    const conf = await this.sanity.fetch<Row | null>(CONFERENCE_CFP, { ...w })
    if (!strs(conf?.formats).length)
      no('FORBIDDEN', 'This conference has not announced its session formats')
    validate(input)
    const offered = new Set(strs(conf?.topicIds))
    if (!input.topicIds!.every((t) => offered.has(t)))
      no('BAD_USER_INPUT', 'Invalid topic reference')
    const mine = await this.list(w)
    if (mine.filter((p) => ACTIVE(p.status)).length >= MAX_PROPOSALS)
      no(
        'FORBIDDEN',
        'You have reached the maximum of 3 proposals per conference',
      )
    const created = await this.sanity.create({
      _type: 'talk',
      _id: crypto.randomUUID(),
      ...toDoc(input),
      status: 'submitted',
      speakers: [ref(w.speakerId)],
      conference: { _type: 'reference', _ref: w.conferenceId },
      // #2022: the conference keeps what the profile said at submission and
      // never writes back to it. The opaque Sanity speaker id, not the user id.
      ...(link.profile && {
        speakerSnapshot: {
          speaker: w.speakerId,
          name: link.profile.name,
          bio: link.profile.bio,
          links: link.profile.links,
          photoKey: link.profile.photoKey,
          takenAt: this.now().toISOString(),
        },
      }),
    })
    return this.get(w, created._id)
  }

  async update(w: Who, id: string, input: ProposalFields) {
    const cur = await this.load(w, id)
    const now = this.now()
    const keys = Object.keys(input).filter(
      (k) => input[k as keyof ProposalFields] !== undefined,
    )
    if (cur.status === 'draft' || cur.status === 'submitted') {
      if (!cfpOpen(await this.window(), now))
        no(
          'FORBIDDEN',
          'The Call for Papers has closed; contact the organizers',
        )
      const merged = { ...cur, tos: true, ...input }
      if (cur.status === 'submitted') validate(merged, cur.capacity)
      else if (!merged.title?.trim()) no('BAD_USER_INPUT', 'Title is required')
      if (input.topicIds) {
        const conf = await this.sanity.fetch<Row | null>(CONFERENCE_CFP, {
          ...w,
        })
        const ok = new Set([...strs(conf?.topicIds), ...cur.topicIds])
        if (!input.topicIds.every((t) => ok.has(t)))
          no('BAD_USER_INPUT', 'Invalid topic reference')
      }
    } else if (ACCEPTED.includes(cur.status)) {
      // Decision 9: title and abstract only, until the program is published.
      let win: CfpWindow | null | undefined
      try {
        win = await this.window()
      } catch {
        win = undefined
      }
      if (programPublished(win, now))
        no('FORBIDDEN', 'The program is published; contact the organizers')
      if (keys.some((k) => !AFTER_ACCEPTANCE.has(k)))
        no(
          'FORBIDDEN',
          'After acceptance only the title and abstract can change',
        )
      if (input.title !== undefined && !input.title?.trim())
        no('BAD_USER_INPUT', 'Title is required')
      if (input.abstract !== undefined && !input.abstract?.trim())
        no('BAD_USER_INPUT', 'Description cannot be empty')
    } else no('FORBIDDEN', `A ${cur.status} proposal cannot be edited`)
    if (!keys.length) return strip(cur)
    // ifRevisionId: a change between the rule check and the write fails.
    await this.sanity
      .patch(id)
      .set(toDoc(input))
      .ifRevisionId(cur.rev)
      .commit()
      .catch(() => no('CONFLICT', 'The proposal changed; reload and retry'))
    return this.get(w, id)
  }

  async withdraw(w: Who, id: string) {
    const cur = await this.load(w, id)
    if (!WITHDRAWABLE.includes(cur.status))
      no('FORBIDDEN', `A ${cur.status} proposal cannot be withdrawn`)
    if (withdrawalCutoff(await this.window(), this.now()))
      no(
        'FORBIDDEN',
        'Withdrawals are closed within 14 days of the event; contact the organizers',
      )
    await this.sanity
      .patch(id)
      .set({ status: 'withdrawn' })
      .ifRevisionId(cur.rev)
      .commit()
      .catch(() => no('CONFLICT', 'The proposal changed; reload and retry'))
    return this.get(w, id)
  }
}
