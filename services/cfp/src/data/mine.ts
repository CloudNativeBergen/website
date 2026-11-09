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
import { OPTIONS, type Tenant } from './source'

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
  // The site's Status.deleted: still listed to its speakers (getProposals has
  // no status filter), never counted, never editable.
  'deleted',
] as const
export type Status = (typeof STATUS)[number]

/**
 * A speaker on the talk as the site's speaker portal shows them
 * (src/lib/proposal/data/sanity.ts getProposal). The site shows every
 * speaker's email to the talk's other speakers (ProposalForm.tsx, the
 * speaker list; ProposalCoSpeaker.tsx), so it is visible here only to a
 * speaker of the same talk, which every read already requires.
 */
export interface MySpeaker {
  id: string
  name: string | null
  image: string | null
  slug: string | null
  email: string | null
  /** Shown next to every speaker (ProposalCoSpeaker.tsx speaker list). */
  title: string | null
  /**
   * The caller's OWN entry only: the editor renders bio, links and consent in
   * SpeakerDetailsForm for the signed-in speaker (resolveEditorSpeaker) and
   * never for a co-speaker, so they are null on everyone else's entry.
   */
  bio: string | null
  links: string[]
  consent: Consent | null
}
/** The consents SpeakerDetailsForm shows: each one's `granted`. */
export interface Consent {
  dataProcessing: boolean
  marketing: boolean
  publicProfile: boolean
  photography: boolean
}
export interface Attachment {
  key: string
  kind: 'file' | 'url'
  attachmentType: string | null
  title: string | null
  description: string | null
  filename: string | null
  url: string | null
  uploadedAt: string | null
}
export interface Invitation {
  id: string
  invitedEmail: string | null
  invitedName: string | null
  status: string
  expiresAt: string | null
  createdAt: string | null
  respondedAt: string | null
  /** ProposalCoSpeaker shows it on a declined invite. */
  declineReason: string | null
  /** ProposalCoSpeaker's reminder cooldown. */
  lastRemindedAt: string | null
}
export interface ScheduleInfo {
  date: string | null
  trackTitle: string | null
  startTime: string | null
  endTime: string | null
}
/** Portable Text blocks, as validated by `toPortableText`. */
export type Blocks = Row[]

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
  speakers: MySpeaker[]
  description: Blocks | null
  tos: boolean
  withdrawnReason: string | null
  conference: { id: string }
  scheduleInfo: ScheduleInfo | null
  attachments: Attachment[]
  coSpeakerInvitations: Invitation[]
  createdAt: string | null
  updatedAt: string | null
}
export interface ProposalFields {
  title?: string | null
  abstract?: string | null
  /** Portable Text; validated and turned into `abstract` for the rules. */
  description?: unknown
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
    readonly code:
      | 'NOT_FOUND'
      | 'FORBIDDEN'
      | 'BAD_USER_INPUT'
      | 'CONFLICT'
      | 'SERVICE_UNAVAILABLE',
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
  !['draft', 'withdrawn', 'canceled', 'rejected', 'deleted'].includes(s)
const ACCEPTED: Status[] = ['accepted', 'confirmed']
const AFTER_ACCEPTANCE = new Set(['title', 'abstract', 'description'])
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
  validateFields(p, storedCapacity)
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
}

/**
 * Checks that hold for drafts too (the site's draft schema keeps the enums,
 * the capacity bounds and the speaker capacity): any field that is set.
 */
export function validateFields(
  p: ProposalFields,
  storedCapacity?: number | null,
) {
  const bad = (m: string) => no('BAD_USER_INPUT', m)
  if (p.title != null && !p.title.trim()) bad('Title is required')
  for (const [k, list, m] of [
    ['language', 'languages', 'Language must be specified'],
    ['format', 'formats', 'Format must be specified'],
    ['level', 'levels', 'Level must be specified'],
  ] as const)
    if (p[k] != null && !values(list).includes(p[k]!)) bad(m)
  const aud = values('audiences')
  if (p.audiences && !p.audiences.every((a) => aud.includes(a)))
    bad('At least one audience must be specified')
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

// ---- Portable Text ---------------------------------------------------------

// The site's proposal editor schema (src/components/PortableTextEditor.tsx):
// these styles, lists, decorators and a link annotation, nothing else.
const STYLES = new Set(['normal', 'h1', 'h2', 'h3'])
const LISTS = new Set(['bullet', 'number'])
const DECORATORS = new Set(['strong', 'em', 'underline'])
const MAX_BLOCKS = 200
const MAX_JSON = 50_000
const isObj = (v: unknown): v is Row =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const keyOf = (v: unknown) =>
  typeof v === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(v) ? v : key()

/**
 * Validates Portable Text from a caller and rebuilds it from allowed parts
 * only: unknown keys are dropped, an unknown block type, style, list, mark
 * or link scheme is refused. Text length is capped by the abstract rule.
 */
export function toPortableText(v: unknown): Blocks {
  const bad = (m: string) => no('BAD_USER_INPUT', `Description: ${m}`)
  if (!Array.isArray(v)) return bad('must be a list of blocks')
  if (v.length > MAX_BLOCKS) bad('too many blocks')
  if (JSON.stringify(v).length > MAX_JSON) bad('too large')
  return v.map((b) => {
    if (!isObj(b) || b._type !== 'block') return bad('only text blocks')
    const style = b.style ?? 'normal'
    if (typeof style !== 'string' || !STYLES.has(style)) bad('style')
    if (b.listItem != null && !LISTS.has(b.listItem as string)) bad('list')
    if (
      b.level != null &&
      !(
        Number.isInteger(b.level) &&
        (b.level as number) >= 1 &&
        (b.level as number) <= 5
      )
    )
      bad('list level')
    const markDefs = (b.markDefs ?? []) as unknown
    if (!Array.isArray(markDefs)) return bad('markDefs')
    const defs = markDefs.map((d) => {
      if (!isObj(d) || d._type !== 'link' || typeof d._key !== 'string')
        return bad('only link annotations')
      if (
        typeof d.href !== 'string' ||
        !/^(https?:|mailto:)/i.test(d.href) ||
        d.href.length > 2000
      )
        bad('links must be http(s) or mailto')
      return { _type: 'link', _key: d._key, href: d.href }
    })
    const defKeys = new Set(defs.map((d) => d._key))
    if (!Array.isArray(b.children) || !b.children.length) return bad('children')
    const children = b.children.map((c: unknown) => {
      if (!isObj(c) || c._type !== 'span' || typeof c.text !== 'string')
        return bad('only text spans')
      const marks = (c.marks ?? []) as unknown
      if (
        !Array.isArray(marks) ||
        !marks.every(
          (m) => typeof m === 'string' && (DECORATORS.has(m) || defKeys.has(m)),
        )
      )
        bad('marks')
      return { _type: 'span', _key: keyOf(c._key), text: c.text, marks }
    })
    return {
      _type: 'block',
      _key: keyOf(b._key),
      style,
      markDefs: defs,
      children,
      ...(b.listItem != null && { listItem: b.listItem, level: b.level ?? 1 }),
    }
  })
}

/** `description` (Portable Text) wins over `abstract`; both is an error. */
function withDescription(p: ProposalFields): ProposalFields {
  if (p.description == null) {
    const { description, ...rest } = p
    void description
    return rest
  }
  if (p.abstract != null)
    no('BAD_USER_INPUT', 'Send description or abstract, not both')
  const blocks = toPortableText(p.description)
  return { ...p, description: blocks, abstract: toText(blocks) ?? '' }
}

// ---- Sanity ----------------------------------------------------------------

// The site's read models, copied verbatim (a service cannot import src/):
// src/lib/speaker/image-groq.ts SPEAKER_IMAGE_URL, and from
// src/lib/proposal/data/sanity.ts COSPEAKER_INVITATIONS_PROJECTION and
// SCHEDULE_INFO_PROJECTION.
const SPEAKER_IMAGE_URL = `coalesce(
  image.asset->url + select(
    defined(image.crop) || defined(image.hotspot) =>
      "?rect=" + string(round(coalesce(image.crop.left, 0) * image.asset->metadata.dimensions.width))
      + "," + string(round(coalesce(image.crop.top, 0) * image.asset->metadata.dimensions.height))
      + "," + string(round((1 - coalesce(image.crop.left, 0) - coalesce(image.crop.right, 0)) * image.asset->metadata.dimensions.width))
      + "," + string(round((1 - coalesce(image.crop.top, 0) - coalesce(image.crop.bottom, 0)) * image.asset->metadata.dimensions.height))
      + "&fp-x=" + string(coalesce(image.hotspot.x, 0.5))
      + "&fp-y=" + string(coalesce(image.hotspot.y, 0.5)),
    ""
  ),
  imageURL
)`
// groq-global-scoped: parent-keyed — `proposal._ref == ^._id` bounds the read
// to invitations of the enclosing talk, which is tenant- and speaker-scoped.
const INVITATIONS = `"coSpeakerInvitations": *[_type == "coSpeakerInvitation" && proposal._ref == ^._id]{
        _id, invitedEmail, invitedName, status, expiresAt, createdAt, respondedAt, declineReason, lastRemindedAt
      }`
// groq-global-scoped: parent-correlated — `conference._ref == ^.conference._ref`
// binds the schedule read to the enclosing, already scoped talk's conference.
const SCHEDULE_INFO = `"scheduleInfo": select(
        (status == "accepted" || status == "confirmed") => {
          "talkId": _id,
          "schedule": *[_type == "schedule" && conference._ref == ^.conference._ref && (status == "official" || !defined(status)) && ^._id in tracks[].talks[].talk._ref] | order(date asc) [0]
        } {
          "date": schedule.date,
          "trackTitle": schedule.tracks[^.talkId in talks[].talk._ref][0].trackTitle,
          "timeSlot": schedule.tracks[^.talkId in talks[].talk._ref][0].talks[talk._ref == ^.talkId][0]{ startTime, endTime }
        }
      )`
const FIELDS = `_id, _rev, _createdAt, _updatedAt, status, title, description, format, level, language, audiences,
      "topicIds": topics[]._ref, outline, prerequisites, capacity,
      tos, withdrawnReason, "conferenceId": conference._ref,
      "speakers": speakers[]->{ _id, name, email, title, bio, links, consent, "slug": slug.current, "image": ${SPEAKER_IMAGE_URL} },
      "attachments": attachments[]{ _key, _type, attachmentType, title, description, filename, url, uploadedAt, "fileUrl": file.asset->url },
      ${INVITATIONS},
      ${SCHEDULE_INFO}`
// Every root filter carries the tenant AND the speaker predicate literally.
export const MINE = `*[_type == "talk" && conference._ref == $conferenceId && conference->organization._ref == $orgId && $speakerId in speakers[]._ref] | order(_updatedAt desc){
      ${FIELDS}
    }`
// The seats a capacity change may not go below (the site's changeCapacity).
export const SEATS_TAKEN = `count(*[_type == "workshopSignup" && workshop._ref == $id && conference._ref == $conferenceId && status == "confirmed" && !(_id in path("drafts.**"))])`
export const ONE = `*[_type == "talk" && _id == $id && conference._ref == $conferenceId && conference->organization._ref == $orgId && $speakerId in speakers[]._ref][0]{
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
const rows = (v: unknown) =>
  (Array.isArray(v) ? (v as Row[]) : []).filter(isObj)
/** The site applies expiry on read (effectiveInvitationStatus). */
const invitationStatus = (i: Row, now: Date) =>
  i.status === 'pending' &&
  typeof i.expiresAt === 'string' &&
  new Date(i.expiresAt) < now
    ? 'expired'
    : (s(i.status) ?? 'pending')
const schedule = (v: unknown): ScheduleInfo | null => {
  if (!isObj(v) || !v.date) return null
  const slot = isObj(v.timeSlot) ? v.timeSlot : {}
  return {
    date: s(v.date),
    trackTitle: s(v.trackTitle),
    startTime: s(slot.startTime),
    endTime: s(slot.endTime),
  }
}
const granted = (c: Row, k: string) =>
  isObj(c[k]) && (c[k] as Row).granted === true
const consent = (v: unknown): Consent => {
  const c = isObj(v) ? v : {}
  return {
    dataProcessing: granted(c, 'dataProcessing'),
    marketing: granted(c, 'marketing'),
    publicProfile: granted(c, 'publicProfile'),
    photography: granted(c, 'photography'),
  }
}
// Allowlist mapping: nothing Sanity returns beyond these reaches the schema.
const toProposal = (r: Row, speakerId: string, now: Date): Stored => {
  const people = rows(r.speakers).filter((p) => p._id)
  // PII: emails only to a speaker of this talk (the query already requires
  // it; this holds if a read ever drops that predicate).
  const onTalk = people.some((p) => p._id === speakerId)
  return {
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
    speakers: people.map((p) => ({
      id: p._id as string,
      name: s(p.name),
      image: s(p.image),
      slug: s(p.slug),
      email: onTalk ? s(p.email) : null,
      title: s(p.title),
      // PII: the caller's own profile fields, never a co-speaker's.
      ...(p._id === speakerId
        ? { bio: s(p.bio), links: strs(p.links), consent: consent(p.consent) }
        : { bio: null, links: [], consent: null }),
    })),
    description: Array.isArray(r.description)
      ? (r.description as Blocks)
      : null,
    tos: r.tos === true,
    withdrawnReason: s(r.withdrawnReason),
    conference: { id: r.conferenceId as string },
    scheduleInfo: schedule(r.scheduleInfo),
    attachments: rows(r.attachments).map((a) => ({
      key: String(a._key ?? ''),
      kind: a._type === 'urlAttachment' ? 'url' : 'file',
      attachmentType: s(a.attachmentType),
      title: s(a.title),
      description: s(a.description),
      filename: s(a.filename),
      url: s(a.url) ?? s(a.fileUrl),
      uploadedAt: s(a.uploadedAt),
    })),
    coSpeakerInvitations: rows(r.coSpeakerInvitations).map((i) => ({
      id: String(i._id),
      invitedEmail: s(i.invitedEmail),
      invitedName: s(i.invitedName),
      status: invitationStatus(i, now),
      expiresAt: s(i.expiresAt),
      createdAt: s(i.createdAt),
      respondedAt: s(i.respondedAt),
      declineReason: s(i.declineReason),
      lastRemindedAt: s(i.lastRemindedAt),
    })),
    createdAt: s(r._createdAt),
    updatedAt: s(r._updatedAt),
  }
}
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
  if (Array.isArray(p.description)) doc.description = p.description
  else if (p.abstract != null) doc.description = toBlocks(p.abstract)
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
    /** False until the Worker has SANITY_API_TOKEN_WRITE: reads work, writes refuse. */
    private readonly writable = true,
  ) {}

  private assertWritable() {
    if (!this.writable)
      no('SERVICE_UNAVAILABLE', 'Proposal changes are not enabled yet')
  }

  private async load(w: Who, id: string) {
    const r = await this.sanity.fetch<Row | null>(ONE, { ...w, id })
    return r?._id
      ? toProposal(r, w.speakerId, this.now())
      : no('NOT_FOUND', NOT_FOUND)
  }

  async list(w: Who) {
    const rows = await this.sanity.fetch<Row[]>(MINE, { ...w })
    return (rows ?? [])
      .filter((r) => r?._id)
      .map((r) => strip(toProposal(r, w.speakerId, this.now())))
  }

  async get(w: Who, id: string) {
    return strip(await this.load(w, id))
  }

  async submit(w: Who, raw: ProposalFields, link: SpeakerLink) {
    this.assertWritable()
    const input = withDescription(raw)
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
          // Weak: erasure finds the talk through `references()` (#2078).
          speaker: { _type: 'reference', _ref: w.speakerId, _weak: true },
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

  async update(w: Who, id: string, raw: ProposalFields) {
    this.assertWritable()
    const input = withDescription(raw)
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
      else {
        validateFields(input, cur.capacity)
        if (!merged.title?.trim()) no('BAD_USER_INPUT', 'Title is required')
      }
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
    // #2211: capacity changes only reach here for a draft or submitted talk
    // (accepted ones may change title and abstract only), and the site's
    // changeCapacity promotes the waitlist only for a confirmed workshop, so
    // there is nothing to promote; what is left of it is the refusal below
    // the seats taken. No sign-up can land meanwhile: only a listed
    // (confirmed) workshop takes them, and a status change fails the
    // ifRevisionId below.
    if (
      input.capacity != null &&
      input.capacity !== cur.capacity &&
      (cur.status === 'draft' || cur.status === 'submitted')
    ) {
      const taken = await this.sanity.fetch<number>(SEATS_TAKEN, { ...w, id })
      if (input.capacity < taken)
        no(
          'CONFLICT',
          `Cannot reduce capacity below current signup count (${taken})`,
        )
    }
    // ifRevisionId: a change between the rule check and the write fails.
    await this.sanity
      .patch(id)
      .set(toDoc(input))
      .ifRevisionId(cur.rev)
      .commit()
      .catch(() => no('CONFLICT', 'The proposal changed; reload and retry'))
    return this.get(w, id)
  }

  async withdraw(w: Who, id: string, reason: string) {
    this.assertWritable()
    const why = reason.trim()
    // The site requires a reason (#212, requireWithdrawalReason).
    if (!why)
      no('BAD_USER_INPUT', 'A reason is required to withdraw a proposal.')
    if (why.length > 2000) no('BAD_USER_INPUT', 'reason is too long')
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
      .set({ status: 'withdrawn', withdrawnReason: why })
      .ifRevisionId(cur.rev)
      .commit()
      .catch(() => no('CONFLICT', 'The proposal changed; reload and retry'))
    return this.get(w, id)
  }
}
